import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post,
} from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';

class SchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() brandColor?: string;
  /** grading scale, term names, notification prefs, gateway config, backup prefs… */
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

class YearDto {
  @IsString() name!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class TermDto {
  @IsString() name!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async school(user: AuthUser) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId } });
  }

  async updateSchool(user: AuthUser, dto: SchoolDto) {
    const current = await this.school(user);
    const updated = await this.prisma.school.update({
      where: { id: user.schoolId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.brandColor !== undefined ? { brandColor: dto.brandColor } : {}),
        ...(dto.settings !== undefined
          ? { settings: { ...(current.settings as object), ...dto.settings } as object }
          : {}),
      },
    });
    await this.audit.log(user, 'settings', 'school.update', user.schoolId, dto as Record<string, unknown>);
    return updated;
  }

  async years(user: AuthUser) {
    return this.prisma.academicYear.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { startDate: 'desc' },
      include: { terms: { orderBy: { startDate: 'asc' } } },
    });
  }

  async createYear(user: AuthUser, dto: YearDto) {
    if (dto.isActive) {
      await this.prisma.academicYear.updateMany({
        where: { schoolId: user.schoolId },
        data: { isActive: false },
      });
    }
    return this.prisma.academicYear.create({
      data: {
        schoolId: user.schoolId, name: dto.name,
        startDate: new Date(dto.startDate), endDate: new Date(dto.endDate),
        isActive: dto.isActive ?? false,
      },
    });
  }

  async updateYear(user: AuthUser, id: string, dto: Partial<YearDto>) {
    const y = await this.prisma.academicYear.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!y) throw new NotFoundException('Academic year not found');
    if (dto.isActive) {
      await this.prisma.academicYear.updateMany({
        where: { schoolId: user.schoolId, NOT: { id } },
        data: { isActive: false },
      });
    }
    return this.prisma.academicYear.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async addTerm(user: AuthUser, yearId: string, dto: TermDto) {
    const y = await this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId: user.schoolId } });
    if (!y) throw new NotFoundException('Academic year not found');
    return this.prisma.term.create({
      data: { academicYearId: yearId, name: dto.name, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
    });
  }

  async deleteTerm(user: AuthUser, termId: string) {
    const t = await this.prisma.term.findFirst({
      where: { id: termId, academicYear: { schoolId: user.schoolId } },
    });
    if (!t) throw new NotFoundException('Term not found');
    await this.prisma.term.delete({ where: { id: termId } });
    return { ok: true };
  }

  /** integration status: which providers are wired vs mock (no secrets exposed) */
  integrations() {
    return {
      email: { provider: process.env.NOTIFY_EMAIL_PROVIDER || 'mock', mock: (process.env.NOTIFY_EMAIL_PROVIDER || 'mock') === 'mock' },
      sms: { provider: process.env.NOTIFY_SMS_PROVIDER || 'mock', mock: (process.env.NOTIFY_SMS_PROVIDER || 'mock') === 'mock' },
      paymentGateway: { provider: process.env.PAYMENT_GATEWAY || 'mock', mock: (process.env.PAYMENT_GATEWAY || 'mock') === 'mock' },
      storage: { endpoint: process.env.S3_ENDPOINT ? 'configured' : 'local-fallback' },
    };
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get('school')
  @RequirePermission('settings', 'read')
  school(@CurrentUser() user: AuthUser) {
    return this.svc.school(user);
  }

  @Patch('school')
  @RequirePermission('settings', 'update')
  updateSchool(@CurrentUser() user: AuthUser, @Body() dto: SchoolDto) {
    return this.svc.updateSchool(user, dto);
  }

  @Get('academic-years')
  @RequirePermission('settings', 'read')
  years(@CurrentUser() user: AuthUser) {
    return this.svc.years(user);
  }

  @Post('academic-years')
  @RequirePermission('settings', 'create')
  createYear(@CurrentUser() user: AuthUser, @Body() dto: YearDto) {
    return this.svc.createYear(user, dto);
  }

  @Patch('academic-years/:id')
  @RequirePermission('settings', 'update')
  updateYear(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<YearDto>) {
    return this.svc.updateYear(user, id, dto);
  }

  @Post('academic-years/:id/terms')
  @RequirePermission('settings', 'create')
  addTerm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TermDto) {
    return this.svc.addTerm(user, id, dto);
  }

  @Delete('terms/:id')
  @RequirePermission('settings', 'delete')
  deleteTerm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteTerm(user, id);
  }

  @Get('integrations')
  @RequirePermission('settings', 'read')
  integrations() {
    return this.svc.integrations();
  }
}

@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
