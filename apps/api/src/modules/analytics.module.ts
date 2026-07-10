import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { ScopeService } from '../common/scope.service';
import { gpaFor } from './gradebook.module';

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** Admin/principal executive dashboard */
  async admin(user: AuthUser) {
    const schoolId = user.schoolId;
    const since30 = new Date(Date.now() - 30 * 86400000);

    const [studentCount, staffCount, invoices, payments, attendance, admissions, complaints, vehicles, assets, books] =
      await Promise.all([
        this.prisma.student.count({ where: { schoolId, status: 'active' } }),
        this.prisma.staff.count({ where: { schoolId, user: { status: 'active' } } }),
        this.prisma.feeInvoice.findMany({
          where: { schoolId, status: { not: 'cancelled' } },
          select: { totalAmount: true, discount: true, lateFee: true, status: true },
        }),
        this.prisma.payment.findMany({
          where: { schoolId, status: 'success' },
          select: { amount: true, paidAt: true },
        }),
        this.prisma.attendanceRecord.findMany({
          where: { schoolId, date: { gte: since30 } },
          select: { date: true, status: true },
        }),
        this.prisma.student.count({ where: { schoolId, admissionDate: { gte: new Date(new Date().getFullYear(), 0, 1) } } }),
        this.prisma.complaint.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true } }),
        this.prisma.vehicle.count({ where: { schoolId, status: 'active' } }),
        this.prisma.asset.count({ where: { schoolId, status: { not: 'disposed' } } }),
        this.prisma.libraryBook.aggregate({ where: { schoolId }, _sum: { copies: true, availableCopies: true } }),
      ]);

    const invoiced = invoices.reduce((a, i) => a + Number(i.totalAmount) - Number(i.discount) + Number(i.lateFee), 0);
    const refundedAgg = await this.prisma.payment.aggregate({
      where: { schoolId, status: 'refunded' }, _sum: { amount: true },
    });
    const collected = payments.reduce((a, p) => a + Number(p.amount), 0) - Number(refundedAgg._sum.amount ?? 0);

    // monthly revenue trend
    const revByMonth = new Map<string, number>();
    for (const p of payments) {
      const key = p.paidAt.toISOString().slice(0, 7);
      revByMonth.set(key, (revByMonth.get(key) ?? 0) + Number(p.amount));
    }
    const revenueTrend = Array.from(revByMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([month, amount]) => ({ month, amount: Math.round(amount) }));

    // attendance trend
    const attByDay = new Map<string, { p: number; t: number }>();
    for (const r of attendance) {
      const key = r.date.toISOString().slice(0, 10);
      const d = attByDay.get(key) ?? { p: 0, t: 0 };
      d.t++;
      if (r.status === 'present' || r.status === 'late') d.p++;
      attByDay.set(key, d);
    }
    const attendanceTrend = Array.from(attByDay.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, pct: pct(v.p, v.t) }));
    const overallAttendance = pct(
      attendance.filter((r) => r.status === 'present' || r.status === 'late').length,
      attendance.length,
    );

    // teacher performance (avg review rating) + section performance (latest exam)
    const reviews = await this.prisma.staffPerformance.findMany({
      where: { staff: { schoolId } },
      include: { staff: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });
    const teacherPerformance = reviews.map((r) => ({
      name: `${r.staff.user.firstName} ${r.staff.user.lastName}`,
      period: r.reviewPeriod,
      rating: r.rating,
    }));

    const latestExam = await this.prisma.exam.findFirst({
      where: { schoolId, published: true },
      orderBy: { startDate: 'desc' },
    });
    let sectionPerformance: { label: string; avgPct: number }[] = [];
    if (latestExam) {
      const results = await this.prisma.examResult.findMany({
        where: { examId: latestExam.id },
        include: { student: { select: { sectionId: true } } },
      });
      const bySection = new Map<string, { t: number; m: number }>();
      for (const r of results) {
        if (!r.student.sectionId) continue;
        const v = bySection.get(r.student.sectionId) ?? { t: 0, m: 0 };
        v.t += Number(r.score); v.m += r.maxScore;
        bySection.set(r.student.sectionId, v);
      }
      const sections = await this.prisma.section.findMany({
        where: { id: { in: Array.from(bySection.keys()) } },
        include: { class: { select: { name: true } } },
      });
      sectionPerformance = sections.map((s) => ({
        label: `${s.class.name}-${s.name}`,
        avgPct: pct(bySection.get(s.id)!.t, bySection.get(s.id)!.m),
      })).sort((a, b) => a.label.localeCompare(b.label));
    }

    const invoiceStatus: Record<string, number> = {};
    for (const i of invoices) invoiceStatus[i.status] = (invoiceStatus[i.status] ?? 0) + 1;
    const complaintsByStatus = Object.fromEntries(complaints.map((c) => [c.status, c._count._all]));

    return {
      headline: {
        students: studentCount,
        staff: staffCount,
        revenueCollected: Math.round(collected),
        revenueOutstanding: Math.round(Math.max(0, invoiced - collected)),
        collectionRate: pct(collected, invoiced),
        attendance30d: overallAttendance,
        admissionsThisYear: admissions,
        activeBuses: vehicles,
        assets,
        libraryCopies: Number(books._sum.copies ?? 0),
        libraryAvailable: Number(books._sum.availableCopies ?? 0),
      },
      revenueTrend,
      attendanceTrend,
      sectionPerformance,
      teacherPerformance,
      invoiceStatus,
      complaintsByStatus,
      examName: latestExam?.name ?? null,
    };
  }

  /** Teacher dashboard: class performance, completion, weak students (visible rule) */
  async teacher(user: AuthUser) {
    if (!user.staffId) throw new BadRequestException('No staff profile');
    const sectionIds = await this.scope.teacherSectionIds(user);
    const since30 = new Date(Date.now() - 30 * 86400000);

    const [students, attendance, homework] = await Promise.all([
      this.prisma.student.findMany({
        where: { sectionId: { in: sectionIds }, status: 'active' },
        include: {
          user: { select: { firstName: true, lastName: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { sectionId: { in: sectionIds }, date: { gte: since30 } },
        select: { studentId: true, sectionId: true, date: true, status: true },
      }),
      this.prisma.homework.findMany({
        where: { teacherStaffId: user.staffId },
        include: { submissions: { select: { studentId: true, status: true } }, subject: { select: { name: true } } },
        orderBy: { dueDate: 'desc' },
        take: 30,
      }),
    ]);

    // attendance trend across my sections
    const attByDay = new Map<string, { p: number; t: number }>();
    const attByStudent = new Map<string, { p: number; t: number }>();
    for (const r of attendance) {
      const key = r.date.toISOString().slice(0, 10);
      const d = attByDay.get(key) ?? { p: 0, t: 0 };
      d.t++; if (r.status === 'present' || r.status === 'late') d.p++;
      attByDay.set(key, d);
      const s = attByStudent.get(r.studentId) ?? { p: 0, t: 0 };
      s.t++; if (r.status === 'present' || r.status === 'late') s.p++;
      attByStudent.set(r.studentId, s);
    }
    const attendanceTrend = Array.from(attByDay.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, pct: pct(v.p, v.t) }));

    // assignment completion + missed count per student
    const missedByStudent = new Map<string, number>();
    const completion = homework.map((h) => {
      const done = h.submissions.filter((s) => ['submitted', 'graded', 'late'].includes(s.status)).length;
      for (const s of h.submissions) {
        if (s.status === 'missed' || s.status === 'pending') {
          if (h.dueDate < new Date()) {
            missedByStudent.set(s.studentId, (missedByStudent.get(s.studentId) ?? 0) + 1);
          }
        }
      }
      return {
        id: h.id, title: h.title, subject: h.subject.name, dueDate: h.dueDate,
        completionPct: pct(done, h.submissions.length),
      };
    });

    // class performance from latest exam
    const latestExam = await this.prisma.exam.findFirst({
      where: { schoolId: user.schoolId, published: true },
      orderBy: { startDate: 'desc' },
    });
    const perfByStudent = new Map<string, number>();
    if (latestExam) {
      const results = await this.prisma.examResult.findMany({
        where: { examId: latestExam.id, studentId: { in: students.map((s) => s.id) } },
      });
      const agg = new Map<string, { t: number; m: number }>();
      for (const r of results) {
        const v = agg.get(r.studentId) ?? { t: 0, m: 0 };
        v.t += Number(r.score); v.m += r.maxScore;
        agg.set(r.studentId, v);
      }
      for (const [id, v] of agg) perfByStudent.set(id, pct(v.t, v.m));
    }

    // WEAK-STUDENT RULE (explicit, not ML): attendance < 75% OR 2+ missed assignments
    const weakStudents = students
      .map((s) => {
        const att = attByStudent.get(s.id);
        const attPct = att ? pct(att.p, att.t) : null;
        const missed = missedByStudent.get(s.id) ?? 0;
        const flagged = (attPct !== null && attPct < 75) || missed >= 2;
        return {
          id: s.id,
          name: `${s.user.firstName} ${s.user.lastName}`,
          section: s.section ? `${s.section.class.name}-${s.section.name}` : '',
          attendancePct: attPct,
          missedAssignments: missed,
          examPct: perfByStudent.get(s.id) ?? null,
          flagged,
          reasons: [
            ...(attPct !== null && attPct < 75 ? [`attendance ${attPct}% < 75%`] : []),
            ...(missed >= 2 ? [`${missed} missed assignments`] : []),
          ],
        };
      })
      .filter((s) => s.flagged)
      .sort((a, b) => (a.attendancePct ?? 100) - (b.attendancePct ?? 100));

    const comparison = students.map((s) => ({
      name: `${s.user.firstName} ${s.user.lastName}`,
      section: s.section ? `${s.section.class.name}-${s.section.name}` : '',
      examPct: perfByStudent.get(s.id) ?? null,
      attendancePct: attByStudent.has(s.id) ? pct(attByStudent.get(s.id)!.p, attByStudent.get(s.id)!.t) : null,
    })).sort((a, b) => (b.examPct ?? 0) - (a.examPct ?? 0));

    return {
      headline: {
        sections: sectionIds.length,
        students: students.length,
        assignments: homework.length,
        weakStudents: weakStudents.length,
      },
      weakRule: 'attendance < 75% OR missed assignments >= 2 (last 30 days)',
      attendanceTrend,
      completion: completion.slice(0, 15),
      weakStudents,
      comparison,
      examName: latestExam?.name ?? null,
    };
  }

  /** Parent dashboard for one child (or student self) */
  async studentOverview(user: AuthUser, studentId: string) {
    await this.scope.assertStudentAccess(user, studentId);
    const since60 = new Date(Date.now() - 60 * 86400000);
    const [student, attendance, results, invoices, remarks, behavior] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        include: {
          user: { select: { firstName: true, lastName: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { studentId, date: { gte: since60 } },
        orderBy: { date: 'asc' },
        select: { date: true, status: true },
      }),
      this.prisma.examResult.findMany({
        where: { studentId, exam: { published: true } },
        include: { exam: { select: { id: true, name: true, startDate: true } } },
        orderBy: { exam: { startDate: 'asc' } },
      }),
      this.prisma.feeInvoice.findMany({
        where: { studentId, status: { not: 'cancelled' } },
        include: { payments: { where: { status: { in: ['success', 'refunded'] } } } },
      }),
      this.prisma.progressNote.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.prisma.behaviorNote.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { teacher: { include: { user: { select: { firstName: true, lastName: true } } } } },
      }),
    ]);

    // attendance weekly buckets
    const byWeek = new Map<string, { p: number; t: number }>();
    for (const r of attendance) {
      const d = new Date(r.date);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      const v = byWeek.get(key) ?? { p: 0, t: 0 };
      v.t++; if (r.status === 'present' || r.status === 'late') v.p++;
      byWeek.set(key, v);
    }
    const attendanceTrend = Array.from(byWeek.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ week, pct: pct(v.p, v.t) }));
    const attendancePct = pct(
      attendance.filter((r) => r.status === 'present' || r.status === 'late').length,
      attendance.length,
    );

    // exam progress
    const byExam = new Map<string, { name: string; t: number; m: number }>();
    for (const r of results) {
      const v = byExam.get(r.exam.id) ?? { name: r.exam.name, t: 0, m: 0 };
      v.t += Number(r.score); v.m += r.maxScore;
      byExam.set(r.exam.id, v);
    }
    const examTrend = Array.from(byExam.values()).map((e) => ({
      exam: e.name, pct: pct(e.t, e.m), gpa: gpaFor(pct(e.t, e.m)),
    }));

    // subject breakdown of latest exam
    const latestExamId = results.length ? results[results.length - 1].exam.id : null;
    const subjects = await this.prisma.subject.findMany({ where: { schoolId: user.schoolId } });
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    const subjectScores = latestExamId
      ? results.filter((r) => r.exam.id === latestExamId).map((r) => ({
          subject: subjectName.get(r.subjectId) ?? '?',
          pct: pct(Number(r.score), r.maxScore),
          grade: r.grade,
        }))
      : [];

    // fee status
    let totalDue = 0; let totalPaid = 0;
    for (const i of invoices) {
      totalDue += Number(i.totalAmount) - Number(i.discount) + Number(i.lateFee);
      totalPaid +=
        i.payments.filter((p) => p.status === 'success').reduce((a, p) => a + Number(p.amount), 0) -
        i.payments.filter((p) => p.status === 'refunded').reduce((a, p) => a + Number(p.amount), 0);
    }

    // homework completion
    const hwAgg = await this.prisma.homeworkSubmission.groupBy({
      by: ['status'],
      where: { studentId },
      _count: { _all: true },
    });
    const hwCounts = Object.fromEntries(hwAgg.map((h) => [h.status, h._count._all]));

    return {
      student: {
        id: student?.id,
        name: student ? `${student.user.firstName} ${student.user.lastName}` : '',
        class: student?.section ? `${student.section.class.name}-${student.section.name}` : '',
      },
      attendancePct,
      attendanceTrend,
      examTrend,
      subjectScores,
      fees: {
        totalDue: Math.round(totalDue),
        totalPaid: Math.round(totalPaid),
        outstanding: Math.round(Math.max(0, totalDue - totalPaid)),
      },
      homework: hwCounts,
      remarks,
      behavior,
    };
  }

  /** Finance dashboard (accountant) */
  async finance(user: AuthUser) {
    const [invoices, payments, payroll] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        where: { schoolId: user.schoolId, status: { not: 'cancelled' } },
        select: { totalAmount: true, discount: true, lateFee: true, status: true, dueDate: true },
      }),
      this.prisma.payment.findMany({
        where: { schoolId: user.schoolId },
        select: { amount: true, method: true, status: true, paidAt: true },
      }),
      this.prisma.payroll.groupBy({
        by: ['month', 'status'],
        where: { staff: { schoolId: user.schoolId } },
        _sum: { netSalary: true },
      }),
    ]);
    const invoiced = invoices.reduce((a, i) => a + Number(i.totalAmount) - Number(i.discount) + Number(i.lateFee), 0);
    const collected = payments.filter((p) => p.status === 'success').reduce((a, p) => a + Number(p.amount), 0)
      - payments.filter((p) => p.status === 'refunded').reduce((a, p) => a + Number(p.amount), 0);
    const byMethod: Record<string, number> = {};
    for (const p of payments.filter((p) => p.status === 'success')) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
    }
    const byMonth = new Map<string, number>();
    for (const p of payments.filter((p) => p.status === 'success')) {
      const key = p.paidAt.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amount));
    }
    const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
    return {
      invoiced: Math.round(invoiced),
      collected: Math.round(collected),
      outstanding: Math.round(Math.max(0, invoiced - collected)),
      collectionRate: pct(collected, invoiced),
      overdueCount,
      byMethod,
      trend: Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
        .map(([month, amount]) => ({ month, amount: Math.round(amount) })),
      payroll: payroll.map((p) => ({ month: p.month, status: p.status, total: Number(p._sum.netSalary ?? 0) })),
    };
  }

  /** HR dashboard */
  async hr(user: AuthUser) {
    const since30 = new Date(Date.now() - 30 * 86400000);
    const [staff, attendance, leaves, payroll] = await Promise.all([
      this.prisma.staff.findMany({
        where: { schoolId: user.schoolId, user: { status: 'active' } },
        select: { id: true, department: true },
      }),
      this.prisma.staffAttendance.findMany({
        where: { staff: { schoolId: user.schoolId }, date: { gte: since30 } },
        select: { status: true, date: true },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['status'],
        where: { staff: { schoolId: user.schoolId } },
        _count: { _all: true },
      }),
      this.prisma.payroll.groupBy({
        by: ['month'],
        where: { staff: { schoolId: user.schoolId } },
        _sum: { netSalary: true },
      }),
    ]);
    const byDept: Record<string, number> = {};
    for (const s of staff) byDept[s.department ?? 'Other'] = (byDept[s.department ?? 'Other'] ?? 0) + 1;
    const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
    return {
      staffCount: staff.length,
      byDepartment: byDept,
      staffAttendance30d: pct(present, attendance.length),
      leavesByStatus: Object.fromEntries(leaves.map((l) => [l.status, l._count._all])),
      payrollByMonth: payroll.sort((a, b) => a.month.localeCompare(b.month)).slice(-6)
        .map((p) => ({ month: p.month, total: Number(p._sum.netSalary ?? 0) })),
    };
  }
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('admin')
  @RequirePermission('reports', 'read')
  admin(@CurrentUser() user: AuthUser) {
    if (!['super_admin', 'school_admin', 'principal', 'vice_principal'].includes(user.role)) {
      throw new ForbiddenException('Admin analytics require a leadership role');
    }
    return this.svc.admin(user);
  }

  @Get('teacher')
  @RequirePermission('reports', 'read')
  teacher(@CurrentUser() user: AuthUser) {
    if (user.role !== 'teacher') throw new ForbiddenException('Teacher analytics require the teacher role');
    return this.svc.teacher(user);
  }

  @Get('student-overview')
  @RequirePermission('reports', 'read')
  studentOverview(@CurrentUser() user: AuthUser, @Query('studentId') studentId: string) {
    return this.svc.studentOverview(user, studentId);
  }

  @Get('finance')
  @RequirePermission('reports', 'read')
  finance(@CurrentUser() user: AuthUser) {
    if (!['super_admin', 'school_admin', 'principal', 'accountant'].includes(user.role)) {
      throw new ForbiddenException('Finance analytics require a finance role');
    }
    return this.svc.finance(user);
  }

  @Get('hr')
  @RequirePermission('reports', 'read')
  hr(@CurrentUser() user: AuthUser) {
    if (!['super_admin', 'school_admin', 'principal', 'hr'].includes(user.role)) {
      throw new ForbiddenException('HR analytics require an HR role');
    }
    return this.svc.hr(user);
  }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
