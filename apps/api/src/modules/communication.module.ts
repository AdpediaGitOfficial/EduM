import {
  BadRequestException,
  Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { NotifyService } from './notifications.module';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class AnnouncementDto {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsIn(['school', 'role', 'class_section', 'individual']) audience!: string;
  @IsOptional() @IsString() targetRole?: string;
  @IsOptional() @IsString() targetSectionId?: string;
  @IsOptional() @IsString() targetUserId?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsString() expiresAt?: string;
  /** also fan out through mock email/SMS providers */
  @IsOptional() @IsBoolean() notify?: boolean;
}

class MessageDto {
  @IsString() recipientId!: string;
  @IsString() body!: string;
}

@Injectable()
export class CommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
  ) {}

  // ── announcements / notice board ──

  /** which announcements can this user see? */
  private async audienceFilter(user: AuthUser) {
    const or: object[] = [
      { audience: 'school' },
      { audience: 'role', targetRole: user.role },
      { audience: 'individual', targetUserId: user.userId },
    ];
    // class-targeted: student's own section, parent's children's sections, teacher's sections
    const sectionIds: string[] = [];
    if (user.role === 'student' && user.studentId) {
      const s = await this.prisma.student.findUnique({ where: { id: user.studentId }, select: { sectionId: true } });
      if (s?.sectionId) sectionIds.push(s.sectionId);
    } else if (user.role === 'parent') {
      const kids = await this.prisma.student.findMany({
        where: { guardians: { some: { userId: user.userId } } },
        select: { sectionId: true },
      });
      sectionIds.push(...kids.map((k) => k.sectionId).filter((x): x is string => !!x));
    } else if (user.role === 'teacher' && user.staffId) {
      const asg = await this.prisma.teachingAssignment.findMany({
        where: { staffId: user.staffId }, select: { sectionId: true },
      });
      sectionIds.push(...asg.map((a) => a.sectionId));
    }
    if (sectionIds.length) or.push({ audience: 'class_section', targetSectionId: { in: sectionIds } });
    // staff/admin roles see class-targeted announcements too
    if (['super_admin', 'school_admin', 'principal', 'vice_principal'].includes(user.role)) {
      or.push({ audience: 'class_section' }, { audience: 'role' }, { audience: 'individual' });
    }
    return or;
  }

  async listAnnouncements(user: AuthUser, q: PageQuery & { pinned?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const or = await this.audienceFilter(user);
    const where = {
      schoolId: user.schoolId,
      OR: or,
      ...(q.pinned === 'true' ? { pinned: true } : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' as const } } : {}),
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    };
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where, skip, take,
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        include: {
          author: { select: { firstName: true, lastName: true, role: true } },
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async createAnnouncement(user: AuthUser, dto: AnnouncementDto) {
    if (dto.audience === 'role' && !dto.targetRole) throw new BadRequestException('targetRole required');
    if (dto.audience === 'class_section' && !dto.targetSectionId) throw new BadRequestException('targetSectionId required');
    if (dto.audience === 'individual' && !dto.targetUserId) throw new BadRequestException('targetUserId required');

    const a = await this.prisma.announcement.create({
      data: {
        schoolId: user.schoolId,
        authorId: user.userId,
        title: dto.title,
        body: dto.body,
        audience: dto.audience as never,
        targetRole: (dto.targetRole as never) ?? null,
        targetSectionId: dto.targetSectionId ?? null,
        targetUserId: dto.targetUserId ?? null,
        pinned: dto.pinned ?? false,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    // fan out in-app notifications to the audience
    const recipients = await this.resolveAudience(user, dto);
    await this.notify.dispatchMany(
      recipients,
      { title: `📢 ${dto.title}`, body: dto.body.slice(0, 200), link: '/announcements' },
      dto.notify ? ['in_app', 'email'] : ['in_app'],
    );
    await this.audit.log(user, 'communication', 'announcement.create', a.id, { audience: dto.audience });
    return a;
  }

  private async resolveAudience(user: AuthUser, dto: AnnouncementDto): Promise<string[]> {
    if (dto.audience === 'individual' && dto.targetUserId) return [dto.targetUserId];
    if (dto.audience === 'role' && dto.targetRole) {
      const users = await this.prisma.user.findMany({
        where: { schoolId: user.schoolId, role: dto.targetRole as never, status: 'active' },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    if (dto.audience === 'class_section' && dto.targetSectionId) {
      const students = await this.prisma.student.findMany({
        where: { sectionId: dto.targetSectionId },
        select: { userId: true, guardians: { select: { userId: true } } },
      });
      const ids = new Set<string>();
      for (const s of students) {
        ids.add(s.userId);
        s.guardians.forEach((g) => ids.add(g.userId));
      }
      return Array.from(ids);
    }
    const users = await this.prisma.user.findMany({
      where: { schoolId: user.schoolId, status: 'active' },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async updateAnnouncement(user: AuthUser, id: string, dto: Partial<AnnouncementDto>) {
    const a = await this.prisma.announcement.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!a) throw new NotFoundException('Announcement not found');
    if (user.role === 'teacher' && a.authorId !== user.userId) {
      throw new ForbiddenException('Only the author can edit');
    }
    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
      },
    });
  }

  async deleteAnnouncement(user: AuthUser, id: string) {
    const a = await this.prisma.announcement.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!a) throw new NotFoundException('Announcement not found');
    if (user.role === 'teacher' && a.authorId !== user.userId) {
      throw new ForbiddenException('Only the author can delete');
    }
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  // ── chat (parent-teacher / teacher-student) ──

  /** who may this user message? */
  async contacts(user: AuthUser) {
    const school = { schoolId: user.schoolId, status: 'active' as never };
    if (user.role === 'parent') {
      // teachers of my children's sections + school admin
      const kids = await this.prisma.student.findMany({
        where: { guardians: { some: { userId: user.userId } } },
        select: { sectionId: true },
      });
      const sectionIds = kids.map((k) => k.sectionId).filter((x): x is string => !!x);
      const assignments = await this.prisma.teachingAssignment.findMany({
        where: { sectionId: { in: sectionIds } },
        select: { staff: { select: { userId: true } } },
      });
      const classTeachers = await this.prisma.section.findMany({
        where: { id: { in: sectionIds }, classTeacherId: { not: null } },
        select: { classTeacher: { select: { userId: true } } },
      });
      const ids = new Set<string>([
        ...assignments.map((a) => a.staff.userId),
        ...classTeachers.map((c) => c.classTeacher!.userId),
      ]);
      const admins = await this.prisma.user.findMany({ where: { ...school, role: 'school_admin' }, select: { id: true } });
      admins.forEach((a) => ids.add(a.id));
      return this.userCards(Array.from(ids));
    }
    if (user.role === 'student') {
      const me = await this.prisma.student.findUnique({ where: { userId: user.userId }, select: { sectionId: true } });
      if (!me?.sectionId) return [];
      const assignments = await this.prisma.teachingAssignment.findMany({
        where: { sectionId: me.sectionId },
        select: { staff: { select: { userId: true } } },
      });
      const ct = await this.prisma.section.findUnique({
        where: { id: me.sectionId },
        select: { classTeacher: { select: { userId: true } } },
      });
      const ids = new Set<string>(assignments.map((a) => a.staff.userId));
      if (ct?.classTeacher) ids.add(ct.classTeacher.userId);
      return this.userCards(Array.from(ids));
    }
    if (user.role === 'teacher' && user.staffId) {
      // students in my sections + their parents + leadership
      const sections = await this.prisma.teachingAssignment.findMany({
        where: { staffId: user.staffId }, select: { sectionId: true },
      });
      const own = await this.prisma.section.findMany({
        where: { classTeacherId: user.staffId }, select: { id: true },
      });
      const sectionIds = Array.from(new Set([...sections.map((s) => s.sectionId), ...own.map((o) => o.id)]));
      const students = await this.prisma.student.findMany({
        where: { sectionId: { in: sectionIds } },
        select: { userId: true, guardians: { select: { userId: true } } },
      });
      const ids = new Set<string>();
      for (const s of students) {
        ids.add(s.userId);
        s.guardians.forEach((g) => ids.add(g.userId));
      }
      const leadership = await this.prisma.user.findMany({
        where: { ...school, role: { in: ['school_admin', 'principal', 'vice_principal'] } },
        select: { id: true },
      });
      leadership.forEach((l) => ids.add(l.id));
      return this.userCards(Array.from(ids));
    }
    // admin/leadership/hr/accountant: everyone in school (paged client-side by search)
    const users = await this.prisma.user.findMany({
      where: { ...school, id: { not: user.userId } },
      select: { id: true },
      take: 500,
    });
    return this.userCards(users.map((u) => u.id));
  }

  private async userCards(ids: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });
  }

  async threads(user: AuthUser) {
    const messages = await this.prisma.message.findMany({
      where: { OR: [{ senderId: user.userId }, { recipientId: user.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        recipient: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
    const byPeer = new Map<string, { peer: { id: string; firstName: string; lastName: string; role: string }; last: (typeof messages)[0]; unread: number }>();
    for (const m of messages) {
      const peer = m.senderId === user.userId ? m.recipient : m.sender;
      const entry = byPeer.get(peer.id);
      if (!entry) {
        byPeer.set(peer.id, {
          peer,
          last: m,
          unread: m.recipientId === user.userId && !m.readAt ? 1 : 0,
        });
      } else if (m.recipientId === user.userId && !m.readAt) {
        entry.unread++;
      }
    }
    return Array.from(byPeer.values());
  }

  async thread(user: AuthUser, peerId: string) {
    const msgs = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.userId, recipientId: peerId },
          { senderId: peerId, recipientId: user.userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    await this.prisma.message.updateMany({
      where: { senderId: peerId, recipientId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return msgs;
  }

  async send(user: AuthUser, dto: MessageDto) {
    if (dto.recipientId === user.userId) throw new BadRequestException('Cannot message yourself');
    const recipient = await this.prisma.user.findFirst({
      where: { id: dto.recipientId, schoolId: user.schoolId, status: 'active' },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    // enforce contactability for scoped roles (parents/students/teachers)
    if (['parent', 'student', 'teacher'].includes(user.role)) {
      const allowed = await this.contacts(user);
      if (!allowed.some((c) => c.id === dto.recipientId)) {
        throw new ForbiddenException('You cannot message this user');
      }
    }
    const msg = await this.prisma.message.create({
      data: { senderId: user.userId, recipientId: dto.recipientId, body: dto.body },
    });
    await this.notify.dispatchMany(
      [dto.recipientId],
      { title: `New message from ${user.name}`, body: dto.body.slice(0, 120), link: '/communication' },
      ['in_app'],
    );
    return msg;
  }
}

@Controller()
export class CommunicationController {
  constructor(private readonly svc: CommunicationService) {}

  @Get('announcements')
  @RequirePermission('communication', 'read')
  listAnnouncements(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { pinned?: string }) {
    return this.svc.listAnnouncements(user, q);
  }

  @Post('announcements')
  @RequirePermission('communication', 'create')
  createAnnouncement(@CurrentUser() user: AuthUser, @Body() dto: AnnouncementDto) {
    return this.svc.createAnnouncement(user, dto);
  }

  @Patch('announcements/:id')
  @RequirePermission('communication', 'update')
  updateAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<AnnouncementDto>) {
    return this.svc.updateAnnouncement(user, id, dto);
  }

  @Delete('announcements/:id')
  @RequirePermission('communication', 'delete')
  deleteAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteAnnouncement(user, id);
  }

  @Get('messages/contacts')
  @RequirePermission('messages', 'read')
  contacts(@CurrentUser() user: AuthUser) {
    return this.svc.contacts(user);
  }

  @Get('messages/threads')
  @RequirePermission('messages', 'read')
  threads(@CurrentUser() user: AuthUser) {
    return this.svc.threads(user);
  }

  @Get('messages/thread/:peerId')
  @RequirePermission('messages', 'read')
  thread(@CurrentUser() user: AuthUser, @Param('peerId') peerId: string) {
    return this.svc.thread(user, peerId);
  }

  @Post('messages')
  @RequirePermission('messages', 'create')
  send(@CurrentUser() user: AuthUser, @Body() dto: MessageDto) {
    return this.svc.send(user, dto);
  }
}

@Module({ controllers: [CommunicationController], providers: [CommunicationService] })
export class CommunicationModule {}
