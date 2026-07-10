import {
  BadRequestException,
  Body, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class CreateComplaintDto {
  @IsIn(['academic', 'transport', 'fees', 'facility', 'staff', 'other']) category!: string;
  @IsString() subject!: string;
  @IsString() description!: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string;
}

class UpdateComplaintDto {
  @IsOptional() @IsIn(['open', 'in_review', 'escalated', 'resolved', 'closed']) status?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string;
}

const complaintInclude = {
  raisedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery & { status?: string; category?: string; priority?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    // teachers/parents see only their own complaints (scope 'own')
    const own = user.permissionScope === 'own';
    const where = {
      schoolId: user.schoolId,
      ...(own ? { raisedById: user.userId } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.priority ? { priority: q.priority as never } : {}),
      ...(q.search ? { subject: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.complaint.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: complaintInclude }),
      this.prisma.complaint.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async get(user: AuthUser, id: string) {
    const c = await this.prisma.complaint.findFirst({
      where: { id, schoolId: user.schoolId },
      include: complaintInclude,
    });
    if (!c) throw new NotFoundException('Complaint not found');
    if (user.permissionScope === 'own' && c.raisedById !== user.userId) {
      throw new ForbiddenException('You can only view your own complaints');
    }
    return c;
  }

  async create(user: AuthUser, dto: CreateComplaintDto) {
    const c = await this.prisma.complaint.create({
      data: {
        schoolId: user.schoolId,
        raisedById: user.userId,
        category: dto.category,
        subject: dto.subject,
        description: dto.description,
        priority: (dto.priority as never) ?? 'medium',
      },
      include: complaintInclude,
    });
    await this.audit.log(user, 'complaints', 'complaint.create', c.id, { category: dto.category });
    return c;
  }

  async update(user: AuthUser, id: string, dto: UpdateComplaintDto) {
    if (user.permissionScope === 'own') {
      throw new ForbiddenException('You cannot manage complaint workflow');
    }
    const c = await this.get(user, id);
    const resolved = dto.status === 'resolved' || dto.status === 'closed';
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status as never } : {}),
        ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId } : {}),
        ...(dto.resolution !== undefined ? { resolution: dto.resolution } : {}),
        ...(dto.priority ? { priority: dto.priority as never } : {}),
        ...(resolved && !c.resolvedAt ? { resolvedAt: new Date() } : {}),
        ...(dto.status === 'escalated' ? { escalatedAt: new Date() } : {}),
      },
      include: complaintInclude,
    });
    // notify the complainant on state change
    if (dto.status) {
      await this.prisma.notification.create({
        data: {
          userId: c.raisedById,
          channel: 'in_app',
          title: `Complaint ${dto.status.replace('_', ' ')}`,
          body: `Your complaint "${c.subject}" is now ${dto.status.replace('_', ' ')}.`,
          link: '/complaints',
          sentAt: new Date(),
        },
      });
    }
    await this.audit.log(user, 'complaints', 'complaint.update', id, dto as Record<string, unknown>);
    return updated;
  }

  async escalate(user: AuthUser, id: string) {
    const c = await this.get(user, id);
    if (c.status === 'resolved' || c.status === 'closed') {
      throw new BadRequestException('Complaint already resolved');
    }
    // complainants may escalate their own complaint after 48h without resolution
    if (user.permissionScope === 'own') {
      const age = Date.now() - c.createdAt.getTime();
      if (age < 48 * 3600 * 1000) {
        throw new BadRequestException('You can escalate 48 hours after filing if unresolved');
      }
    }
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: { status: 'escalated', escalatedAt: new Date() },
      include: complaintInclude,
    });
    // notify school admins
    const admins = await this.prisma.user.findMany({
      where: { schoolId: user.schoolId, role: { in: ['school_admin', 'principal'] } },
      select: { id: true },
    });
    await this.prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        channel: 'in_app' as never,
        title: 'Complaint escalated',
        body: `"${c.subject}" (${c.priority}) has been escalated.`,
        link: '/admin/complaints',
        sentAt: new Date(),
      })),
    });
    await this.audit.log(user, 'complaints', 'complaint.escalate', id);
    return updated;
  }
}

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly svc: ComplaintsService) {}

  @Get()
  @RequirePermission('complaints', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { status?: string; category?: string; priority?: string }) {
    return this.svc.list(user, q);
  }

  @Get(':id')
  @RequirePermission('complaints', 'read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.get(user, id);
  }

  @Post()
  @RequirePermission('complaints', 'create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('complaints', 'update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/escalate')
  @RequirePermission('complaints', 'create')
  escalate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.escalate(user, id);
  }
}

@Module({ controllers: [ComplaintsController], providers: [ComplaintsService] })
export class ComplaintsModule {}
