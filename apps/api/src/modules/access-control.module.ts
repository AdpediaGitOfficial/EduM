import {
  BadRequestException,
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Post, Put, Query,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { PermissionsService } from '../common/permissions.service';
import { ALL_MODULES, ALL_ROLES, PERMISSION_MATRIX } from '../common/permissions.matrix';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class MatrixEntryDto {
  @IsIn(ALL_ROLES) role!: string;
  @IsString() module!: string;
  @IsIn(['create', 'read', 'update', 'delete', 'export']) action!: string;
  @IsOptional() @IsString() scope?: string;
  @IsBoolean() granted!: boolean;
}

class UpdateMatrixDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => MatrixEntryDto) changes!: MatrixEntryDto[];
}

class IpEntryDto {
  @IsString() cidr!: string;
  @IsOptional() @IsString() label?: string;
}

@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permCache: PermissionsService,
  ) {}

  async matrix(user: AuthUser) {
    const rows = await this.prisma.permission.findMany({ where: { schoolId: user.schoolId } });
    return {
      roles: ALL_ROLES,
      modules: Array.from(new Set([...ALL_MODULES, ...rows.map((r) => r.module)])).sort(),
      actions: ['create', 'read', 'update', 'delete', 'export'],
      permissions: rows.map((r) => ({ role: r.role, module: r.module, action: r.action, scope: r.scope })),
    };
  }

  async updateMatrix(user: AuthUser, dto: UpdateMatrixDto) {
    // super_admin permissions can only be edited by a super_admin (no self-lockout of the top role)
    for (const change of dto.changes) {
      if (change.role === 'super_admin' && user.role !== 'super_admin') {
        throw new BadRequestException('Only a super admin can edit super admin permissions');
      }
    }
    for (const change of dto.changes) {
      if (change.granted) {
        await this.prisma.permission.upsert({
          where: {
            schoolId_role_module_action: {
              schoolId: user.schoolId,
              role: change.role as never,
              module: change.module,
              action: change.action as never,
            },
          },
          create: {
            schoolId: user.schoolId,
            role: change.role as never,
            module: change.module,
            action: change.action as never,
            scope: change.scope ?? null,
          },
          update: { scope: change.scope ?? null },
        });
      } else {
        await this.prisma.permission.deleteMany({
          where: {
            schoolId: user.schoolId,
            role: change.role as never,
            module: change.module,
            action: change.action as never,
          },
        });
      }
    }
    this.permCache.invalidate(user.schoolId);
    await this.audit.log(user, 'access_control', 'matrix.update', undefined, { changes: dto.changes.length });
    return { ok: true, applied: dto.changes.length };
  }

  async resetMatrix(user: AuthUser) {
    await this.prisma.permission.deleteMany({ where: { schoolId: user.schoolId } });
    await this.prisma.permission.createMany({
      data: PERMISSION_MATRIX.map((p) => ({
        schoolId: user.schoolId,
        role: p.role as never,
        module: p.module,
        action: p.action as never,
        scope: p.scope ?? null,
      })),
      skipDuplicates: true,
    });
    this.permCache.invalidate(user.schoolId);
    await this.audit.log(user, 'access_control', 'matrix.reset');
    return { ok: true };
  }

  async auditLogs(user: AuthUser, q: PageQuery & { module?: string; userId?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      schoolId: user.schoolId,
      ...(q.module ? { module: q.module } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.search ? { action: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, role: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async sessions(user: AuthUser, q: PageQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { schoolId: user.schoolId },
    };
    const [items, total] = await Promise.all([
      this.prisma.session.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        select: {
          id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async revokeSession(user: AuthUser, id: string) {
    const s = await this.prisma.session.findFirst({
      where: { id, user: { schoolId: user.schoolId } },
    });
    if (!s) throw new NotFoundException('Session not found');
    await this.prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.log(user, 'access_control', 'session.revoke', id);
    return { ok: true };
  }

  async ipAllowlist(user: AuthUser) {
    return this.prisma.ipAllowlistEntry.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addIp(user: AuthUser, dto: IpEntryDto) {
    const entry = await this.prisma.ipAllowlistEntry.create({
      data: { schoolId: user.schoolId, cidr: dto.cidr, label: dto.label ?? null },
    });
    await this.audit.log(user, 'access_control', 'ip_allowlist.add', entry.id, { cidr: dto.cidr });
    return entry;
  }

  async removeIp(user: AuthUser, id: string) {
    const e = await this.prisma.ipAllowlistEntry.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!e) throw new NotFoundException('Entry not found');
    await this.prisma.ipAllowlistEntry.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('access-control')
export class AccessControlController {
  constructor(private readonly svc: AccessControlService) {}

  @Get('matrix')
  @RequirePermission('access_control', 'read')
  matrix(@CurrentUser() user: AuthUser) {
    return this.svc.matrix(user);
  }

  @Put('matrix')
  @RequirePermission('access_control', 'update')
  updateMatrix(@CurrentUser() user: AuthUser, @Body() dto: UpdateMatrixDto) {
    return this.svc.updateMatrix(user, dto);
  }

  @Post('matrix/reset')
  @RequirePermission('access_control', 'update')
  resetMatrix(@CurrentUser() user: AuthUser) {
    return this.svc.resetMatrix(user);
  }

  @Get('audit-logs')
  @RequirePermission('access_control', 'read')
  auditLogs(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { module?: string; userId?: string }) {
    return this.svc.auditLogs(user, q);
  }

  @Get('sessions')
  @RequirePermission('access_control', 'read')
  sessions(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    return this.svc.sessions(user, q);
  }

  @Delete('sessions/:id')
  @RequirePermission('access_control', 'delete')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.revokeSession(user, id);
  }

  @Get('ip-allowlist')
  @RequirePermission('access_control', 'read')
  ipAllowlist(@CurrentUser() user: AuthUser) {
    return this.svc.ipAllowlist(user);
  }

  @Post('ip-allowlist')
  @RequirePermission('access_control', 'create')
  addIp(@CurrentUser() user: AuthUser, @Body() dto: IpEntryDto) {
    return this.svc.addIp(user, dto);
  }

  @Delete('ip-allowlist/:id')
  @RequirePermission('access_control', 'delete')
  removeIp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removeIp(user, id);
  }
}

@Module({ controllers: [AccessControlController], providers: [AccessControlService] })
export class AccessControlModule {}
