import {
  BadRequestException,
  Body, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query, Res,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';
import { invoicePaidAmount, syncInvoiceStatus } from './fees.module';

// ─────────────────────────────────────────────────────────────
// Payment gateway provider interface — swap MockGateway for a real
// provider (Razorpay/Stripe/…) without touching the payment flow.
// ─────────────────────────────────────────────────────────────
export interface PaymentGateway {
  readonly name: string;
  createOrder(amountPaise: number, receipt: string): Promise<{ orderId: string; checkoutUrl?: string }>;
  verifyPayment(orderId: string, signature?: string): Promise<{ verified: boolean; txnId: string }>;
}

export class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  async createOrder(amountPaise: number, receipt: string) {
    return { orderId: `mock_order_${receipt}_${randomBytes(6).toString('hex')}` };
  }
  async verifyPayment(orderId: string) {
    // sandbox: every order verifies successfully
    return { verified: true, txnId: `mock_txn_${randomBytes(8).toString('hex')}` };
  }
}

export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';

class RecordPaymentDto {
  @IsString() invoiceId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsIn(['cash', 'card', 'upi', 'bank_transfer', 'cheque']) method!: string;
  @IsOptional() @IsString() reference?: string;
}

class CheckoutDto {
  @IsString() invoiceId!: string;
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
}

class RefundDto {
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsString() reason?: string;
}

@Injectable()
export class PaymentsService {
  private gateway: PaymentGateway = new MockGateway();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  private async nextReceiptNo(schoolId: string): Promise<string> {
    const count = await this.prisma.payment.count({ where: { schoolId } });
    return `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  }

  async list(user: AuthUser, q: PageQuery & { method?: string; status?: string; invoiceId?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const studentScope = await this.scope.studentWhere(user);
    const where = {
      schoolId: user.schoolId,
      invoice: { student: { ...(studentScope as object) } },
      ...(q.method ? { method: q.method as never } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.invoiceId ? { invoiceId: q.invoiceId } : {}),
      ...(q.search ? { receiptNo: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total, sum] = await Promise.all([
      this.prisma.payment.findMany({
        where, skip, take, orderBy: { paidAt: 'desc' },
        include: {
          invoice: {
            select: {
              invoiceNo: true,
              student: { select: { id: true, admissionNo: true, user: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where: { ...where, status: 'success' as never }, _sum: { amount: true } }),
    ]);
    return { ...paged(items, total, page, pageSize), collectedTotal: Number(sum._sum.amount ?? 0) };
  }

  /** accountant/admin records an offline payment */
  async record(user: AuthUser, dto: RecordPaymentDto) {
    const invoice = await this.prisma.feeInvoice.findFirst({
      where: { id: dto.invoiceId, schoolId: user.schoolId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'cancelled') throw new BadRequestException('Invoice is cancelled');
    const paid = await invoicePaidAmount(this.prisma, invoice.id);
    const due = Number(invoice.totalAmount) - Number(invoice.discount) + Number(invoice.lateFee) - paid;
    if (dto.amount > due + 0.001) {
      throw new BadRequestException(`Amount exceeds outstanding balance (${due.toFixed(2)})`);
    }
    const payment = await this.prisma.payment.create({
      data: {
        schoolId: user.schoolId, invoiceId: invoice.id,
        receiptNo: await this.nextReceiptNo(user.schoolId),
        amount: dto.amount, method: dto.method as never, status: 'success',
        reference: dto.reference ?? null, collectedById: user.userId,
      },
    });
    await syncInvoiceStatus(this.prisma, invoice.id);
    await this.audit.log(user, 'payments', 'payment.record', payment.id, {
      invoiceId: invoice.id, amount: dto.amount, method: dto.method,
    });
    return payment;
  }

  /**
   * Parent-initiated online payment (mock gateway).
   * Step 1: checkout → creates a pending payment + gateway order.
   * Step 2: confirm  → verifies with the gateway and marks success.
   */
  async checkout(user: AuthUser, dto: CheckoutDto) {
    const invoice = await this.prisma.feeInvoice.findFirst({
      where: { id: dto.invoiceId, schoolId: user.schoolId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    // parents/students may only pay invoices of their own children/self
    await this.scope.assertStudentAccess(user, invoice.studentId);
    if (invoice.status === 'cancelled' || invoice.status === 'paid') {
      throw new BadRequestException(`Invoice is ${invoice.status}`);
    }
    const paid = await invoicePaidAmount(this.prisma, invoice.id);
    const due = Number(invoice.totalAmount) - Number(invoice.discount) + Number(invoice.lateFee) - paid;
    const amount = dto.amount ?? due;
    if (amount > due + 0.001) throw new BadRequestException(`Amount exceeds outstanding balance (${due.toFixed(2)})`);

    const receiptNo = await this.nextReceiptNo(user.schoolId);
    const order = await this.gateway.createOrder(Math.round(amount * 100), receiptNo);
    const payment = await this.prisma.payment.create({
      data: {
        schoolId: user.schoolId, invoiceId: invoice.id, receiptNo,
        amount, method: 'online_gateway', status: 'pending',
        reference: order.orderId, collectedById: user.userId,
      },
    });
    return { paymentId: payment.id, orderId: order.orderId, gateway: this.gateway.name, amount };
  }

  async confirmCheckout(user: AuthUser, paymentId: string, signature?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, schoolId: user.schoolId, status: 'pending' },
      include: { invoice: true },
    });
    if (!payment) throw new NotFoundException('Pending payment not found');
    await this.scope.assertStudentAccess(user, payment.invoice.studentId);
    const result = await this.gateway.verifyPayment(payment.reference ?? '', signature);
    if (!result.verified) {
      await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'failed' } });
      throw new BadRequestException('Payment verification failed');
    }
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'success', reference: result.txnId, paidAt: new Date() },
    });
    await syncInvoiceStatus(this.prisma, payment.invoiceId);
    await this.audit.log(user, 'payments', 'payment.online_success', paymentId, { txnId: result.txnId });
    return updated;
  }

  async refund(user: AuthUser, paymentId: string, dto: RefundDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, schoolId: user.schoolId, status: 'success' },
    });
    if (!payment) throw new NotFoundException('Successful payment not found');
    const amount = dto.amount ?? Number(payment.amount);
    if (amount > Number(payment.amount)) throw new BadRequestException('Refund exceeds payment amount');
    const refund = await this.prisma.payment.create({
      data: {
        schoolId: user.schoolId, invoiceId: payment.invoiceId,
        receiptNo: await this.nextReceiptNo(user.schoolId),
        amount, method: payment.method, status: 'refunded',
        reference: dto.reason ?? 'refund', refundOfId: payment.id, collectedById: user.userId,
      },
    });
    await syncInvoiceStatus(this.prisma, payment.invoiceId);
    await this.audit.log(user, 'payments', 'payment.refund', refund.id, { of: payment.id, amount });
    return refund;
  }

  async receiptPdf(user: AuthUser, paymentId: string, res: Response) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, schoolId: user.schoolId },
      include: {
        invoice: {
          include: {
            student: { include: { user: true, section: { include: { class: true } } } },
            items: true,
          },
        },
        school: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.scope.assertStudentAccess(user, payment.invoice.studentId);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 48 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${payment.receiptNo}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).text(payment.school.name, { align: 'center' });
    doc.fontSize(10).fillColor('#555').text(payment.school.address ?? '', { align: 'center' });
    doc.moveDown(1.5);
    doc.fillColor('#000').fontSize(14).text(`Payment Receipt — ${payment.receiptNo}`, { underline: true });
    doc.moveDown();
    const s = payment.invoice.student;
    doc.fontSize(11);
    doc.text(`Student: ${s.user.firstName} ${s.user.lastName} (${s.admissionNo})`);
    doc.text(`Class: ${s.section ? `${s.section.class.name}-${s.section.name}` : '—'}`);
    doc.text(`Invoice: ${payment.invoice.invoiceNo}`);
    doc.text(`Date: ${payment.paidAt.toISOString().slice(0, 10)}`);
    doc.text(`Method: ${payment.method}${payment.reference ? ` (${payment.reference})` : ''}`);
    doc.moveDown();
    doc.fontSize(13).text(`Amount ${payment.status === 'refunded' ? 'refunded' : 'paid'}: ₹ ${Number(payment.amount).toFixed(2)}`);
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#777').text('This is a system-generated receipt from EduM.', { align: 'center' });
    doc.end();
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @RequirePermission('payments', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { method?: string; status?: string; invoiceId?: string }) {
    return this.svc.list(user, q);
  }

  @Post()
  @RequirePermission('payments', 'create')
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordPaymentDto) {
    // parents' create permission is scoped to online checkout only
    if (user.permissionScope === 'pay_own_child') {
      throw new ForbiddenException('Use the online checkout to pay invoices');
    }
    return this.svc.record(user, dto);
  }

  @Post('checkout')
  @RequirePermission('payments', 'create')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.svc.checkout(user, dto);
  }

  @Post('checkout/:id/confirm')
  @RequirePermission('payments', 'create')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { signature?: string }) {
    return this.svc.confirmCheckout(user, id, body?.signature);
  }

  @Post(':id/refund')
  @RequirePermission('payments', 'update')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RefundDto) {
    return this.svc.refund(user, id, dto);
  }

  @Get(':id/receipt')
  @RequirePermission('payments', 'read')
  receipt(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    return this.svc.receiptPdf(user, id, res);
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
