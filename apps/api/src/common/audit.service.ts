import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './decorators';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    user: AuthUser,
    module: string,
    action: string,
    entityId?: string,
    detail: Record<string, unknown> = {},
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          schoolId: user.schoolId,
          userId: user.userId,
          module,
          action,
          entityId: entityId ?? null,
          detail: detail as object,
        },
      });
    } catch {
      // Auditing must never break the main operation.
    }
  }
}
