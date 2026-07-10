import {
  BadRequestException, ForbiddenException,
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class FeeStructureDto {
  @IsString() name!: string;
  @IsIn(['annual', 'monthly', 'transport', 'library', 'hostel', 'exam', 'other']) category!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() academicYearName?: string;
}

class GenerateInvoicesDto {
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() sectionId?: string;
  @IsOptional() @IsString() studentId?: string;
  @IsArray() @IsString({ each: true }) feeStructureIds!: string[];
  @IsString() dueDate!: string;
  /** split total into N equal installment invoices */
  @IsOptional() @IsInt() @Min(1) @Max(12) installments?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsString() notes?: string;
}

class UpdateInvoiceDto {
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) lateFee?: number;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsIn(['cancelled']) status?: string;
}

export async function invoicePaidAmount(prisma: PrismaService, invoiceId: string): Promise<number> {
  const agg = await prisma.payment.aggregate({
    where: { invoiceId, status: 'success' },
    _sum: { amount: true },
  });
  const refunds = await prisma.payment.aggregate({
    where: { invoiceId, status: 'refunded' },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0) - Number(refunds._sum.amount ?? 0);
}

/** recompute invoice status from its payments (single source of truth) */
export async function syncInvoiceStatus(prisma: PrismaService, invoiceId: string) {
  const invoice = await prisma.feeInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status === 'cancelled') return;
  const paid = await invoicePaidAmount(prisma, invoiceId);
  const totalDue = Number(invoice.totalAmount) - Number(invoice.discount) + Number(invoice.lateFee);
  let status: 'paid' | 'partial' | 'issued' | 'overdue';
  if (paid >= totalDue - 0.001) status = 'paid';
  else if (paid > 0) status = 'partial';
  else status = invoice.dueDate < new Date() ? 'overdue' : 'issued';
  await prisma.feeInvoice.update({ where: { id: invoiceId }, data: { status } });
}

const invoiceInclude = {
  student: {
    select: {
      id: true, admissionNo: true,
      user: { select: { firstName: true, lastName: true } },
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  },
  items: true,
  payments: { orderBy: { paidAt: 'desc' as const } },
} as const;

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ── structures ──
  async listStructures(user: AuthUser) {
    return this.prisma.feeStructure.findMany({
      where: { schoolId: user.schoolId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { class: { select: { id: true, name: true } } },
    });
  }

  async createStructure(user: AuthUser, dto: FeeStructureDto) {
    // parents hold a 'pay_own_child'-scoped create permission — structure writes are staff-only
    if (user.permissionScope === 'pay_own_child') {
      throw new ForbiddenException('Your fees access is limited to paying invoices');
    }
    const s = await this.prisma.feeStructure.create({
      data: { schoolId: user.schoolId, ...dto, classId: dto.classId ?? null },
    });
    await this.audit.log(user, 'fees', 'fee_structure.create', s.id, { name: s.name });
    return s;
  }

  async updateStructure(user: AuthUser, id: string, dto: Partial<FeeStructureDto> & { active?: boolean }) {
    const s = await this.prisma.feeStructure.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!s) throw new NotFoundException('Fee structure not found');
    return this.prisma.feeStructure.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async deleteStructure(user: AuthUser, id: string) {
    const s = await this.prisma.feeStructure.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!s) throw new NotFoundException('Fee structure not found');
    await this.prisma.feeStructure.update({ where: { id }, data: { active: false } });
    return { ok: true, deactivated: true };
  }

  // ── invoices ──
  async listInvoices(user: AuthUser, q: PageQuery & { status?: string; studentId?: string; classId?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const studentScope = await this.scope.studentWhere(user);
    const where = {
      schoolId: user.schoolId,
      student: { ...(studentScope as object) },
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.classId ? { student: { ...(studentScope as object), section: { classId: q.classId } } } : {}),
      ...(q.search
        ? {
            OR: [
              { invoiceNo: { contains: q.search, mode: 'insensitive' as const } },
              { student: { user: { firstName: { contains: q.search, mode: 'insensitive' as const } } } },
              { student: { user: { lastName: { contains: q.search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };
    const [items, total, agg] = await Promise.all([
      this.prisma.feeInvoice.findMany({ where, skip, take, orderBy: { issueDate: 'desc' }, include: invoiceInclude }),
      this.prisma.feeInvoice.count({ where }),
      this.prisma.feeInvoice.aggregate({ where, _sum: { totalAmount: true, discount: true, lateFee: true } }),
    ]);
    // outstanding per listed invoice
    const withPaid = await Promise.all(
      items.map(async (inv) => {
        const paid = inv.payments
          .filter((p) => p.status === 'success')
          .reduce((a, p) => a + Number(p.amount), 0)
          - inv.payments.filter((p) => p.status === 'refunded').reduce((a, p) => a + Number(p.amount), 0);
        const due = Number(inv.totalAmount) - Number(inv.discount) + Number(inv.lateFee);
        return { ...inv, paidAmount: paid, dueAmount: Math.max(0, due - paid) };
      }),
    );
    return {
      ...paged(withPaid, total, page, pageSize),
      totals: {
        invoiced: Number(agg._sum.totalAmount ?? 0),
        discount: Number(agg._sum.discount ?? 0),
        lateFee: Number(agg._sum.lateFee ?? 0),
      },
    };
  }

  async getInvoice(user: AuthUser, id: string) {
    const inv = await this.prisma.feeInvoice.findFirst({
      where: { id, schoolId: user.schoolId },
      include: invoiceInclude,
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    await this.scope.assertStudentAccess(user, inv.studentId);
    const paid = await invoicePaidAmount(this.prisma, id);
    const due = Number(inv.totalAmount) - Number(inv.discount) + Number(inv.lateFee);
    return { ...inv, paidAmount: paid, dueAmount: Math.max(0, due - paid) };
  }

  async generate(user: AuthUser, dto: GenerateInvoicesDto) {
    if (user.permissionScope === 'pay_own_child') {
      throw new ForbiddenException('Your fees access is limited to paying invoices');
    }
    const structures = await this.prisma.feeStructure.findMany({
      where: { id: { in: dto.feeStructureIds }, schoolId: user.schoolId, active: true },
    });
    if (structures.length === 0) throw new BadRequestException('No valid fee structures selected');

    const students = await this.prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        status: 'active',
        ...(dto.studentId ? { id: dto.studentId } : {}),
        ...(dto.sectionId ? { sectionId: dto.sectionId } : {}),
        ...(dto.classId ? { section: { classId: dto.classId } } : {}),
      },
      include: { section: true },
    });
    if (students.length === 0) throw new BadRequestException('No matching students');

    const last = await this.prisma.feeInvoice.count({ where: { schoolId: user.schoolId } });
    let counter = last + 1;
    const year = new Date().getFullYear();
    const installments = dto.installments ?? 1;
    const created: string[] = [];

    for (const s of students) {
      const applicable = structures.filter((st) => !st.classId || st.classId === s.section?.classId);
      if (applicable.length === 0) continue;
      const totalRaw = applicable.reduce((a, st) => a + Number(st.amount), 0);
      const discount = dto.discount ?? 0;
      for (let part = 1; part <= installments; part++) {
        const partTotal = Math.round((totalRaw / installments) * 100) / 100;
        const dueDate = new Date(dto.dueDate);
        dueDate.setMonth(dueDate.getMonth() + (part - 1));
        const inv = await this.prisma.feeInvoice.create({
          data: {
            schoolId: user.schoolId,
            studentId: s.id,
            invoiceNo: `INV-${year}-${String(counter++).padStart(4, '0')}`,
            status: 'issued',
            dueDate,
            totalAmount: partTotal,
            discount: part === 1 ? discount : 0,
            notes: installments > 1 ? `Installment ${part}/${installments}${dto.notes ? ` — ${dto.notes}` : ''}` : (dto.notes ?? null),
            items: {
              create: applicable.map((st) => ({
                feeStructureId: st.id,
                description: installments > 1 ? `${st.name} (installment ${part}/${installments})` : st.name,
                amount: Math.round((Number(st.amount) / installments) * 100) / 100,
              })),
            },
          },
        });
        created.push(inv.id);
      }
    }
    await this.audit.log(user, 'fees', 'invoices.generate', undefined, {
      count: created.length, structures: dto.feeStructureIds,
    });
    return { ok: true, created: created.length };
  }

  async updateInvoice(user: AuthUser, id: string, dto: UpdateInvoiceDto) {
    const inv = await this.prisma.feeInvoice.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'cancelled') throw new BadRequestException('Invoice is cancelled');
    await this.prisma.feeInvoice.update({
      where: { id },
      data: {
        ...(dto.discount !== undefined ? { discount: dto.discount } : {}),
        ...(dto.lateFee !== undefined ? { lateFee: dto.lateFee } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.status === 'cancelled' ? { status: 'cancelled' as never } : {}),
      },
    });
    if (dto.status !== 'cancelled') await syncInvoiceStatus(this.prisma, id);
    await this.audit.log(user, 'fees', 'invoice.update', id, dto as Record<string, unknown>);
    return this.getInvoice(user, id);
  }

  async analytics(user: AuthUser) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { schoolId: user.schoolId, status: { not: 'cancelled' } },
      select: { id: true, totalAmount: true, discount: true, lateFee: true, status: true, dueDate: true },
    });
    const payments = await this.prisma.payment.findMany({
      where: { schoolId: user.schoolId, status: 'success' },
      select: { amount: true, paidAt: true, method: true },
    });
    const refunded = await this.prisma.payment.aggregate({
      where: { schoolId: user.schoolId, status: 'refunded' },
      _sum: { amount: true },
    });

    const invoiced = invoices.reduce((a, i) => a + Number(i.totalAmount) - Number(i.discount) + Number(i.lateFee), 0);
    const collected = payments.reduce((a, p) => a + Number(p.amount), 0) - Number(refunded._sum.amount ?? 0);

    const byStatus: Record<string, number> = {};
    for (const i of invoices) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;

    const byMethod: Record<string, number> = {};
    for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);

    // monthly collection trend (last 6 months)
    const byMonth = new Map<string, number>();
    for (const p of payments) {
      const key = p.paidAt.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amount));
    }
    const trend = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([month, amount]) => ({ month, amount }));

    return {
      invoiced: Math.round(invoiced),
      collected: Math.round(collected),
      outstanding: Math.round(Math.max(0, invoiced - collected)),
      collectionRate: invoiced ? Math.round((collected / invoiced) * 1000) / 10 : 0,
      byStatus,
      byMethod,
      trend,
    };
  }
}

@Controller('fees')
export class FeesController {
  constructor(private readonly svc: FeesService) {}

  @Get('structures')
  @RequirePermission('fees', 'read')
  listStructures(@CurrentUser() user: AuthUser) {
    return this.svc.listStructures(user);
  }

  @Post('structures')
  @RequirePermission('fees', 'create')
  createStructure(@CurrentUser() user: AuthUser, @Body() dto: FeeStructureDto) {
    return this.svc.createStructure(user, dto);
  }

  @Patch('structures/:id')
  @RequirePermission('fees', 'update')
  updateStructure(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<FeeStructureDto> & { active?: boolean }) {
    return this.svc.updateStructure(user, id, dto);
  }

  @Delete('structures/:id')
  @RequirePermission('fees', 'delete')
  deleteStructure(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteStructure(user, id);
  }

  @Get('invoices')
  @RequirePermission('fees', 'read')
  listInvoices(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { status?: string; studentId?: string; classId?: string }) {
    return this.svc.listInvoices(user, q);
  }

  @Get('invoices/:id')
  @RequirePermission('fees', 'read')
  getInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.getInvoice(user, id);
  }

  @Post('generate')
  @RequirePermission('fees', 'create')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateInvoicesDto) {
    return this.svc.generate(user, dto);
  }

  @Patch('invoices/:id')
  @RequirePermission('fees', 'update')
  updateInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.svc.updateInvoice(user, id, dto);
  }

  @Get('analytics')
  @RequirePermission('fees', 'read')
  analytics(@CurrentUser() user: AuthUser) {
    return this.svc.analytics(user);
  }
}

@Module({ controllers: [FeesController], providers: [FeesService] })
export class FeesModule {}
