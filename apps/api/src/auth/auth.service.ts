import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async buildTokens(userId: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { staff: { select: { id: true } }, student: { select: { id: true } } },
    });
    const payload = {
      sub: user.id,
      schoolId: user.schoolId,
      role: user.role,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      staffId: user.staff?.id ?? null,
      studentId: user.student?.id ?? null,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: (process.env.JWT_ACCESS_TTL || '900s') as never,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        ipAddress: ip ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: `${session.id}.${refreshToken}`,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: user.schoolId,
        staffId: user.staff?.id ?? null,
        studentId: user.student?.id ?? null,
        mustChangePassword: user.mustChangePassword,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    const ok = user && user.status === 'active' && (await bcrypt.compare(password, user.passwordHash));
    if (user) {
      await this.prisma.loginEvent.create({
        data: { userId: user.id, ipAddress: ip ?? null, userAgent: userAgent?.slice(0, 500) ?? null, success: !!ok },
      });
    }
    if (!ok || !user) throw new UnauthorizedException('Invalid credentials');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.buildTokens(user.id, ip, userAgent);
  }

  async refresh(compound: string, ip?: string, userAgent?: string) {
    const [sessionId, token] = (compound || '').split('.');
    if (!sessionId || !token) throw new UnauthorizedException('Malformed refresh token');
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== sha256(token)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // rotate: revoke old session, issue new pair
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.buildTokens(session.userId, ip, userAgent);
  }

  async logout(compound: string | undefined) {
    if (!compound) return { ok: true };
    const [sessionId] = compound.split('.');
    if (sessionId) {
      await this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        school: { select: { id: true, name: true, code: true, logoUrl: true, brandColor: true } },
        staff: { select: { id: true, department: true, designation: true, employeeNo: true } },
        student: {
          select: {
            id: true,
            admissionNo: true,
            section: { select: { id: true, name: true, class: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  /**
   * Forgot password: issues a short-lived signed reset token. With the mock
   * email provider (default in dev) the token is also returned in the
   * response so the flow is testable without a mailbox.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) return { ok: true }; // don't leak account existence
    const resetToken = await this.jwt.signAsync(
      { sub: user.id, purpose: 'password_reset' },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '15m' },
    );
    await this.prisma.notification.create({
      data: {
        userId: user.id,
        channel: 'email',
        title: 'Password reset requested',
        body: 'Use the reset link sent to your email. (mock provider)',
        sentAt: new Date(),
      },
    });
    const isMock = (process.env.NOTIFY_EMAIL_PROVIDER || 'mock') === 'mock';
    return { ok: true, ...(isMock ? { resetToken } : {}) };
  }

  async resetPassword(token: string, newPassword: string) {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (payload.purpose !== 'password_reset') throw new BadRequestException('Invalid token');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash, mustChangePassword: false },
    });
    // revoke all sessions on password change
    await this.prisma.session.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
    });
    return { ok: true };
  }
}
