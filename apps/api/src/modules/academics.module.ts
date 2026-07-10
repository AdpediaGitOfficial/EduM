import {
  BadRequestException,
  Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';

class ClassDto {
  @IsString() name!: string;
  @IsInt() level!: number;
}
class SectionDto {
  @IsString() name!: string;
  @IsOptional() @IsString() room?: string;
  @IsOptional() @IsString() classTeacherId?: string;
  @IsOptional() @IsInt() capacity?: number;
}
class SubjectDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsBoolean() isElective?: boolean;
}
class SlotDto {
  @IsString() sectionId!: string;
  @IsString() subjectId!: string;
  @IsOptional() @IsString() teacherStaffId?: string;
  @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @IsInt() @Min(1) @Max(12) periodNo!: number;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsString() room?: string;
}

@Injectable()
export class AcademicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ── classes & sections ──
  async listClasses(user: AuthUser) {
    return this.prisma.class.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { level: 'asc' },
      include: {
        sections: {
          orderBy: { name: 'asc' },
          include: {
            classTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
            _count: { select: { students: true } },
          },
        },
      },
    });
  }

  async createClass(user: AuthUser, dto: ClassDto) {
    const c = await this.prisma.class.create({ data: { schoolId: user.schoolId, ...dto } });
    await this.audit.log(user, 'classes', 'class.create', c.id, { name: c.name });
    return c;
  }

  async updateClass(user: AuthUser, id: string, dto: Partial<ClassDto>) {
    const c = await this.prisma.class.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!c) throw new NotFoundException('Class not found');
    return this.prisma.class.update({ where: { id }, data: dto });
  }

  async deleteClass(user: AuthUser, id: string) {
    const c = await this.prisma.class.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { sections: { include: { _count: { select: { students: true } } } } },
    });
    if (!c) throw new NotFoundException('Class not found');
    if (c.sections.some((s) => s._count.students > 0)) {
      throw new BadRequestException('Cannot delete a class with enrolled students');
    }
    await this.prisma.class.delete({ where: { id } });
    await this.audit.log(user, 'classes', 'class.delete', id);
    return { ok: true };
  }

  async createSection(user: AuthUser, classId: string, dto: SectionDto) {
    const c = await this.prisma.class.findFirst({ where: { id: classId, schoolId: user.schoolId } });
    if (!c) throw new NotFoundException('Class not found');
    const s = await this.prisma.section.create({
      data: { classId, name: dto.name, room: dto.room ?? null, classTeacherId: dto.classTeacherId ?? null, capacity: dto.capacity ?? 40 },
    });
    await this.audit.log(user, 'classes', 'section.create', s.id, { classId, name: dto.name });
    return s;
  }

  async updateSection(user: AuthUser, id: string, dto: Partial<SectionDto>) {
    const s = await this.prisma.section.findFirst({ where: { id, class: { schoolId: user.schoolId } } });
    if (!s) throw new NotFoundException('Section not found');
    return this.prisma.section.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.room !== undefined ? { room: dto.room } : {}),
        ...(dto.classTeacherId !== undefined ? { classTeacherId: dto.classTeacherId } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      },
    });
  }

  async deleteSection(user: AuthUser, id: string) {
    const s = await this.prisma.section.findFirst({
      where: { id, class: { schoolId: user.schoolId } },
      include: { _count: { select: { students: true } } },
    });
    if (!s) throw new NotFoundException('Section not found');
    if (s._count.students > 0) throw new BadRequestException('Cannot delete a section with enrolled students');
    await this.prisma.section.delete({ where: { id } });
    return { ok: true };
  }

  /** flat section list (for pickers) — scoped for teacher/parent/student */
  async listSections(user: AuthUser) {
    const restricted = await this.scope.sectionIdsFor(user);
    return this.prisma.section.findMany({
      where: {
        class: { schoolId: user.schoolId },
        ...(restricted ? { id: { in: restricted } } : {}),
      },
      orderBy: [{ class: { level: 'asc' } }, { name: 'asc' }],
      include: {
        class: { select: { id: true, name: true, level: true } },
        classTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        _count: { select: { students: true } },
      },
    });
  }

  // ── subjects ──
  async listSubjects(user: AuthUser) {
    return this.prisma.subject.findMany({ where: { schoolId: user.schoolId }, orderBy: { name: 'asc' } });
  }

  async createSubject(user: AuthUser, dto: SubjectDto) {
    return this.prisma.subject.create({ data: { schoolId: user.schoolId, ...dto } });
  }

  async updateSubject(user: AuthUser, id: string, dto: Partial<SubjectDto>) {
    const s = await this.prisma.subject.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!s) throw new NotFoundException('Subject not found');
    return this.prisma.subject.update({ where: { id }, data: dto });
  }

  async deleteSubject(user: AuthUser, id: string) {
    const s = await this.prisma.subject.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!s) throw new NotFoundException('Subject not found');
    await this.prisma.subject.delete({ where: { id } });
    return { ok: true };
  }

  // ── timetable ──
  async timetableForSection(user: AuthUser, sectionId: string) {
    const restricted = await this.scope.sectionIdsFor(user);
    if (restricted && !restricted.includes(sectionId)) {
      throw new ForbiddenException('You do not have access to this section');
    }
    return this.prisma.timetableSlot.findMany({
      where: { sectionId, section: { class: { schoolId: user.schoolId } } },
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
      include: { subject: { select: { id: true, name: true, code: true } } },
    });
  }

  async timetableForTeacher(user: AuthUser, staffId?: string) {
    // teachers can only see their own timetable; admins can pass any staffId
    const target = user.role === 'teacher' ? user.staffId : (staffId ?? user.staffId);
    if (!target) throw new BadRequestException('No staff id');
    return this.prisma.timetableSlot.findMany({
      where: { teacherStaffId: target, section: { class: { schoolId: user.schoolId } } },
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
      include: {
        subject: { select: { id: true, name: true, code: true } },
        section: { select: { id: true, name: true, class: { select: { name: true } } } },
      },
    });
  }

  async mySchedule(user: AuthUser) {
    if (user.role === 'teacher') return this.timetableForTeacher(user);
    const sectionIds = await this.scope.sectionIdsFor(user);
    if (!sectionIds || sectionIds.length === 0) return [];
    return this.prisma.timetableSlot.findMany({
      where: { sectionId: { in: sectionIds } },
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
      include: {
        subject: { select: { id: true, name: true, code: true } },
        section: { select: { id: true, name: true, class: { select: { name: true } } } },
      },
    });
  }

  async upsertSlot(user: AuthUser, dto: SlotDto) {
    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, class: { schoolId: user.schoolId } },
    });
    if (!section) throw new NotFoundException('Section not found');
    // conflict check: same teacher, same day/period in a different section
    if (dto.teacherStaffId) {
      const clash = await this.prisma.timetableSlot.findFirst({
        where: {
          teacherStaffId: dto.teacherStaffId,
          dayOfWeek: dto.dayOfWeek,
          periodNo: dto.periodNo,
          NOT: { sectionId: dto.sectionId },
        },
        include: { section: { select: { name: true, class: { select: { name: true } } } } },
      });
      if (clash) {
        throw new BadRequestException(
          `Teacher already has period ${dto.periodNo} on that day in ${clash.section.class.name}-${clash.section.name}`,
        );
      }
    }
    const slot = await this.prisma.timetableSlot.upsert({
      where: {
        sectionId_dayOfWeek_periodNo: {
          sectionId: dto.sectionId, dayOfWeek: dto.dayOfWeek, periodNo: dto.periodNo,
        },
      },
      create: { ...dto, teacherStaffId: dto.teacherStaffId ?? null, room: dto.room ?? null },
      update: {
        subjectId: dto.subjectId, teacherStaffId: dto.teacherStaffId ?? null,
        startTime: dto.startTime, endTime: dto.endTime, room: dto.room ?? null,
      },
    });
    await this.audit.log(user, 'classes', 'timetable.upsert', slot.id);
    return slot;
  }

  async deleteSlot(user: AuthUser, id: string) {
    const slot = await this.prisma.timetableSlot.findFirst({
      where: { id, section: { class: { schoolId: user.schoolId } } },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    await this.prisma.timetableSlot.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller()
export class AcademicsController {
  constructor(private readonly svc: AcademicsService) {}

  @Get('classes')
  @RequirePermission('classes', 'read')
  listClasses(@CurrentUser() user: AuthUser) {
    return this.svc.listClasses(user);
  }

  @Post('classes')
  @RequirePermission('classes', 'create')
  createClass(@CurrentUser() user: AuthUser, @Body() dto: ClassDto) {
    return this.svc.createClass(user, dto);
  }

  @Patch('classes/:id')
  @RequirePermission('classes', 'update')
  updateClass(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<ClassDto>) {
    return this.svc.updateClass(user, id, dto);
  }

  @Delete('classes/:id')
  @RequirePermission('classes', 'delete')
  deleteClass(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteClass(user, id);
  }

  @Post('classes/:id/sections')
  @RequirePermission('classes', 'create')
  createSection(@CurrentUser() user: AuthUser, @Param('id') classId: string, @Body() dto: SectionDto) {
    return this.svc.createSection(user, classId, dto);
  }

  @Get('sections')
  @RequirePermission('classes', 'read')
  listSections(@CurrentUser() user: AuthUser) {
    return this.svc.listSections(user);
  }

  @Patch('sections/:id')
  @RequirePermission('classes', 'update')
  updateSection(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<SectionDto>) {
    return this.svc.updateSection(user, id, dto);
  }

  @Delete('sections/:id')
  @RequirePermission('classes', 'delete')
  deleteSection(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteSection(user, id);
  }

  @Get('subjects')
  @RequirePermission('classes', 'read')
  listSubjects(@CurrentUser() user: AuthUser) {
    return this.svc.listSubjects(user);
  }

  @Post('subjects')
  @RequirePermission('classes', 'create')
  createSubject(@CurrentUser() user: AuthUser, @Body() dto: SubjectDto) {
    return this.svc.createSubject(user, dto);
  }

  @Patch('subjects/:id')
  @RequirePermission('classes', 'update')
  updateSubject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<SubjectDto>) {
    return this.svc.updateSubject(user, id, dto);
  }

  @Delete('subjects/:id')
  @RequirePermission('classes', 'delete')
  deleteSubject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteSubject(user, id);
  }

  @Get('timetable/section/:sectionId')
  @RequirePermission('classes', 'read')
  timetableForSection(@CurrentUser() user: AuthUser, @Param('sectionId') sectionId: string) {
    return this.svc.timetableForSection(user, sectionId);
  }

  @Get('timetable/teacher')
  @RequirePermission('classes', 'read')
  timetableForTeacher(@CurrentUser() user: AuthUser, @Query('staffId') staffId?: string) {
    return this.svc.timetableForTeacher(user, staffId);
  }

  @Get('timetable/me')
  @RequirePermission('classes', 'read')
  mySchedule(@CurrentUser() user: AuthUser) {
    return this.svc.mySchedule(user);
  }

  @Post('timetable/slots')
  @RequirePermission('classes', 'update')
  upsertSlot(@CurrentUser() user: AuthUser, @Body() dto: SlotDto) {
    return this.svc.upsertSlot(user, dto);
  }

  @Delete('timetable/slots/:id')
  @RequirePermission('classes', 'update')
  deleteSlot(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteSlot(user, id);
  }
}

@Module({ controllers: [AcademicsController], providers: [AcademicsService] })
export class AcademicsModule {}
