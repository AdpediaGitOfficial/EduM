import {
  BadRequestException,
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';
import { ALL_ROLES } from '../common/permissions.matrix';

class InviteUserDto {
  @IsEmail() email!: string;
  @IsIn(ALL_ROLES) role!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() phone?: string;
}

class UpdateUserDto {
  @IsOptional() @IsIn(ALL_ROLES) role?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn(['invited', 'active', 'suspended', 'archived']) status?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private hrGuard(user: AuthUser, targetRole: string) {
    // hr's users permission is scoped to staff roles only
    if (user.permissionScope === 'staff') {
      const staffRoles = ['teacher', 'hr', 'accountant', 'principal', 'vice_principal'];
      if (!staffRoles.includes(targetRole)) {
        throw new BadRequestException('HR can only manage staff accounts');
      }
    }
  }

  async list(user: AuthUser, q: PageQuery & { role?: string; status?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      schoolId: user.schoolId,
      ...(q.role ? { role: q.role as never } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' as const } },
              { lastName: { contains: q.search, mode: 'insensitive' as const } },
              { email: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, role: true, firstName: true, lastName: true,
          phone: true, status: true, lastLoginAt: true, createdAt: true, avatarUrl: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async get(user: AuthUser, id: string) {
    const found = await this.prisma.user.findFirst({
      where: { id, schoolId: user.schoolId },
      select: {
        id: true, email: true, role: true, firstName: true, lastName: true, phone: true,
        status: true, lastLoginAt: true, createdAt: true, avatarUrl: true, mustChangePassword: true,
        staff: { select: { id: true, employeeNo: true, department: true, designation: true } },
        student: { select: { id: true, admissionNo: true } },
      },
    });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  async invite(user: AuthUser, dto: InviteUserDto) {
    this.hrGuard(user, dto.role);
    const tempPassword = `Edu${randomBytes(4).toString('hex')}!`;
    const created = await this.prisma.user.create({
      data: {
        schoolId: user.schoolId,
        email: dto.email.toLowerCase().trim(),
        passwordHash: await bcrypt.hash(tempPassword, 10),
        role: dto.role as never,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        status: 'active',
        mustChangePassword: true,
      },
    });
    await this.prisma.notification.create({
      data: {
        userId: created.id, channel: 'email', title: 'Welcome to EduM',
        body: 'Your account was created. Sign in with the temporary password shared by your administrator.',
        sentAt: new Date(),
      },
    });
    await this.audit.log(user, 'users', 'user.invite', created.id, { email: created.email, role: created.role });
    // Temp password returned to the inviting admin (mock email provider in dev).
    return { id: created.id, email: created.email, tempPassword };
  }

  async update(user: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.get(user, id);
    if (dto.role) this.hrGuard(user, dto.role);
    this.hrGuard(user, target.role);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.role ? { role: dto.role as never } : {}),
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.status ? { status: dto.status as never } : {}),
      },
      select: { id: true, email: true, role: true, status: true },
    });
    await this.audit.log(user, 'users', 'user.update', id, dto as Record<string, unknown>);
    return updated;
  }

  async archive(user: AuthUser, id: string) {
    const target = await this.get(user, id);
    this.hrGuard(user, target.role);
    if (id === user.userId) throw new BadRequestException('You cannot archive your own account');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'archived' } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log(user, 'users', 'user.archive', id);
    return { ok: true };
  }

  async resetPassword(user: AuthUser, id: string) {
    const target = await this.get(user, id);
    this.hrGuard(user, target.role);
    const tempPassword = `Edu${randomBytes(4).toString('hex')}!`;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
      }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log(user, 'users', 'user.reset_password', id);
    return { ok: true, tempPassword };
  }

  async activity(user: AuthUser, id: string, q: PageQuery) {
    await this.get(user, id);
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = { schoolId: user.schoolId, userId: id };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async loginHistory(user: AuthUser, id: string, q: PageQuery) {
    await this.get(user, id);
    const { skip, take, page, pageSize } = pageArgs(q);
    const [items, total] = await Promise.all([
      this.prisma.loginEvent.findMany({ where: { userId: id }, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.loginEvent.count({ where: { userId: id } }),
    ]);
    return paged(items, total, page, pageSize);
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @RequirePermission('users', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { role?: string; status?: string }) {
    return this.svc.list(user, q);
  }

  @Get(':id')
  @RequirePermission('users', 'read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.get(user, id);
  }

  @Post()
  @RequirePermission('users', 'create')
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.svc.invite(user, dto);
  }

  @Patch(':id')
  @RequirePermission('users', 'update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('users', 'delete')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.archive(user, id);
  }

  @Post(':id/reset-password')
  @RequirePermission('users', 'update')
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.resetPassword(user, id);
  }

  @Get(':id/activity')
  @RequirePermission('users', 'read')
  activity(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: PageQuery) {
    return this.svc.activity(user, id, q);
  }

  @Get(':id/login-history')
  @RequirePermission('users', 'read')
  loginHistory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: PageQuery) {
    return this.svc.loginHistory(user, id, q);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
