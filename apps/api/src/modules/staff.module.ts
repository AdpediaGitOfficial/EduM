import {
  BadRequestException,
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class CreateStaffDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsEmail() email!: string;
  @IsIn(['teacher', 'principal', 'vice_principal', 'hr', 'accountant']) role!: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() qualifications?: string;
  @IsOptional() @IsString() joinDate?: string;
  @IsOptional() @IsNumber() baseSalary?: number;
  @IsOptional() @IsString() phone?: string;
}

class UpdateStaffDto {
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() qualifications?: string;
  @IsOptional() @IsString() joinDate?: string;
  @IsOptional() @IsNumber() baseSalary?: number;
}

class AssignmentDto {
  @IsString() sectionId!: string;
  @IsString() subjectId!: string;
}

class PerformanceDto {
  @IsString() reviewPeriod!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() notes?: string;
}

class StaffTaskDto {
  @IsString() title!: string;
  @IsOptional() @IsString() detail?: string;
  @IsOptional() @IsString() dueDate?: string;
}

class StaffDocumentDto {
  @IsString() name!: string;
  @IsString() type!: string;
  @IsString() fileKey!: string;
}

const staffInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, status: true, lastLoginAt: true } },
} as const;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery & { department?: string; role?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      schoolId: user.schoolId,
      ...(q.department ? { department: q.department } : {}),
      ...(q.role ? { user: { role: q.role as never } } : {}),
      ...(q.search
        ? {
            OR: [
              { employeeNo: { contains: q.search, mode: 'insensitive' as const } },
              { user: { firstName: { contains: q.search, mode: 'insensitive' as const } } },
              { user: { lastName: { contains: q.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.staff.findMany({ where, skip, take, orderBy: { employeeNo: 'asc' }, include: staffInclude }),
      this.prisma.staff.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async departments(user: AuthUser) {
    const rows = await this.prisma.staff.groupBy({
      by: ['department'],
      where: { schoolId: user.schoolId, department: { not: null } },
      _count: { _all: true },
    });
    return rows.map((r) => ({ department: r.department, count: r._count._all }));
  }

  async get(user: AuthUser, id: string) {
    const s = await this.prisma.staff.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        ...staffInclude,
        documents: true,
        teachingAssignments: {
          include: {
            section: { select: { id: true, name: true, class: { select: { name: true } } } },
            subject: { select: { id: true, name: true, code: true } },
          },
        },
        classTeacherOf: { select: { id: true, name: true, class: { select: { name: true } } } },
        performanceReviews: { orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!s) throw new NotFoundException('Staff member not found');
    return s;
  }

  async create(user: AuthUser, dto: CreateStaffDto) {
    const count = await this.prisma.staff.count({ where: { schoolId: user.schoolId } });
    const tempPassword = `Edu${randomBytes(4).toString('hex')}!`;
    const staff = await this.prisma.staff.create({
      data: {
        school: { connect: { id: user.schoolId } },
        employeeNo: `EMP-${String(count + 200).padStart(3, '0')}`,
        department: dto.department ?? null,
        designation: dto.designation ?? null,
        qualifications: dto.qualifications ?? null,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : new Date(),
        baseSalary: dto.baseSalary ?? 0,
        user: {
          create: {
            school: { connect: { id: user.schoolId } },
            email: dto.email.toLowerCase().trim(),
            passwordHash: await bcrypt.hash(tempPassword, 10),
            role: dto.role as never,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone ?? null,
            mustChangePassword: true,
          },
        },
      },
      include: staffInclude,
    });
    await this.audit.log(user, 'staff', 'staff.create', staff.id, { employeeNo: staff.employeeNo });
    return { staff, tempPassword };
  }

  async update(user: AuthUser, id: string, dto: UpdateStaffDto) {
    const existing = await this.prisma.staff.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!existing) throw new NotFoundException('Staff member not found');
    const updated = await this.prisma.staff.update({
      where: { id },
      data: {
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.designation !== undefined ? { designation: dto.designation } : {}),
        ...(dto.qualifications !== undefined ? { qualifications: dto.qualifications } : {}),
        ...(dto.joinDate !== undefined ? { joinDate: new Date(dto.joinDate) } : {}),
        ...(dto.baseSalary !== undefined ? { baseSalary: dto.baseSalary } : {}),
      },
      include: staffInclude,
    });
    await this.audit.log(user, 'staff', 'staff.update', id, dto as Record<string, unknown>);
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.staff.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!existing) throw new NotFoundException('Staff member not found');
    const payrolls = await this.prisma.payroll.count({ where: { staffId: id } });
    if (payrolls > 0) {
      await this.prisma.user.update({ where: { id: existing.userId }, data: { status: 'archived' } });
      await this.audit.log(user, 'staff', 'staff.archive', id);
      return { ok: true, softDeleted: true };
    }
    await this.prisma.user.delete({ where: { id: existing.userId } });
    await this.audit.log(user, 'staff', 'staff.delete', id);
    return { ok: true };
  }

  // ── subject/section allocation ──
  async addAssignment(user: AuthUser, staffId: string, dto: AssignmentDto) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId: user.schoolId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    const exists = await this.prisma.teachingAssignment.findFirst({
      where: { staffId, sectionId: dto.sectionId, subjectId: dto.subjectId },
    });
    if (exists) throw new BadRequestException('Assignment already exists');
    const a = await this.prisma.teachingAssignment.create({
      data: { staffId, sectionId: dto.sectionId, subjectId: dto.subjectId },
      include: {
        section: { select: { name: true, class: { select: { name: true } } } },
        subject: { select: { name: true } },
      },
    });
    await this.audit.log(user, 'staff', 'staff.assign_subject', staffId, dto as unknown as Record<string, unknown>);
    return a;
  }

  async removeAssignment(user: AuthUser, staffId: string, assignmentId: string) {
    const a = await this.prisma.teachingAssignment.findFirst({
      where: { id: assignmentId, staffId, staff: { schoolId: user.schoolId } },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    await this.prisma.teachingAssignment.delete({ where: { id: assignmentId } });
    await this.audit.log(user, 'staff', 'staff.unassign_subject', staffId, { assignmentId });
    return { ok: true };
  }

  // ── documents ──
  async addDocument(user: AuthUser, staffId: string, dto: StaffDocumentDto) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId: user.schoolId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    return this.prisma.staffDocument.create({ data: { staffId, ...dto } });
  }

  async removeDocument(user: AuthUser, staffId: string, docId: string) {
    const d = await this.prisma.staffDocument.findFirst({
      where: { id: docId, staffId, staff: { schoolId: user.schoolId } },
    });
    if (!d) throw new NotFoundException('Document not found');
    await this.prisma.staffDocument.delete({ where: { id: docId } });
    return { ok: true };
  }

  // ── performance ──
  async addPerformance(user: AuthUser, staffId: string, dto: PerformanceDto) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId: user.schoolId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    const reviewerStaff = user.staffId
      ? await this.prisma.staff.findUnique({ where: { id: user.staffId } })
      : null;
    const perf = await this.prisma.staffPerformance.upsert({
      where: { staffId_reviewPeriod: { staffId, reviewPeriod: dto.reviewPeriod } },
      create: { staffId, reviewPeriod: dto.reviewPeriod, rating: dto.rating, notes: dto.notes ?? null, reviewedById: reviewerStaff?.id ?? null },
      update: { rating: dto.rating, notes: dto.notes ?? null },
    });
    await this.audit.log(user, 'staff', 'staff.performance_review', staffId, { period: dto.reviewPeriod });
    return perf;
  }

  // ── tasks ──
  async addTask(user: AuthUser, staffId: string, dto: StaffTaskDto) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId: user.schoolId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    return this.prisma.staffTask.create({
      data: { staffId, title: dto.title, detail: dto.detail ?? null, dueDate: dto.dueDate ? new Date(dto.dueDate) : null },
    });
  }

  async updateTask(user: AuthUser, staffId: string, taskId: string, status: string) {
    const t = await this.prisma.staffTask.findFirst({
      where: { id: taskId, staffId, staff: { schoolId: user.schoolId } },
    });
    if (!t) throw new NotFoundException('Task not found');
    return this.prisma.staffTask.update({ where: { id: taskId }, data: { status: status as never } });
  }
}

@Controller('staff')
export class StaffController {
  constructor(private readonly svc: StaffService) {}

  @Get()
  @RequirePermission('staff', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { department?: string; role?: string }) {
    return this.svc.list(user, q);
  }

  @Get('departments')
  @RequirePermission('staff', 'read')
  departments(@CurrentUser() user: AuthUser) {
    return this.svc.departments(user);
  }

  @Get(':id')
  @RequirePermission('staff', 'read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.get(user, id);
  }

  @Post()
  @RequirePermission('staff', 'create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('staff', 'update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('staff', 'delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }

  @Post(':id/assignments')
  @RequirePermission('staff', 'update')
  addAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignmentDto) {
    return this.svc.addAssignment(user, id, dto);
  }

  @Delete(':id/assignments/:assignmentId')
  @RequirePermission('staff', 'update')
  removeAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('assignmentId') aid: string) {
    return this.svc.removeAssignment(user, id, aid);
  }

  @Post(':id/documents')
  @RequirePermission('staff', 'update')
  addDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StaffDocumentDto) {
    return this.svc.addDocument(user, id, dto);
  }

  @Delete(':id/documents/:docId')
  @RequirePermission('staff', 'update')
  removeDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('docId') docId: string) {
    return this.svc.removeDocument(user, id, docId);
  }

  @Post(':id/performance')
  @RequirePermission('staff', 'update')
  addPerformance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PerformanceDto) {
    return this.svc.addPerformance(user, id, dto);
  }

  @Post(':id/tasks')
  @RequirePermission('staff', 'update')
  addTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StaffTaskDto) {
    return this.svc.addTask(user, id, dto);
  }

  @Patch(':id/tasks/:taskId')
  @RequirePermission('staff', 'update')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() body: { status: string },
  ) {
    return this.svc.updateTask(user, id, taskId, body.status);
  }
}

@Module({ controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
