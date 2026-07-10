import {
  BadRequestException,
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class AdmitStudentDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() sectionId?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() hostel?: boolean;
  @IsOptional() @IsString() transportRouteStopId?: string;
  // optional guardian to create+link at admission time
  @IsOptional() @IsEmail() guardianEmail?: string;
  @IsOptional() @IsString() guardianFirstName?: string;
  @IsOptional() @IsString() guardianLastName?: string;
  @IsOptional() @IsString() guardianRelation?: string;
}

class UpdateStudentDto {
  @IsOptional() @IsString() sectionId?: string;
  @IsOptional() @IsInt() rollNo?: number;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() hostel?: boolean;
  @IsOptional() @IsString() transportRouteStopId?: string | null;
  @IsOptional() @IsIn(['active', 'promoted', 'transferred', 'alumni', 'withdrawn']) status?: string;
}

class LinkGuardianDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsString() relation!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

class MedicalDto {
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsString() conditions?: string;
  @IsOptional() @IsString() medications?: string;
  @IsOptional() @IsString() emergencyName?: string;
  @IsOptional() @IsString() emergencyPhone?: string;
  @IsOptional() @IsString() notes?: string;
}

class PromoteDto {
  @IsString() toSectionId!: string;
}

class CertificateDto {
  @IsIn(['transfer', 'bonafide', 'character', 'achievement']) type!: string;
  @IsOptional() data?: Record<string, unknown>;
}

const studentInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } },
  section: { select: { id: true, name: true, class: { select: { id: true, name: true, level: true } } } },
} as const;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery & { sectionId?: string; classId?: string; status?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const scopeWhere = await this.scope.studentWhere(user);
    const where = {
      schoolId: user.schoolId,
      ...(scopeWhere as object),
      ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      ...(q.classId ? { section: { classId: q.classId } } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.search
        ? {
            OR: [
              { admissionNo: { contains: q.search, mode: 'insensitive' as const } },
              { user: { firstName: { contains: q.search, mode: 'insensitive' as const } } },
              { user: { lastName: { contains: q.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where, skip, take,
        orderBy: [{ section: { class: { level: 'asc' } } }, { rollNo: 'asc' }],
        include: studentInclude,
      }),
      this.prisma.student.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  /** children of the current parent (convenience for parent portal) */
  async myChildren(user: AuthUser) {
    return this.prisma.student.findMany({
      where: { schoolId: user.schoolId, guardians: { some: { userId: user.userId } } },
      include: studentInclude,
    });
  }

  async get(user: AuthUser, id: string) {
    await this.scope.assertStudentAccess(user, id);
    const s = await this.prisma.student.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        ...studentInclude,
        guardians: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
        },
        medical: true,
        documents: true,
        certificates: true,
        routeStop: { include: { route: { include: { vehicle: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }

  async admit(user: AuthUser, dto: AdmitStudentDto) {
    const count = await this.prisma.student.count({ where: { schoolId: user.schoolId } });
    const year = new Date().getFullYear();
    const tempPassword = `Edu${randomBytes(4).toString('hex')}!`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const student = await this.prisma.student.create({
      data: {
        school: { connect: { id: user.schoolId } },
        admissionNo: `ADM-${year}-${String(count + 1).padStart(3, '0')}`,
        ...(dto.sectionId ? { section: { connect: { id: dto.sectionId } } } : {}),
        dob: dto.dob ? new Date(dto.dob) : null,
        gender: (dto.gender as never) ?? null,
        bloodGroup: dto.bloodGroup ?? null,
        address: dto.address ?? null,
        hostel: dto.hostel ?? false,
        ...(dto.transportRouteStopId ? { routeStop: { connect: { id: dto.transportRouteStopId } } } : {}),
        user: {
          create: {
            school: { connect: { id: user.schoolId } },
            email: dto.email.toLowerCase().trim(),
            passwordHash,
            role: 'student' as never,
            firstName: dto.firstName,
            lastName: dto.lastName,
            mustChangePassword: true,
          },
        },
        medical: { create: {} },
      },
      include: studentInclude,
    });

    let guardianTempPassword: string | undefined;
    if (dto.guardianEmail) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.guardianEmail.toLowerCase().trim() } });
      let guardianUserId = existing?.id;
      if (!guardianUserId) {
        guardianTempPassword = `Edu${randomBytes(4).toString('hex')}!`;
        const gu = await this.prisma.user.create({
          data: {
            schoolId: user.schoolId,
            email: dto.guardianEmail.toLowerCase().trim(),
            passwordHash: await bcrypt.hash(guardianTempPassword, 10),
            role: 'parent',
            firstName: dto.guardianFirstName ?? 'Parent',
            lastName: dto.guardianLastName ?? dto.lastName,
            mustChangePassword: true,
          },
        });
        guardianUserId = gu.id;
      }
      await this.prisma.guardian.create({
        data: { studentId: student.id, userId: guardianUserId, relation: dto.guardianRelation ?? 'guardian', isPrimary: true },
      });
    }

    await this.audit.log(user, 'students', 'student.admit', student.id, { admissionNo: student.admissionNo });
    return { student, tempPassword, guardianTempPassword };
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentDto) {
    const existing = await this.prisma.student.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!existing) throw new NotFoundException('Student not found');
    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.rollNo !== undefined ? { rollNo: dto.rollNo } : {}),
        ...(dto.dob !== undefined ? { dob: dto.dob ? new Date(dto.dob) : null } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender as never } : {}),
        ...(dto.bloodGroup !== undefined ? { bloodGroup: dto.bloodGroup } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.hostel !== undefined ? { hostel: dto.hostel } : {}),
        ...(dto.transportRouteStopId !== undefined ? { transportRouteStopId: dto.transportRouteStopId } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
      },
      include: studentInclude,
    });
    await this.audit.log(user, 'students', 'student.update', id, dto as Record<string, unknown>);
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.student.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!existing) throw new NotFoundException('Student not found');
    const invoices = await this.prisma.feeInvoice.count({ where: { studentId: id } });
    if (invoices > 0) {
      // financial records are RESTRICT — mark withdrawn instead of hard delete
      await this.prisma.student.update({ where: { id }, data: { status: 'withdrawn' } });
      await this.audit.log(user, 'students', 'student.withdraw', id);
      return { ok: true, softDeleted: true };
    }
    await this.prisma.user.delete({ where: { id: existing.userId } }); // cascades student
    await this.audit.log(user, 'students', 'student.delete', id);
    return { ok: true };
  }

  async linkGuardian(user: AuthUser, studentId: string, dto: LinkGuardianDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    let userId = dto.userId;
    let tempPassword: string | undefined;
    if (!userId) {
      if (!dto.email) throw new BadRequestException('Provide userId or email');
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
      if (existing) {
        userId = existing.id;
      } else {
        tempPassword = `Edu${randomBytes(4).toString('hex')}!`;
        const created = await this.prisma.user.create({
          data: {
            schoolId: user.schoolId,
            email: dto.email.toLowerCase().trim(),
            passwordHash: await bcrypt.hash(tempPassword, 10),
            role: 'parent',
            firstName: dto.firstName ?? 'Parent',
            lastName: dto.lastName ?? '',
            mustChangePassword: true,
          },
        });
        userId = created.id;
      }
    }
    const link = await this.prisma.guardian.create({
      data: { studentId, userId: userId!, relation: dto.relation, isPrimary: dto.isPrimary ?? false },
    });
    await this.audit.log(user, 'students', 'guardian.link', studentId, { guardianUserId: userId });
    return { link, tempPassword };
  }

  async unlinkGuardian(user: AuthUser, studentId: string, guardianId: string) {
    const g = await this.prisma.guardian.findFirst({
      where: { id: guardianId, studentId, student: { schoolId: user.schoolId } },
    });
    if (!g) throw new NotFoundException('Guardian link not found');
    await this.prisma.guardian.delete({ where: { id: guardianId } });
    await this.audit.log(user, 'students', 'guardian.unlink', studentId, { guardianId });
    return { ok: true };
  }

  async getMedical(user: AuthUser, studentId: string) {
    await this.scope.assertStudentAccess(user, studentId);
    return this.prisma.studentMedical.findUnique({ where: { studentId } });
  }

  async updateMedical(user: AuthUser, studentId: string, dto: MedicalDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    const medical = await this.prisma.studentMedical.upsert({
      where: { studentId },
      create: { studentId, ...dto },
      update: { ...dto },
    });
    await this.audit.log(user, 'students', 'student.medical_update', studentId);
    return medical;
  }

  async promote(user: AuthUser, studentId: string, dto: PromoteDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    const section = await this.prisma.section.findFirst({
      where: { id: dto.toSectionId, class: { schoolId: user.schoolId } },
    });
    if (!section) throw new BadRequestException('Target section not found');
    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data: { sectionId: dto.toSectionId, status: 'active' },
      include: studentInclude,
    });
    await this.audit.log(user, 'students', 'student.promote', studentId, { toSectionId: dto.toSectionId });
    return updated;
  }

  async markAlumni(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data: { status: 'alumni', sectionId: null },
    });
    await this.audit.log(user, 'students', 'student.alumni', studentId);
    return updated;
  }

  async issueCertificate(user: AuthUser, studentId: string, dto: CertificateDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    const count = await this.prisma.certificate.count();
    const cert = await this.prisma.certificate.create({
      data: {
        studentId, type: dto.type,
        serialNo: `CERT-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`,
        data: (dto.data ?? {}) as object,
      },
    });
    await this.audit.log(user, 'students', 'certificate.issue', studentId, { type: dto.type });
    return cert;
  }
}

@Controller('students')
export class StudentsController {
  constructor(private readonly svc: StudentsService) {}

  @Get()
  @RequirePermission('students', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { sectionId?: string; classId?: string; status?: string }) {
    return this.svc.list(user, q);
  }

  @Get('my-children')
  @RequirePermission('students', 'read')
  myChildren(@CurrentUser() user: AuthUser) {
    return this.svc.myChildren(user);
  }

  @Get(':id')
  @RequirePermission('students', 'read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.get(user, id);
  }

  @Post()
  @RequirePermission('students', 'create')
  admit(@CurrentUser() user: AuthUser, @Body() dto: AdmitStudentDto) {
    return this.svc.admit(user, dto);
  }

  @Patch(':id')
  @RequirePermission('students', 'update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('students', 'delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }

  @Post(':id/guardians')
  @RequirePermission('students', 'update')
  linkGuardian(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkGuardianDto) {
    return this.svc.linkGuardian(user, id, dto);
  }

  @Delete(':id/guardians/:guardianId')
  @RequirePermission('students', 'update')
  unlinkGuardian(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('guardianId') gid: string) {
    return this.svc.unlinkGuardian(user, id, gid);
  }

  @Get(':id/medical')
  @RequirePermission('students', 'read')
  getMedical(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.getMedical(user, id);
  }

  @Patch(':id/medical')
  @RequirePermission('students', 'update')
  updateMedical(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MedicalDto) {
    return this.svc.updateMedical(user, id, dto);
  }

  @Post(':id/promote')
  @RequirePermission('students', 'update')
  promote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PromoteDto) {
    return this.svc.promote(user, id, dto);
  }

  @Post(':id/alumni')
  @RequirePermission('students', 'update')
  markAlumni(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.markAlumni(user, id);
  }

  @Post(':id/certificates')
  @RequirePermission('students', 'update')
  issueCertificate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CertificateDto) {
    return this.svc.issueCertificate(user, id, dto);
  }
}

@Module({ controllers: [StudentsController], providers: [StudentsService] })
export class StudentsModule {}
