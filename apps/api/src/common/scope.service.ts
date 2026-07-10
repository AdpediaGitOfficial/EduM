import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './decorators';

/**
 * Service-layer scoping (the real security boundary, per spec Section 2):
 *  - teacher  → only sections/subjects they are assigned to
 *  - parent   → only students linked via the guardians table (query-level filter)
 *  - student  → only their own record
 * Never trusts a client-passed student_id/section_id on its own.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prisma `where` fragment limiting Student rows to what `user` may see. */
  async studentWhere(user: AuthUser): Promise<Record<string, unknown>> {
    switch (user.role) {
      case 'student':
        return { userId: user.userId };
      case 'parent':
        // WHERE id IN (SELECT student_id FROM guardians WHERE user_id = :me)
        return { guardians: { some: { userId: user.userId } } };
      case 'teacher': {
        const sectionIds = await this.teacherSectionIds(user);
        return { sectionId: { in: sectionIds } };
      }
      default:
        return { schoolId: user.schoolId };
    }
  }

  /** IDs of students the user may see. */
  async accessibleStudentIds(user: AuthUser): Promise<string[]> {
    const where = await this.studentWhere(user);
    const rows = await this.prisma.student.findMany({
      where: { schoolId: user.schoolId, ...(where as object) },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Throws 403 unless the user may read this specific student. */
  async assertStudentAccess(user: AuthUser, studentId: string): Promise<void> {
    const where = await this.studentWhere(user);
    const found = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, ...(where as object) },
      select: { id: true },
    });
    if (!found) throw new ForbiddenException('You do not have access to this student');
  }

  async teacherSectionIds(user: AuthUser): Promise<string[]> {
    if (!user.staffId) return [];
    const [assignments, classTeacherOf] = await Promise.all([
      this.prisma.teachingAssignment.findMany({
        where: { staffId: user.staffId },
        select: { sectionId: true },
      }),
      this.prisma.section.findMany({
        where: { classTeacherId: user.staffId },
        select: { id: true },
      }),
    ]);
    return Array.from(new Set([...assignments.map((a) => a.sectionId), ...classTeacherOf.map((s) => s.id)]));
  }

  /** Teacher's (sectionId, subjectId) pairs — for homework/gradebook scoping. */
  async teacherAssignments(user: AuthUser) {
    if (!user.staffId) return [];
    return this.prisma.teachingAssignment.findMany({
      where: { staffId: user.staffId },
      select: { sectionId: true, subjectId: true },
    });
  }

  async assertTeacherSection(user: AuthUser, sectionId: string): Promise<void> {
    if (user.role !== 'teacher') return;
    const ids = await this.teacherSectionIds(user);
    if (!ids.includes(sectionId)) {
      throw new ForbiddenException('You are not assigned to this section');
    }
  }

  async assertTeacherSubjectSection(user: AuthUser, sectionId: string, subjectId: string): Promise<void> {
    if (user.role !== 'teacher') return;
    // strict 'own_subjects' scope: requires an explicit teaching assignment
    // (being class teacher of the section is NOT enough for subject work)
    const found = await this.prisma.teachingAssignment.findFirst({
      where: { staffId: user.staffId ?? '', sectionId, subjectId },
      select: { id: true },
    });
    if (!found) throw new ForbiddenException('You are not assigned to this subject/section');
  }

  /** Section ids visible to the user (for list filtering). */
  async sectionIdsFor(user: AuthUser): Promise<string[] | null> {
    switch (user.role) {
      case 'teacher':
        return this.teacherSectionIds(user);
      case 'student': {
        const s = await this.prisma.student.findUnique({
          where: { userId: user.userId },
          select: { sectionId: true },
        });
        return s?.sectionId ? [s.sectionId] : [];
      }
      case 'parent': {
        const kids = await this.prisma.student.findMany({
          where: { guardians: { some: { userId: user.userId } } },
          select: { sectionId: true },
        });
        return kids.map((k) => k.sectionId).filter((x): x is string => !!x);
      }
      default:
        return null; // null = unrestricted within school
    }
  }
}
