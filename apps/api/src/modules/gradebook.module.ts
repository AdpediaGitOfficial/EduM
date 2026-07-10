import {
  BadRequestException,
  Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';

class ExamDto {
  @IsString() name!: string;
  @IsIn(['internal', 'external', 'quiz', 'midterm', 'final']) type!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() academicYearId?: string;
}

class ExamSubjectDto {
  @IsString() subjectId!: string;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsInt() maxScore?: number;
  @IsOptional() @IsString() examDate?: string;
}

class RubricDto {
  @IsString() criteria!: string;
  @IsInt() maxScore!: number;
}

class ResultEntryDto {
  @IsString() studentId!: string;
  @IsNumber() score!: number;
  @IsOptional() @IsString() remarks?: string;
}

class BulkResultsDto {
  @IsString() subjectId!: string;
  @IsString() sectionId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ResultEntryDto) entries!: ResultEntryDto[];
}

class BehaviorNoteDto {
  @IsString() studentId!: string;
  @IsIn(['positive', 'negative']) category!: string;
  @IsString() description!: string;
}

class ProgressNoteDto {
  @IsString() studentId!: string;
  @IsString() note!: string;
}

export function gradeFor(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

export function gpaFor(pct: number): number {
  if (pct >= 90) return 10;
  if (pct >= 80) return 9;
  if (pct >= 70) return 8;
  if (pct >= 60) return 7;
  if (pct >= 50) return 6;
  if (pct >= 40) return 5;
  return 0;
}

@Injectable()
export class GradebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ── exams ──
  async listExams(user: AuthUser) {
    return this.prisma.exam.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { startDate: 'desc' },
      include: {
        academicYear: { select: { name: true } },
        _count: { select: { results: true, subjects: true } },
      },
    });
  }

  async getExam(user: AuthUser, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        subjects: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            rubrics: true,
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    return exam;
  }

  async createExam(user: AuthUser, dto: ExamDto) {
    let yearId = dto.academicYearId;
    if (!yearId) {
      const active = await this.prisma.academicYear.findFirst({
        where: { schoolId: user.schoolId, isActive: true },
      });
      if (!active) throw new BadRequestException('No active academic year');
      yearId = active.id;
    }
    const exam = await this.prisma.exam.create({
      data: {
        schoolId: user.schoolId, academicYearId: yearId, name: dto.name,
        type: dto.type as never, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate),
      },
    });
    await this.audit.log(user, 'gradebook', 'exam.create', exam.id, { name: exam.name });
    return exam;
  }

  async updateExam(user: AuthUser, id: string, dto: Partial<ExamDto> & { published?: boolean }) {
    const exam = await this.prisma.exam.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!exam) throw new NotFoundException('Exam not found');
    return this.prisma.exam.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type as never } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
      },
    });
  }

  async deleteExam(user: AuthUser, id: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!exam) throw new NotFoundException('Exam not found');
    await this.prisma.exam.delete({ where: { id } });
    await this.audit.log(user, 'gradebook', 'exam.delete', id);
    return { ok: true };
  }

  async addExamSubject(user: AuthUser, examId: string, dto: ExamSubjectDto) {
    await this.getExam(user, examId);
    return this.prisma.examSubject.create({
      data: {
        examId, subjectId: dto.subjectId, classId: dto.classId ?? null,
        maxScore: dto.maxScore ?? 100, examDate: dto.examDate ? new Date(dto.examDate) : null,
      },
      include: { subject: { select: { name: true } } },
    });
  }

  async addRubric(user: AuthUser, examSubjectId: string, dto: RubricDto) {
    const es = await this.prisma.examSubject.findFirst({
      where: { id: examSubjectId, exam: { schoolId: user.schoolId } },
    });
    if (!es) throw new NotFoundException('Exam subject not found');
    return this.prisma.rubric.create({ data: { assessmentId: examSubjectId, ...dto } });
  }

  async deleteRubric(user: AuthUser, rubricId: string) {
    const r = await this.prisma.rubric.findFirst({
      where: { id: rubricId, assessment: { exam: { schoolId: user.schoolId } } },
    });
    if (!r) throw new NotFoundException('Rubric not found');
    await this.prisma.rubric.delete({ where: { id: rubricId } });
    return { ok: true };
  }

  // ── results ──
  async upsertResults(user: AuthUser, examId: string, dto: BulkResultsDto) {
    const exam = await this.getExam(user, examId);
    await this.scope.assertTeacherSubjectSection(user, dto.sectionId, dto.subjectId);
    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, class: { schoolId: user.schoolId } },
    });
    if (!section) throw new NotFoundException('Section not found');
    const es = exam.subjects.find((s) => s.subjectId === dto.subjectId && (!s.classId || s.classId === section.classId));
    const maxScore = es?.maxScore ?? 100;

    const validStudents = await this.prisma.student.findMany({
      where: { sectionId: dto.sectionId, id: { in: dto.entries.map((e) => e.studentId) } },
      select: { id: true },
    });
    const validIds = new Set(validStudents.map((s) => s.id));
    if (dto.entries.some((e) => !validIds.has(e.studentId))) {
      throw new BadRequestException('Some students do not belong to this section');
    }
    if (dto.entries.some((e) => e.score < 0 || e.score > maxScore)) {
      throw new BadRequestException(`Scores must be between 0 and ${maxScore}`);
    }

    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.examResult.upsert({
          where: {
            examId_studentId_subjectId: { examId, studentId: e.studentId, subjectId: dto.subjectId },
          },
          create: {
            examId, studentId: e.studentId, subjectId: dto.subjectId,
            score: e.score, maxScore, grade: gradeFor((e.score / maxScore) * 100),
            remarks: e.remarks ?? null,
          },
          update: {
            score: e.score, maxScore, grade: gradeFor((e.score / maxScore) * 100),
            remarks: e.remarks ?? null,
          },
        }),
      ),
    );
    await this.audit.log(user, 'gradebook', 'results.upsert', examId, {
      subjectId: dto.subjectId, sectionId: dto.sectionId, count: dto.entries.length,
    });
    return { ok: true, saved: dto.entries.length };
  }

  async sectionResults(user: AuthUser, examId: string, sectionId: string) {
    const restricted = await this.scope.sectionIdsFor(user);
    if (restricted && !restricted.includes(sectionId)) throw new ForbiddenException('No access to this section');
    const students = await this.prisma.student.findMany({
      where: { sectionId, schoolId: user.schoolId },
      orderBy: { rollNo: 'asc' },
      select: { id: true, rollNo: true, admissionNo: true, user: { select: { firstName: true, lastName: true } } },
    });
    const results = await this.prisma.examResult.findMany({
      where: { examId, studentId: { in: students.map((s) => s.id) } },
      include: { exam: { select: { name: true } } },
    });
    const subjects = await this.prisma.subject.findMany({ where: { schoolId: user.schoolId }, orderBy: { name: 'asc' } });

    // build ranking
    const totals = new Map<string, { total: number; max: number }>();
    for (const r of results) {
      const t = totals.get(r.studentId) ?? { total: 0, max: 0 };
      t.total += Number(r.score);
      t.max += r.maxScore;
      totals.set(r.studentId, t);
    }
    const ranked = students
      .map((s) => {
        const t = totals.get(s.id) ?? { total: 0, max: 0 };
        const pct = t.max ? (t.total / t.max) * 100 : 0;
        return { ...s, total: t.total, max: t.max, pct: Math.round(pct * 10) / 10, gpa: gpaFor(pct) };
      })
      .sort((a, b) => b.pct - a.pct)
      .map((s, i) => ({ ...s, rank: i + 1 }));

    return { students: ranked, results, subjects };
  }

  /** per-student gradebook: all exams, all subjects + GPA + rank in section */
  async studentGradebook(user: AuthUser, studentId: string) {
    await this.scope.assertStudentAccess(user, studentId);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { section: { select: { id: true, name: true, class: { select: { name: true } } } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    const results = await this.prisma.examResult.findMany({
      where: { studentId, exam: { published: true } },
      include: { exam: { select: { id: true, name: true, startDate: true } } },
      orderBy: { exam: { startDate: 'asc' } },
    });
    const subjects = await this.prisma.subject.findMany({ where: { schoolId: user.schoolId } });
    const subjectName = new Map<string, string>(subjects.map((s) => [s.id, s.name] as const));

    type ExamRow = { subject: string; score: number; maxScore: number; grade: string | null };
    type ExamAcc = { examId: string; examName: string; date: Date; rows: ExamRow[] };
    const byExam = new Map<string, ExamAcc>();
    for (const r of results) {
      // explicit annotation so the `rows: []` fallback never collapses to never[]
      const e: ExamAcc = byExam.get(r.examId) ?? {
        examId: r.examId,
        examName: r.exam.name,
        date: r.exam.startDate,
        rows: [],
      };
      e.rows.push({
        subject: subjectName.get(r.subjectId) ?? '?',
        score: Number(r.score),
        maxScore: r.maxScore,
        grade: r.grade,
      });
      byExam.set(r.examId, e);
    }
    const exams = Array.from(byExam.values()).map((e) => {
      const total = e.rows.reduce((a, r) => a + r.score, 0);
      const max = e.rows.reduce((a, r) => a + r.maxScore, 0);
      const pct = max ? (total / max) * 100 : 0;
      return { ...e, total, max, pct: Math.round(pct * 10) / 10, gpa: gpaFor(pct), grade: gradeFor(pct) };
    });

    // rank within section for latest exam
    let rank: number | null = null;
    let sectionSize: number | null = null;
    const latest = exams[exams.length - 1];
    if (latest && student.sectionId) {
      const peers = await this.prisma.student.findMany({ where: { sectionId: student.sectionId }, select: { id: true } });
      sectionSize = peers.length;
      const peerResults = await this.prisma.examResult.findMany({
        where: { examId: latest.examId, studentId: { in: peers.map((p) => p.id) } },
      });
      const totals = new Map<string, { t: number; m: number }>();
      for (const r of peerResults) {
        const v = totals.get(r.studentId) ?? { t: 0, m: 0 };
        v.t += Number(r.score); v.m += r.maxScore;
        totals.set(r.studentId, v);
      }
      const ordered = Array.from(totals.entries())
        .map(([id, v]) => ({ id, pct: v.m ? v.t / v.m : 0 }))
        .sort((a, b) => b.pct - a.pct);
      rank = ordered.findIndex((o) => o.id === studentId) + 1 || null;
    }

    return { student, exams, rank, sectionSize };
  }

  // ── behavior & progress notes ──
  async listBehavior(user: AuthUser, studentId: string) {
    await this.scope.assertStudentAccess(user, studentId);
    return this.prisma.behaviorNote.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: { teacher: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });
  }

  async addBehavior(user: AuthUser, dto: BehaviorNoteDto) {
    await this.scope.assertStudentAccess(user, dto.studentId);
    if (!user.staffId) throw new BadRequestException('Only staff can add behavior notes');
    const note = await this.prisma.behaviorNote.create({
      data: {
        studentId: dto.studentId, teacherId: user.staffId,
        category: dto.category as never, description: dto.description,
      },
    });
    await this.audit.log(user, 'gradebook', 'behavior.create', dto.studentId, { category: dto.category });
    return note;
  }

  async deleteBehavior(user: AuthUser, id: string) {
    const note = await this.prisma.behaviorNote.findFirst({
      where: { id, student: { schoolId: user.schoolId } },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (user.role === 'teacher' && note.teacherId !== user.staffId) {
      throw new ForbiddenException('Only the author can delete this note');
    }
    await this.prisma.behaviorNote.delete({ where: { id } });
    return { ok: true };
  }

  async listProgressNotes(user: AuthUser, studentId: string) {
    await this.scope.assertStudentAccess(user, studentId);
    return this.prisma.progressNote.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
  }

  async addProgressNote(user: AuthUser, dto: ProgressNoteDto) {
    await this.scope.assertStudentAccess(user, dto.studentId);
    return this.prisma.progressNote.create({
      data: { studentId: dto.studentId, authorId: user.userId, note: dto.note },
    });
  }
}

@Controller()
export class GradebookController {
  constructor(private readonly svc: GradebookService) {}

  @Get('exams')
  @RequirePermission('gradebook', 'read')
  listExams(@CurrentUser() user: AuthUser) {
    return this.svc.listExams(user);
  }

  @Get('exams/:id')
  @RequirePermission('gradebook', 'read')
  getExam(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.getExam(user, id);
  }

  @Post('exams')
  @RequirePermission('gradebook', 'create')
  createExam(@CurrentUser() user: AuthUser, @Body() dto: ExamDto) {
    return this.svc.createExam(user, dto);
  }

  @Patch('exams/:id')
  @RequirePermission('gradebook', 'update')
  updateExam(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<ExamDto> & { published?: boolean }) {
    return this.svc.updateExam(user, id, dto);
  }

  @Delete('exams/:id')
  @RequirePermission('gradebook', 'delete')
  deleteExam(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteExam(user, id);
  }

  @Post('exams/:id/subjects')
  @RequirePermission('gradebook', 'update')
  addExamSubject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExamSubjectDto) {
    return this.svc.addExamSubject(user, id, dto);
  }

  @Post('exam-subjects/:id/rubrics')
  @RequirePermission('gradebook', 'update')
  addRubric(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RubricDto) {
    return this.svc.addRubric(user, id, dto);
  }

  @Delete('rubrics/:id')
  @RequirePermission('gradebook', 'update')
  deleteRubric(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteRubric(user, id);
  }

  @Post('exams/:id/results')
  @RequirePermission('gradebook', 'update')
  upsertResults(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BulkResultsDto) {
    return this.svc.upsertResults(user, id, dto);
  }

  @Get('exams/:id/results')
  @RequirePermission('gradebook', 'read')
  sectionResults(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('sectionId') sectionId: string) {
    return this.svc.sectionResults(user, id, sectionId);
  }

  @Get('gradebook/student/:studentId')
  @RequirePermission('gradebook', 'read')
  studentGradebook(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.svc.studentGradebook(user, studentId);
  }

  @Get('behavior-notes/:studentId')
  @RequirePermission('gradebook', 'read')
  listBehavior(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.svc.listBehavior(user, studentId);
  }

  @Post('behavior-notes')
  @RequirePermission('gradebook', 'create')
  addBehavior(@CurrentUser() user: AuthUser, @Body() dto: BehaviorNoteDto) {
    return this.svc.addBehavior(user, dto);
  }

  @Delete('behavior-notes/:id')
  @RequirePermission('gradebook', 'delete')
  deleteBehavior(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteBehavior(user, id);
  }

  @Get('progress-notes/:studentId')
  @RequirePermission('gradebook', 'read')
  listProgressNotes(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.svc.listProgressNotes(user, studentId);
  }

  @Post('progress-notes')
  @RequirePermission('gradebook', 'create')
  addProgressNote(@CurrentUser() user: AuthUser, @Body() dto: ProgressNoteDto) {
    return this.svc.addProgressNote(user, dto);
  }
}

@Module({ controllers: [GradebookController], providers: [GradebookService] })
export class GradebookModule {}
