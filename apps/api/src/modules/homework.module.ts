import {
  BadRequestException,
  Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class CreateHomeworkDto {
  @IsString() sectionId!: string;
  @IsString() subjectId!: string;
  @IsIn(['homework', 'assignment', 'project']) type!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() dueDate!: string;
  @IsOptional() @IsInt() maxScore?: number;
  @IsOptional() @IsString() attachmentKey?: string;
}

class UpdateHomeworkDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsInt() maxScore?: number;
}

class SubmitDto {
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() fileKey?: string;
}

class GradeDto {
  @IsInt() score!: number;
  @IsOptional() @IsString() feedback?: string;
}

const hwInclude = {
  subject: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true, class: { select: { id: true, name: true } } } },
  _count: { select: { submissions: true } },
} as const;

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery & { sectionId?: string; subjectId?: string; type?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    let sectionFilter: object = {};
    if (user.role === 'teacher') {
      sectionFilter = { teacherStaffId: user.staffId ?? '' };
    } else {
      const restricted = await this.scope.sectionIdsFor(user);
      if (restricted) sectionFilter = { sectionId: { in: restricted } };
    }
    const where = {
      schoolId: user.schoolId,
      ...(sectionFilter as object),
      ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.type ? { type: q.type as never } : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.homework.findMany({ where, skip, take, orderBy: { dueDate: 'desc' }, include: hwInclude }),
      this.prisma.homework.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async get(user: AuthUser, id: string) {
    const hw = await this.prisma.homework.findFirst({
      where: { id, schoolId: user.schoolId },
      include: hwInclude,
    });
    if (!hw) throw new NotFoundException('Homework not found');
    if (user.role === 'teacher' && hw.teacherStaffId !== user.staffId) {
      const sections = await this.scope.teacherSectionIds(user);
      if (!sections.includes(hw.sectionId)) throw new ForbiddenException('Not your section');
    }
    if (user.role === 'student' || user.role === 'parent') {
      const restricted = await this.scope.sectionIdsFor(user);
      if (!restricted?.includes(hw.sectionId)) throw new ForbiddenException('Not your section');
    }
    return hw;
  }

  async create(user: AuthUser, dto: CreateHomeworkDto) {
    await this.scope.assertTeacherSubjectSection(user, dto.sectionId, dto.subjectId);
    if (!user.staffId && user.role === 'teacher') throw new BadRequestException('No staff profile');
    const teacherStaffId =
      user.role === 'teacher'
        ? user.staffId!
        : (
            await this.prisma.teachingAssignment.findFirst({
              where: { sectionId: dto.sectionId, subjectId: dto.subjectId },
            })
          )?.staffId;
    if (!teacherStaffId) throw new BadRequestException('No teacher assigned to this subject/section');

    const hw = await this.prisma.homework.create({
      data: {
        schoolId: user.schoolId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherStaffId,
        type: dto.type as never,
        title: dto.title,
        description: dto.description ?? null,
        dueDate: new Date(dto.dueDate),
        maxScore: dto.maxScore ?? 10,
        attachmentKey: dto.attachmentKey ?? null,
      },
      include: hwInclude,
    });
    // create pending submission slots for the roster
    const students = await this.prisma.student.findMany({
      where: { sectionId: dto.sectionId, status: 'active' },
      select: { id: true },
    });
    await this.prisma.homeworkSubmission.createMany({
      data: students.map((s) => ({ homeworkId: hw.id, studentId: s.id, status: 'pending' as never })),
      skipDuplicates: true,
    });
    await this.audit.log(user, 'homework', 'homework.create', hw.id, { title: hw.title });
    return hw;
  }

  async update(user: AuthUser, id: string, dto: UpdateHomeworkDto) {
    const hw = await this.get(user, id);
    if (user.role === 'teacher' && hw.teacherStaffId !== user.staffId) {
      throw new ForbiddenException('Only the assigning teacher can edit');
    }
    return this.prisma.homework.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.maxScore !== undefined ? { maxScore: dto.maxScore } : {}),
      },
      include: hwInclude,
    });
  }

  async remove(user: AuthUser, id: string) {
    const hw = await this.get(user, id);
    if (user.role === 'teacher' && hw.teacherStaffId !== user.staffId) {
      throw new ForbiddenException('Only the assigning teacher can delete');
    }
    await this.prisma.homework.delete({ where: { id } }); // cascades submissions
    await this.audit.log(user, 'homework', 'homework.delete', id);
    return { ok: true };
  }

  async submissions(user: AuthUser, homeworkId: string) {
    await this.get(user, homeworkId); // access check
    return this.prisma.homeworkSubmission.findMany({
      where: { homeworkId },
      orderBy: { student: { rollNo: 'asc' } },
      include: {
        student: {
          select: { id: true, rollNo: true, admissionNo: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  async submit(user: AuthUser, homeworkId: string, dto: SubmitDto) {
    if (user.role !== 'student' || !user.studentId) {
      throw new ForbiddenException('Only students can submit homework');
    }
    const hw = await this.prisma.homework.findFirst({ where: { id: homeworkId, schoolId: user.schoolId } });
    if (!hw) throw new NotFoundException('Homework not found');
    const student = await this.prisma.student.findUnique({ where: { id: user.studentId } });
    if (student?.sectionId !== hw.sectionId) throw new ForbiddenException('Not your section');
    const late = new Date() > hw.dueDate;
    const sub = await this.prisma.homeworkSubmission.upsert({
      where: { homeworkId_studentId: { homeworkId, studentId: user.studentId } },
      create: {
        homeworkId, studentId: user.studentId,
        status: late ? 'late' : 'submitted',
        submittedAt: new Date(), content: dto.content ?? null, fileKey: dto.fileKey ?? null,
      },
      update: {
        status: late ? 'late' : 'submitted',
        submittedAt: new Date(), content: dto.content ?? null, fileKey: dto.fileKey ?? null,
      },
    });
    return sub;
  }

  async gradeSubmission(user: AuthUser, submissionId: string, dto: GradeDto) {
    const sub = await this.prisma.homeworkSubmission.findFirst({
      where: { id: submissionId, homework: { schoolId: user.schoolId } },
      include: { homework: true },
    });
    if (!sub) throw new NotFoundException('Submission not found');
    if (user.role === 'teacher') {
      await this.scope.assertTeacherSubjectSection(user, sub.homework.sectionId, sub.homework.subjectId);
    }
    if (dto.score < 0 || dto.score > sub.homework.maxScore) {
      throw new BadRequestException(`Score must be between 0 and ${sub.homework.maxScore}`);
    }
    return this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: { score: dto.score, feedback: dto.feedback ?? null, status: 'graded' },
    });
  }

  /** student/parent view with today/upcoming/overdue buckets */
  async forStudent(user: AuthUser, studentId: string) {
    await this.scope.assertStudentAccess(user, studentId);
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student?.sectionId) return { today: [], upcoming: [], overdue: [], recent: [] };
    const subs = await this.prisma.homeworkSubmission.findMany({
      where: { studentId, homework: { sectionId: student.sectionId } },
      include: { homework: { include: { subject: { select: { name: true, code: true } } } } },
      orderBy: { homework: { dueDate: 'desc' } },
      take: 100,
    });
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
    const pending = subs.filter((s) => s.status === 'pending');
    return {
      today: pending.filter((s) => s.homework.dueDate >= startOfDay && s.homework.dueDate <= endOfDay),
      upcoming: pending.filter((s) => s.homework.dueDate > endOfDay),
      overdue: pending.filter((s) => s.homework.dueDate < startOfDay),
      recent: subs.filter((s) => s.status !== 'pending').slice(0, 30),
    };
  }
}

@Controller('homework')
export class HomeworkController {
  constructor(private readonly svc: HomeworkService) {}

  @Get()
  @RequirePermission('homework', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { sectionId?: string; subjectId?: string; type?: string }) {
    return this.svc.list(user, q);
  }

  @Get('student/:studentId')
  @RequirePermission('homework', 'read')
  forStudent(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.svc.forStudent(user, studentId);
  }

  @Get(':id')
  @RequirePermission('homework', 'read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.get(user, id);
  }

  @Post()
  @RequirePermission('homework', 'create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHomeworkDto) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('homework', 'update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateHomeworkDto) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('homework', 'delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }

  @Get(':id/submissions')
  @RequirePermission('homework_submissions', 'read')
  submissions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.submissions(user, id);
  }

  @Post(':id/submit')
  @RequirePermission('homework_submissions', 'create')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitDto) {
    return this.svc.submit(user, id, dto);
  }

  @Patch('submissions/:submissionId/grade')
  @RequirePermission('homework_submissions', 'update')
  grade(@CurrentUser() user: AuthUser, @Param('submissionId') sid: string, @Body() dto: GradeDto) {
    return this.svc.gradeSubmission(user, sid, dto);
  }
}

@Module({ controllers: [HomeworkController], providers: [HomeworkService] })
export class HomeworkModule {}
