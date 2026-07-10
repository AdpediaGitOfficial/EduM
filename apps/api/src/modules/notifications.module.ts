import {
  Controller, Get, Global, Injectable, Logger, Module, Param, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthOnly, AuthUser, CurrentUser } from '../common/decorators';
import { pageArgs, paged, PageQuery } from '../common/pagination';

// ─────────────────────────────────────────────────────────────
// Notification provider interfaces. Mock providers are wired by
// default (NOTIFY_*_PROVIDER=mock) so everything runs without real
// API keys; swap in real implementations without touching callers.
// ─────────────────────────────────────────────────────────────

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}
export interface SmsProvider {
  send(to: string, body: string): Promise<void>;
}
export interface PushProvider {
  send(userId: string, title: string, body: string): Promise<void>;
}

const logger = new Logger('Notify');

export class MockEmailProvider implements EmailProvider {
  async send(to: string, subject: string) {
    logger.log(`[mock email] to=${to} subject="${subject}"`);
  }
}
export class MockSmsProvider implements SmsProvider {
  async send(to: string, body: string) {
    logger.log(`[mock sms] to=${to} body="${body.slice(0, 60)}"`);
  }
}
export class MockPushProvider implements PushProvider {
  async send(userId: string, title: string) {
    logger.log(`[mock push] user=${userId} title="${title}"`);
  }
}

export interface NotifyPayload {
  title: string;
  body: string;
  link?: string;
}

@Injectable()
export class NotifyService {
  private email: EmailProvider = new MockEmailProvider();
  private sms: SmsProvider = new MockSmsProvider();
  private push: PushProvider = new MockPushProvider();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create notification rows (+ deliver through channel providers).
   * in_app rows are the notification-center source of truth; email/sms/push
   * rows record the external delivery attempt.
   */
  async dispatchMany(userIds: string[], payload: NotifyPayload, channels: Array<'in_app' | 'email' | 'sms' | 'push'> = ['in_app']) {
    if (userIds.length === 0) return { sent: 0 };
    const unique = Array.from(new Set(userIds));
    const now = new Date();
    await this.prisma.notification.createMany({
      data: unique.flatMap((userId) =>
        channels.map((channel) => ({
          userId, channel: channel as never,
          title: payload.title, body: payload.body, link: payload.link ?? null,
          sentAt: now,
        })),
      ),
    });
    // external channels via providers (mock by default; failures are non-fatal)
    if (channels.includes('email') || channels.includes('sms')) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, email: true, phone: true },
      });
      for (const u of users) {
        try {
          if (channels.includes('email')) await this.email.send(u.email, payload.title, payload.body);
          if (channels.includes('sms') && u.phone) await this.sms.send(u.phone, payload.body);
          if (channels.includes('push')) await this.push.send(u.id, payload.title, payload.body);
        } catch (e) {
          logger.warn(`delivery failed for ${u.id}: ${(e as Error).message}`);
        }
      }
    }
    return { sent: unique.length * channels.length };
  }

  async listFor(user: AuthUser, q: PageQuery & { unread?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      userId: user.userId,
      channel: 'in_app' as never,
      ...(q.unread === 'true' ? { readAt: null } : {}),
    };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: user.userId, channel: 'in_app', readAt: null } }),
    ]);
    return { ...paged(items, total, page, pageSize), unread };
  }

  async markRead(user: AuthUser, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.userId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotifyService) {}

  // Self-scoped by construction: only ever reads/writes the caller's rows.
  @Get()
  @AuthOnly()
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { unread?: string }) {
    return this.svc.listFor(user, q);
  }

  @Post(':id/read')
  @AuthOnly()
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.markRead(user, id);
  }

  @Post('read-all')
  @AuthOnly()
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.svc.markAllRead(user);
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotificationsModule {}
