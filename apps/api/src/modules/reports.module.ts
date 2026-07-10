import {
  BadRequestException,
  Controller, ForbiddenException, Get, Injectable, Module, Query, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';

type Row = Record<string, string | number | null>;

/** stream rows as CSV / XLSX / simple tabular PDF */
async function exportRows(res: Response, filename: string, title: string, rows: Row[], format: string) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  if (format === 'csv') {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
    res.send(csv);
    return;
  }
  if (format === 'xlsx') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(title.slice(0, 30));
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow(headers.map((h) => r[h])));
    ws.columns.forEach((c: { width?: number }) => (c.width = 18));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
    return;
  }
  if (format === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: headers.length > 6 ? 'landscape' : 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${filename}.pdf`);
    doc.pipe(res);
    doc.fontSize(15).text(title);
    doc.moveDown(0.5);
    const pageWidth = doc.page.width - 72;
    const colWidth = pageWidth / Math.max(1, headers.length);
    const drawRow = (vals: (string | number | null)[], bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      vals.forEach((v, i) => {
        doc.text(v == null ? '' : String(v).slice(0, 28), 36 + i * colWidth, y, { width: colWidth - 4, lineBreak: false });
      });
      doc.moveDown(0.9);
      if (doc.y > doc.page.height - 60) doc.addPage();
    };
    drawRow(headers, true);
    rows.slice(0, 500).forEach((r) => drawRow(headers.map((h) => r[h])));
    if (rows.length > 500) {
      doc.moveDown().fontSize(9).text(`… ${rows.length - 500} more rows (use CSV/XLSX for the full set)`);
    }
    doc.end();
    return;
  }
  res.json({ title, rows });
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  /** role-based report catalog (drives the reports UI) */
  catalog(user: AuthUser) {
    const all = [
      { key: 'attendance', label: 'Attendance report', scopes: ['admin', 'teacher'] },
      { key: 'academic', label: 'Academic / exam results', scopes: ['admin', 'teacher'] },
      { key: 'fees', label: 'Fee collection & outstanding', scopes: ['admin', 'finance'] },
      { key: 'payroll', label: 'Payroll summary', scopes: ['admin', 'staffing', 'finance'] },
      { key: 'transport', label: 'Transport allocation', scopes: ['admin'] },
      { key: 'assets', label: 'Asset register', scopes: ['admin'] },
      { key: 'library', label: 'Library circulation', scopes: ['admin'] },
      { key: 'students', label: 'Student directory', scopes: ['admin', 'teacher'] },
    ];
    const roleScopes: Record<string, string[]> = {
      super_admin: ['admin', 'finance', 'staffing', 'teacher'],
      school_admin: ['admin', 'finance', 'staffing', 'teacher'],
      principal: ['admin', 'finance', 'staffing', 'teacher'],
      vice_principal: ['admin', 'teacher'],
      hr: ['staffing'],
      accountant: ['finance'],
      teacher: ['teacher'],
    };
    const mine = roleScopes[user.role] ?? [];
    return all.filter((r) => r.scopes.some((s) => mine.includes(s)));
  }

  private assertReportAccess(user: AuthUser, key: string) {
    if (!this.catalog(user).some((r) => r.key === key)) {
      throw new ForbiddenException(`Your role cannot run the '${key}' report`);
    }
  }

  async attendance(user: AuthUser, sectionId?: string, from?: string, to?: string): Promise<Row[]> {
    this.assertReportAccess(user, 'attendance');
    const restricted = await this.scope.sectionIdsFor(user);
    if (restricted && sectionId && !restricted.includes(sectionId)) throw new ForbiddenException('No access');
    const where = {
      schoolId: user.schoolId,
      ...(sectionId ? { sectionId } : restricted ? { sectionId: { in: restricted } } : {}),
      ...(from || to
        ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    };
    const students = await this.prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        ...(sectionId ? { sectionId } : restricted ? { sectionId: { in: restricted } } : {}),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        section: { select: { name: true, class: { select: { name: true } } } },
        attendance: { where: (where as { date?: object }).date ? { date: (where as { date?: object }).date as never } : {}, select: { status: true } },
      },
    });
    return students.map((s) => {
      const total = s.attendance.length;
      const count = (st: string) => s.attendance.filter((a) => a.status === st).length;
      const present = count('present') + count('late');
      return {
        admission_no: s.admissionNo,
        student: `${s.user.firstName} ${s.user.lastName}`,
        class: s.section ? `${s.section.class.name}-${s.section.name}` : '',
        days_recorded: total,
        present: count('present'),
        late: count('late'),
        leave: count('leave'),
        absent: count('absent'),
        attendance_pct: total ? Math.round((present / total) * 1000) / 10 : null,
      };
    });
  }

  async academic(user: AuthUser, examId?: string, classId?: string): Promise<Row[]> {
    this.assertReportAccess(user, 'academic');
    const restricted = await this.scope.sectionIdsFor(user);
    const results = await this.prisma.examResult.findMany({
      where: {
        exam: { schoolId: user.schoolId, ...(examId ? { id: examId } : {}) },
        student: {
          ...(classId ? { section: { classId } } : {}),
          ...(restricted ? { sectionId: { in: restricted } } : {}),
        },
      },
      include: {
        exam: { select: { name: true } },
        student: {
          select: {
            admissionNo: true,
            user: { select: { firstName: true, lastName: true } },
            section: { select: { name: true, class: { select: { name: true } } } },
          },
        },
      },
    });
    const subjects = await this.prisma.subject.findMany({ where: { schoolId: user.schoolId } });
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    return results.map((r) => ({
      exam: r.exam.name,
      admission_no: r.student.admissionNo,
      student: `${r.student.user.firstName} ${r.student.user.lastName}`,
      class: r.student.section ? `${r.student.section.class.name}-${r.student.section.name}` : '',
      subject: subjectName.get(r.subjectId) ?? r.subjectId,
      score: Number(r.score),
      max_score: r.maxScore,
      grade: r.grade,
    }));
  }

  async fees(user: AuthUser): Promise<Row[]> {
    this.assertReportAccess(user, 'fees');
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { schoolId: user.schoolId, status: { not: 'cancelled' } },
      include: {
        student: {
          select: {
            admissionNo: true,
            user: { select: { firstName: true, lastName: true } },
            section: { select: { name: true, class: { select: { name: true } } } },
          },
        },
        payments: { where: { status: { in: ['success', 'refunded'] } }, select: { amount: true, status: true } },
      },
    });
    return invoices.map((i) => {
      const paid =
        i.payments.filter((p) => p.status === 'success').reduce((a, p) => a + Number(p.amount), 0) -
        i.payments.filter((p) => p.status === 'refunded').reduce((a, p) => a + Number(p.amount), 0);
      const due = Number(i.totalAmount) - Number(i.discount) + Number(i.lateFee);
      return {
        invoice_no: i.invoiceNo,
        admission_no: i.student.admissionNo,
        student: `${i.student.user.firstName} ${i.student.user.lastName}`,
        class: i.student.section ? `${i.student.section.class.name}-${i.student.section.name}` : '',
        status: i.status,
        total: due,
        paid,
        outstanding: Math.max(0, Math.round((due - paid) * 100) / 100),
        due_date: i.dueDate.toISOString().slice(0, 10),
      };
    });
  }

  async payroll(user: AuthUser, month?: string): Promise<Row[]> {
    this.assertReportAccess(user, 'payroll');
    const rows = await this.prisma.payroll.findMany({
      where: { staff: { schoolId: user.schoolId }, ...(month ? { month } : {}) },
      include: { staff: { select: { employeeNo: true, department: true, user: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ month: 'desc' }, { staff: { employeeNo: 'asc' } }],
    });
    return rows.map((r) => ({
      month: r.month,
      employee_no: r.staff.employeeNo,
      name: `${r.staff.user.firstName} ${r.staff.user.lastName}`,
      department: r.staff.department,
      base_salary: Number(r.baseSalary),
      allowances: Number(r.allowances),
      deductions: Number(r.deductions),
      net_salary: Number(r.netSalary),
      status: r.status,
    }));
  }

  async transport(user: AuthUser): Promise<Row[]> {
    this.assertReportAccess(user, 'transport');
    const students = await this.prisma.student.findMany({
      where: { schoolId: user.schoolId, transportRouteStopId: { not: null } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        section: { select: { name: true, class: { select: { name: true } } } },
        routeStop: { include: { route: { include: { vehicle: true } } } },
      },
    });
    return students.map((s) => ({
      admission_no: s.admissionNo,
      student: `${s.user.firstName} ${s.user.lastName}`,
      class: s.section ? `${s.section.class.name}-${s.section.name}` : '',
      route: s.routeStop?.route.name ?? '',
      stop: s.routeStop?.name ?? '',
      pickup: s.routeStop?.pickupTime ?? '',
      vehicle: s.routeStop?.route.vehicle?.registration ?? '',
      driver: s.routeStop?.route.vehicle?.driverName ?? '',
    }));
  }

  async assets(user: AuthUser): Promise<Row[]> {
    this.assertReportAccess(user, 'assets');
    const assets = await this.prisma.asset.findMany({ where: { schoolId: user.schoolId }, orderBy: { assetTag: 'asc' } });
    return assets.map((a) => ({
      tag: a.assetTag,
      name: a.name,
      category: a.category,
      status: a.status,
      allocated_to: a.allocatedTo,
      purchase_cost: Number(a.purchaseCost),
      depreciation_pct_yr: Number(a.depreciationRate),
      vendor: a.vendor,
      amc_expiry: a.amcExpiry?.toISOString().slice(0, 10) ?? null,
    }));
  }

  async library(user: AuthUser): Promise<Row[]> {
    this.assertReportAccess(user, 'library');
    const txns = await this.prisma.libraryTransaction.findMany({
      where: { book: { schoolId: user.schoolId } },
      include: {
        book: { select: { title: true } },
        student: { select: { admissionNo: true, user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 1000,
    });
    return txns.map((t) => ({
      book: t.book.title,
      borrower: t.student ? `${t.student.user.firstName} ${t.student.user.lastName} (${t.student.admissionNo})` : 'staff',
      type: t.type,
      issued: t.issuedAt.toISOString().slice(0, 10),
      due: t.dueAt?.toISOString().slice(0, 10) ?? null,
      returned: t.returnedAt?.toISOString().slice(0, 10) ?? null,
      fine: Number(t.fine),
      fine_paid: t.fine.toNumber() > 0 ? (t.finePaid ? 'yes' : 'no') : '',
    }));
  }

  async students(user: AuthUser): Promise<Row[]> {
    this.assertReportAccess(user, 'students');
    const restricted = await this.scope.sectionIdsFor(user);
    const students = await this.prisma.student.findMany({
      where: { schoolId: user.schoolId, ...(restricted ? { sectionId: { in: restricted } } : {}) },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        section: { select: { name: true, class: { select: { name: true } } } },
        guardians: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
      },
    });
    return students.map((s) => ({
      admission_no: s.admissionNo,
      name: `${s.user.firstName} ${s.user.lastName}`,
      class: s.section ? `${s.section.class.name}-${s.section.name}` : '',
      roll_no: s.rollNo,
      status: s.status,
      gender: s.gender,
      guardian: s.guardians[0] ? `${s.guardians[0].user.firstName} ${s.guardians[0].user.lastName}` : '',
      guardian_phone: s.guardians[0]?.user.phone ?? '',
    }));
  }
}

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly svc: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get('catalog')
  @RequirePermission('reports', 'read')
  catalog(@CurrentUser() user: AuthUser) {
    return this.svc.catalog(user);
  }

  @Get('run')
  @RequirePermission('reports', 'read')
  async run(
    @CurrentUser() user: AuthUser,
    @Query('key') key: string,
    @Query('format') format = 'json',
    @Query('sectionId') sectionId?: string,
    @Query('examId') examId?: string,
    @Query('classId') classId?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    if (format !== 'json') {
      // exporting requires the export permission (admins have it; e.g. hr does not)
      const exportable = ['super_admin', 'school_admin', 'principal', 'vice_principal', 'accountant'];
      if (!exportable.includes(user.role)) {
        throw new ForbiddenException('Your role can view but not export this report');
      }
    }
    let rows: Row[];
    switch (key) {
      case 'attendance': rows = await this.svc.attendance(user, sectionId, from, to); break;
      case 'academic': rows = await this.svc.academic(user, examId, classId); break;
      case 'fees': rows = await this.svc.fees(user); break;
      case 'payroll': rows = await this.svc.payroll(user, month); break;
      case 'transport': rows = await this.svc.transport(user); break;
      case 'assets': rows = await this.svc.assets(user); break;
      case 'library': rows = await this.svc.library(user); break;
      case 'students': rows = await this.svc.students(user); break;
      default: throw new BadRequestException(`Unknown report '${key}'`);
    }
    await this.audit.log(user, 'reports', `report.${format === 'json' ? 'view' : 'export'}`, undefined, { key, format });
    await exportRows(res!, `${key}-report`, `${key.toUpperCase()} report`, rows, format);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
