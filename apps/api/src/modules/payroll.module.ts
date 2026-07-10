import {
  BadRequestException,
  Body, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query, Res,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class GeneratePayrollDto {
  @Matches(/^\d{4}-\d{2}$/) month!: string;
}

class UpdatePayrollDto {
  @IsOptional() @IsNumber() @Min(0) allowances?: number;
  @IsOptional() @IsNumber() @Min(0) deductions?: number;
  @IsOptional() @IsIn(['draft', 'processed', 'paid']) status?: string;
  @IsOptional() @IsString() notes?: string;
}

class LeaveRequestDto {
  @IsIn(['casual', 'sick', 'earned', 'maternity', 'unpaid']) type!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
}

class LeaveDecisionDto {
  @IsIn(['approved', 'rejected']) decision!: string;
}

const payrollInclude = {
  staff: {
    select: {
      id: true, employeeNo: true, department: true, designation: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery & { month?: string; status?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      staff: { schoolId: user.schoolId },
      ...(q.month ? { month: q.month } : {}),
      ...(q.status ? { status: q.status as never } : {}),
    };
    const [items, total, agg] = await Promise.all([
      this.prisma.payroll.findMany({ where, skip, take, orderBy: [{ month: 'desc' }, { staff: { employeeNo: 'asc' } }], include: payrollInclude }),
      this.prisma.payroll.count({ where }),
      this.prisma.payroll.aggregate({ where, _sum: { netSalary: true } }),
    ]);
    return { ...paged(items, total, page, pageSize), netTotal: Number(agg._sum.netSalary ?? 0) };
  }

  /** create draft payroll rows for all staff for a month */
  async generate(user: AuthUser, dto: GeneratePayrollDto) {
    const staff = await this.prisma.staff.findMany({
      where: { schoolId: user.schoolId, user: { status: 'active' } },
    });
    let created = 0;
    for (const s of staff) {
      const exists = await this.prisma.payroll.findUnique({
        where: { staffId_month: { staffId: s.id, month: dto.month } },
      });
      if (exists) continue;
      const base = Number(s.baseSalary);
      const allowances = Math.round(base * 0.1);
      const deductions = Math.round(base * 0.08);
      await this.prisma.payroll.create({
        data: {
          staffId: s.id, month: dto.month, baseSalary: base,
          allowances, deductions, netSalary: base + allowances - deductions, status: 'draft',
        },
      });
      created++;
    }
    await this.audit.log(user, 'payroll', 'payroll.generate', undefined, { month: dto.month, created });
    return { ok: true, created, skipped: staff.length - created };
  }

  async update(user: AuthUser, id: string, dto: UpdatePayrollDto) {
    const row = await this.prisma.payroll.findFirst({
      where: { id, staff: { schoolId: user.schoolId } },
    });
    if (!row) throw new NotFoundException('Payroll record not found');
    if (row.status === 'paid' && dto.status !== 'paid') {
      throw new BadRequestException('Paid payroll records cannot be reopened');
    }
    const allowances = dto.allowances ?? Number(row.allowances);
    const deductions = dto.deductions ?? Number(row.deductions);
    const updated = await this.prisma.payroll.update({
      where: { id },
      data: {
        allowances, deductions,
        netSalary: Number(row.baseSalary) + allowances - deductions,
        ...(dto.status ? { status: dto.status as never } : {}),
        ...(dto.status === 'paid' ? { paidAt: new Date() } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: payrollInclude,
    });
    await this.audit.log(user, 'payroll', 'payroll.update', id, dto as Record<string, unknown>);
    return updated;
  }

  async payslip(user: AuthUser, id: string, res: Response) {
    const row = await this.prisma.payroll.findFirst({
      where: { id, staff: { schoolId: user.schoolId } },
      include: { staff: { include: { user: true, school: true } } },
    });
    if (!row) throw new NotFoundException('Payroll record not found');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 48 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=payslip-${row.month}-${row.staff.employeeNo}.pdf`);
    doc.pipe(res);
    doc.fontSize(18).text(row.staff.school.name, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Payslip — ${row.month}`, { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Employee: ${row.staff.user.firstName} ${row.staff.user.lastName} (${row.staff.employeeNo})`);
    doc.text(`Department: ${row.staff.department ?? '—'}   Designation: ${row.staff.designation ?? '—'}`);
    doc.moveDown();
    doc.text(`Base salary:      ₹ ${Number(row.baseSalary).toFixed(2)}`);
    doc.text(`Allowances:      +₹ ${Number(row.allowances).toFixed(2)}`);
    doc.text(`Deductions:      -₹ ${Number(row.deductions).toFixed(2)}`);
    doc.moveDown(0.5);
    doc.fontSize(13).text(`Net salary:       ₹ ${Number(row.netSalary).toFixed(2)}`);
    doc.moveDown();
    doc.fontSize(10).fillColor('#555').text(`Status: ${row.status}${row.paidAt ? ` (paid ${row.paidAt.toISOString().slice(0, 10)})` : ''}`);
    doc.end();
  }
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery & { status?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    // teachers see only their own leave (scope 'self'); hr/admin see all
    const own = user.permissionScope === 'self';
    const where = {
      staff: { schoolId: user.schoolId },
      ...(own ? { staffId: user.staffId ?? '' } : {}),
      ...(q.status ? { status: q.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          staff: { select: { employeeNo: true, user: { select: { firstName: true, lastName: true } } } },
          approvedBy: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async create(user: AuthUser, dto: LeaveRequestDto) {
    if (!user.staffId) throw new BadRequestException('Only staff can request leave');
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('End date before start date');
    const req = await this.prisma.leaveRequest.create({
      data: {
        staffId: user.staffId, type: dto.type as never,
        startDate: start, endDate: end, reason: dto.reason ?? null,
      },
    });
    await this.audit.log(user, 'leave', 'leave.request', req.id, { type: dto.type });
    return req;
  }

  async decide(user: AuthUser, id: string, dto: LeaveDecisionDto) {
    // deciding requires unscoped update permission (hr/admin/principal)
    if (user.permissionScope === 'self') throw new ForbiddenException('You cannot decide leave requests');
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id, staff: { schoolId: user.schoolId } },
    });
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'pending') throw new BadRequestException('Request already decided');
    const decidedByStaff = user.staffId ?? null;
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: dto.decision as never, approvedById: decidedByStaff, decidedAt: new Date() },
    });
    await this.audit.log(user, 'leave', `leave.${dto.decision}`, id);
    return updated;
  }

  async cancel(user: AuthUser, id: string) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id, staffId: user.staffId ?? '', status: 'pending' },
    });
    if (!req) throw new NotFoundException('Pending request not found');
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: 'cancelled' } });
  }
}

@Controller('payroll')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Get()
  @RequirePermission('payroll', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { month?: string; status?: string }) {
    return this.svc.list(user, q);
  }

  @Post('generate')
  @RequirePermission('payroll', 'create')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GeneratePayrollDto) {
    return this.svc.generate(user, dto);
  }

  @Patch(':id')
  @RequirePermission('payroll', 'update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePayrollDto) {
    return this.svc.update(user, id, dto);
  }

  @Get(':id/payslip')
  @RequirePermission('payroll', 'read')
  payslip(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    return this.svc.payslip(user, id, res);
  }
}

@Controller('leave')
export class LeaveController {
  constructor(private readonly svc: LeaveService) {}

  @Get()
  @RequirePermission('leave', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { status?: string }) {
    return this.svc.list(user, q);
  }

  @Post()
  @RequirePermission('leave', 'create')
  create(@CurrentUser() user: AuthUser, @Body() dto: LeaveRequestDto) {
    return this.svc.create(user, dto);
  }

  @Patch(':id/decide')
  @RequirePermission('leave', 'update')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LeaveDecisionDto) {
    return this.svc.decide(user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('leave', 'create')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.cancel(user, id);
  }
}

@Module({
  controllers: [PayrollController, LeaveController],
  providers: [PayrollService, LeaveService],
})
export class PayrollModule {}
