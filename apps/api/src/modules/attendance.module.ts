import {
  BadRequestException,
  Body, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';

const STATUSES = ['present', 'absent', 'late', 'leave', 'half_day'];

class MarkEntryDto {
  @IsString() studentId!: string;
  @IsIn(STATUSES) status!: string;
  @IsOptional() @IsString() note?: string;
}

class MarkAttendanceDto {
  @IsString() sectionId!: string;
  @IsString() date!: string; // YYYY-MM-DD
  @IsArray() @ValidateNested({ each: true }) @Type(() => MarkEntryDto) entries!: MarkEntryDto[];
}

class QrCaptureDto {
  // QR-ready contract: the QR encodes the student's admission number + date signature.
  @IsString() admissionNo!: string;
  @IsOptional() @IsString() date?: string;
}

class RfidCaptureDto {
  // RFID-ready contract: card id is mapped to a student admission number.
  @IsString() cardId!: string;
  @IsOptional() @IsString() deviceId?: string;
}

function toDate(d: string): Date {
  const date = new Date(`${d}T00:00:00.000Z`);
  if (isNaN(date.getTime())) throw new BadRequestException('Invalid date');
  return date;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  /** section roster with any existing marks for the date */
  async sheet(user: AuthUser, sectionId: string, dateStr: string) {
    await this.scope.assertTeacherSection(user, sectionId);
    const date = toDate(dateStr);
    const students = await this.prisma.student.findMany({
      where: { sectionId, schoolId: user.schoolId, status: 'active' },
      orderBy: { rollNo: 'asc' },
      select: {
        id: true, rollNo: true, admissionNo: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { sectionId, date },
    });
    const byStudent = new Map<string, (typeof records)[number]>(
      records.map((r) => [r.studentId, r] as const),
    );
    return students.map((s) => ({
      ...s,
      status: byStudent.get(s.id)?.status ?? null,
      note: byStudent.get(s.id)?.note ?? null,
      source: byStudent.get(s.id)?.source ?? null,
    }));
  }

  async mark(user: AuthUser, dto: MarkAttendanceDto, source = 'manual') {
    await this.scope.assertTeacherSection(user, dto.sectionId);
    const date = toDate(dto.date);
    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, class: { schoolId: user.schoolId } },
    });
    if (!section) throw new NotFoundException('Section not found');

    // validate all students belong to the section (never trust client ids)
    const valid = await this.prisma.student.findMany({
      where: { sectionId: dto.sectionId, id: { in: dto.entries.map((e) => e.studentId) } },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const bad = dto.entries.filter((e) => !validIds.has(e.studentId));
    if (bad.length) throw new BadRequestException('Some students do not belong to this section');

    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: e.studentId, date } },
          create: {
            schoolId: user.schoolId, studentId: e.studentId, sectionId: dto.sectionId,
            date, status: e.status as never, note: e.note ?? null,
            source: source as never, markedById: user.userId,
          },
          update: { status: e.status as never, note: e.note ?? null, source: source as never, markedById: user.userId },
        }),
      ),
    );
    await this.audit.log(user, 'attendance', 'attendance.mark', dto.sectionId, {
      date: dto.date, count: dto.entries.length, source,
    });
    return { ok: true, marked: dto.entries.length };
  }

  /** QR-ready capture endpoint: marks the student present for today. */
  async captureQr(user: AuthUser, dto: QrCaptureDto) {
    const student = await this.prisma.student.findFirst({
      where: { admissionNo: dto.admissionNo, schoolId: user.schoolId },
    });
    if (!student || !student.sectionId) throw new NotFoundException('Student not found or unassigned');
    await this.scope.assertTeacherSection(user, student.sectionId);
    const date = toDate(dto.date ?? new Date().toISOString().slice(0, 10));
    await this.prisma.attendanceRecord.upsert({
      where: { studentId_date: { studentId: student.id, date } },
      create: {
        schoolId: user.schoolId, studentId: student.id, sectionId: student.sectionId,
        date, status: 'present', source: 'qr', markedById: user.userId,
      },
      update: { status: 'present', source: 'qr', markedById: user.userId },
    });
    return { ok: true, studentId: student.id, status: 'present', source: 'qr' };
  }

  /** RFID-ready capture endpoint: card id maps to admission number (ADM-…). */
  async captureRfid(user: AuthUser, dto: RfidCaptureDto) {
    // Contract: RFID cards are provisioned with the admission number as payload.
    return this.captureQr(user, { admissionNo: dto.cardId });
  }

  async forStudent(user: AuthUser, studentId: string, from?: string, to?: string) {
    await this.scope.assertStudentAccess(user, studentId);
    const where = {
      studentId,
      ...(from || to
        ? { date: { ...(from ? { gte: toDate(from) } : {}), ...(to ? { lte: toDate(to) } : {}) } }
        : {}),
    };
    const records = await this.prisma.attendanceRecord.findMany({ where, orderBy: { date: 'desc' }, take: 400 });
    const counts: Record<string, number> = {};
    for (const r of records) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const total = records.length || 1;
    return {
      records,
      summary: {
        total: records.length,
        counts,
        presentPct: Math.round((((counts.present ?? 0) + (counts.late ?? 0)) / total) * 1000) / 10,
      },
    };
  }

  /** month grid for a section: YYYY-MM */
  async monthly(user: AuthUser, sectionId: string, month: string) {
    await this.scope.assertTeacherSection(user, sectionId);
    const restricted = await this.scope.sectionIdsFor(user);
    if (restricted && !restricted.includes(sectionId)) throw new ForbiddenException('No access to this section');
    const start = toDate(`${month}-01`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const [students, records] = await Promise.all([
      this.prisma.student.findMany({
        where: { sectionId, schoolId: user.schoolId, status: 'active' },
        orderBy: { rollNo: 'asc' },
        select: { id: true, rollNo: true, user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { sectionId, date: { gte: start, lt: end } },
        select: { studentId: true, date: true, status: true },
      }),
    ]);
    return { students, records };
  }

  async analytics(user: AuthUser, sectionId?: string, classId?: string) {
    const restricted = await this.scope.sectionIdsFor(user);
    const sectionWhere = sectionId
      ? { sectionId }
      : classId
        ? { section: { classId } }
        : {};
    if (restricted) {
      if (sectionId && !restricted.includes(sectionId)) throw new ForbiddenException('No access');
      if (!sectionId) (sectionWhere as Record<string, unknown>).sectionId = { in: restricted };
    }
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const records = await this.prisma.attendanceRecord.findMany({
      where: { schoolId: user.schoolId, ...(sectionWhere as object), date: { gte: since } },
      select: { date: true, status: true, sectionId: true },
    });

    // daily trend
    const byDay = new Map<string, { present: number; total: number }>();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      const d = byDay.get(key) ?? { present: 0, total: 0 };
      d.total++;
      if (r.status === 'present' || r.status === 'late') d.present++;
      byDay.set(key, d);
    }
    const trend = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, pct: Math.round((v.present / v.total) * 1000) / 10 }));

    // by-section breakdown
    const bySection = new Map<string, { present: number; total: number }>();
    for (const r of records) {
      const d = bySection.get(r.sectionId) ?? { present: 0, total: 0 };
      d.total++;
      if (r.status === 'present' || r.status === 'late') d.present++;
      bySection.set(r.sectionId, d);
    }
    const sections = await this.prisma.section.findMany({
      where: { id: { in: Array.from(bySection.keys()) } },
      select: { id: true, name: true, class: { select: { name: true } } },
    });
    const sectionStats = sections.map((s) => {
      const v = bySection.get(s.id)!;
      return {
        sectionId: s.id,
        label: `${s.class.name}-${s.name}`,
        pct: Math.round((v.present / v.total) * 1000) / 10,
      };
    });

    // low-attendance students (< 75% in window) — visible rule, not a black box
    const byStudent = new Map<string, { present: number; total: number }>();
    const all = await this.prisma.attendanceRecord.findMany({
      where: { schoolId: user.schoolId, ...(sectionWhere as object), date: { gte: since } },
      select: { studentId: true, status: true },
    });
    for (const r of all) {
      const d = byStudent.get(r.studentId) ?? { present: 0, total: 0 };
      d.total++;
      if (r.status === 'present' || r.status === 'late') d.present++;
      byStudent.set(r.studentId, d);
    }
    const lowIds = Array.from(byStudent.entries())
      .filter(([, v]) => v.total >= 5 && v.present / v.total < 0.75)
      .map(([id]) => id);
    const lowStudents = await this.prisma.student.findMany({
      where: { id: { in: lowIds } },
      select: {
        id: true, admissionNo: true,
        user: { select: { firstName: true, lastName: true } },
        section: { select: { name: true, class: { select: { name: true } } } },
      },
    });
    const low = lowStudents.map((s) => {
      const v = byStudent.get(s.id)!;
      return { ...s, pct: Math.round((v.present / v.total) * 1000) / 10 };
    });

    return { trend, sectionStats, lowAttendance: low, windowDays: 30 };
  }
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Get('sheet')
  @RequirePermission('attendance', 'read')
  sheet(@CurrentUser() user: AuthUser, @Query('sectionId') sectionId: string, @Query('date') date: string) {
    return this.svc.sheet(user, sectionId, date);
  }

  @Post('mark')
  @RequirePermission('attendance', 'create')
  mark(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.svc.mark(user, dto);
  }

  @Post('capture/qr')
  @RequirePermission('attendance', 'create')
  captureQr(@CurrentUser() user: AuthUser, @Body() dto: QrCaptureDto) {
    return this.svc.captureQr(user, dto);
  }

  @Post('capture/rfid')
  @RequirePermission('attendance', 'create')
  captureRfid(@CurrentUser() user: AuthUser, @Body() dto: RfidCaptureDto) {
    return this.svc.captureRfid(user, dto);
  }

  @Get('student/:studentId')
  @RequirePermission('attendance', 'read')
  forStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.forStudent(user, studentId, from, to);
  }

  @Get('monthly')
  @RequirePermission('attendance', 'read')
  monthly(@CurrentUser() user: AuthUser, @Query('sectionId') sectionId: string, @Query('month') month: string) {
    return this.svc.monthly(user, sectionId, month);
  }

  @Get('analytics')
  @RequirePermission('attendance', 'read')
  analytics(
    @CurrentUser() user: AuthUser,
    @Query('sectionId') sectionId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.svc.analytics(user, sectionId, classId);
  }
}

@Module({ controllers: [AttendanceController], providers: [AttendanceService] })
export class AttendanceModule {}
