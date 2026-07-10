import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';

class StaffMarkEntryDto {
  @IsString() staffId!: string;
  @IsIn(['present', 'absent', 'late', 'leave', 'half_day']) status!: string;
  @IsOptional() @IsString() note?: string;
}

class StaffMarkDto {
  @IsString() date!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StaffMarkEntryDto) entries!: StaffMarkEntryDto[];
}

@Injectable()
export class StaffMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async attendanceSheet(user: AuthUser, dateStr: string) {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const staff = await this.prisma.staff.findMany({
      where: { schoolId: user.schoolId, user: { status: 'active' } },
      orderBy: { employeeNo: 'asc' },
      select: {
        id: true, employeeNo: true, department: true, designation: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const records = await this.prisma.staffAttendance.findMany({ where: { date, staffId: { in: staff.map((s) => s.id) } } });
    const byStaff = new Map(records.map((r) => [r.staffId, r]));
    return staff.map((s) => ({ ...s, status: byStaff.get(s.id)?.status ?? null, note: byStaff.get(s.id)?.note ?? null }));
  }

  async mark(user: AuthUser, dto: StaffMarkDto) {
    const date = new Date(`${dto.date}T00:00:00.000Z`);
    const valid = await this.prisma.staff.findMany({
      where: { schoolId: user.schoolId, id: { in: dto.entries.map((e) => e.staffId) } },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const entries = dto.entries.filter((e) => validIds.has(e.staffId));
    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.staffAttendance.upsert({
          where: { staffId_date: { staffId: e.staffId, date } },
          create: { staffId: e.staffId, date, status: e.status as never, note: e.note ?? null },
          update: { status: e.status as never, note: e.note ?? null },
        }),
      ),
    );
    return { ok: true, marked: entries.length };
  }

  /** per-staff KPI: attendance %, pending leaves, open tasks, latest review */
  async overview(user: AuthUser) {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const staff = await this.prisma.staff.findMany({
      where: { schoolId: user.schoolId, user: { status: 'active' } },
      orderBy: { employeeNo: 'asc' },
      include: {
        user: { select: { firstName: true, lastName: true, role: true } },
        attendance: { where: { date: { gte: since } }, select: { status: true } },
        leaveRequests: { where: { status: 'pending' }, select: { id: true } },
        tasks: { where: { status: { in: ['todo', 'in_progress'] } }, select: { id: true, title: true, status: true, dueDate: true } },
        performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return staff.map((s) => {
      const total = s.attendance.length || 1;
      const present = s.attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
      return {
        id: s.id,
        employeeNo: s.employeeNo,
        name: `${s.user.firstName} ${s.user.lastName}`,
        role: s.user.role,
        department: s.department,
        designation: s.designation,
        attendancePct: s.attendance.length ? Math.round((present / total) * 1000) / 10 : null,
        pendingLeaves: s.leaveRequests.length,
        openTasks: s.tasks,
        latestReview: s.performanceReviews[0] ?? null,
      };
    });
  }

  async staffAttendanceHistory(user: AuthUser, staffId: string, month?: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId: user.schoolId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    let dateFilter = {};
    if (month) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      dateFilter = { date: { gte: start, lt: end } };
    }
    return this.prisma.staffAttendance.findMany({
      where: { staffId, ...dateFilter },
      orderBy: { date: 'desc' },
      take: 120,
    });
  }
}

@Controller('staff-monitoring')
export class StaffMonitoringController {
  constructor(private readonly svc: StaffMonitoringService) {}

  @Get('overview')
  @RequirePermission('staff', 'read')
  overview(@CurrentUser() user: AuthUser) {
    return this.svc.overview(user);
  }

  @Get('attendance')
  @RequirePermission('staff', 'read')
  attendanceSheet(@CurrentUser() user: AuthUser, @Query('date') date: string) {
    return this.svc.attendanceSheet(user, date);
  }

  @Post('attendance')
  @RequirePermission('staff', 'update')
  mark(@CurrentUser() user: AuthUser, @Body() dto: StaffMarkDto) {
    return this.svc.mark(user, dto);
  }

  @Get('attendance/:staffId/history')
  @RequirePermission('staff', 'read')
  history(@CurrentUser() user: AuthUser, @Param('staffId') staffId: string, @Query('month') month?: string) {
    return this.svc.staffAttendanceHistory(user, staffId, month);
  }
}

@Module({ controllers: [StaffMonitoringController], providers: [StaffMonitoringService] })
export class StaffMonitoringModule {}
