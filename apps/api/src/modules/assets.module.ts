import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class AssetDto {
  @IsString() name!: string;
  @IsString() category!: string;
  @IsOptional() @IsString() purchaseDate?: string;
  @IsOptional() @IsNumber() purchaseCost?: number;
  @IsOptional() @IsNumber() depreciationRate?: number;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @IsString() amcExpiry?: string;
  @IsOptional() @IsIn(['available', 'in_use', 'maintenance', 'retired', 'disposed']) status?: string;
  @IsOptional() @IsString() allocatedTo?: string;
  @IsOptional() @IsString() nextMaintenanceAt?: string;
  @IsOptional() @IsString() notes?: string;
}

class AssetMaintenanceDto {
  @IsString() date!: string;
  @IsIn(['scheduled', 'repair', 'amc']) type!: string;
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsString() notes?: string;
}

/** straight-line depreciation from purchase date at rate %/year */
export function currentValue(cost: number, ratePct: number, purchaseDate: Date | null): number {
  if (!purchaseDate || !ratePct) return cost;
  const years = (Date.now() - purchaseDate.getTime()) / (365.25 * 86400000);
  return Math.max(0, Math.round(cost * (1 - (ratePct / 100) * years) * 100) / 100);
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery & { category?: string; status?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      schoolId: user.schoolId,
      ...(q.category ? { category: q.category } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' as const } },
              { assetTag: { contains: q.search, mode: 'insensitive' as const } },
              { vendor: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({ where, skip, take, orderBy: { assetTag: 'asc' }, include: { maintenance: { orderBy: { date: 'desc' }, take: 3 } } }),
      this.prisma.asset.count({ where }),
    ]);
    return paged(
      items.map((a) => ({
        ...a,
        currentValue: currentValue(Number(a.purchaseCost), Number(a.depreciationRate), a.purchaseDate),
      })),
      total, page, pageSize,
    );
  }

  async create(user: AuthUser, dto: AssetDto) {
    const count = await this.prisma.asset.count({ where: { schoolId: user.schoolId } });
    const asset = await this.prisma.asset.create({
      data: {
        schoolId: user.schoolId,
        name: dto.name,
        category: dto.category,
        assetTag: `AST-${String(count + 100).padStart(4, '0')}`, // QR/barcode value
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
        purchaseCost: dto.purchaseCost ?? 0,
        depreciationRate: dto.depreciationRate ?? 0,
        vendor: dto.vendor ?? null,
        amcExpiry: dto.amcExpiry ? new Date(dto.amcExpiry) : null,
        status: (dto.status as never) ?? 'available',
        allocatedTo: dto.allocatedTo ?? null,
        nextMaintenanceAt: dto.nextMaintenanceAt ? new Date(dto.nextMaintenanceAt) : null,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.log(user, 'assets', 'asset.create', asset.id, { tag: asset.assetTag });
    return asset;
  }

  async update(user: AuthUser, id: string, dto: Partial<AssetDto>) {
    const a = await this.prisma.asset.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!a) throw new NotFoundException('Asset not found');
    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.purchaseDate !== undefined ? { purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null } : {}),
        ...(dto.purchaseCost !== undefined ? { purchaseCost: dto.purchaseCost } : {}),
        ...(dto.depreciationRate !== undefined ? { depreciationRate: dto.depreciationRate } : {}),
        ...(dto.vendor !== undefined ? { vendor: dto.vendor } : {}),
        ...(dto.amcExpiry !== undefined ? { amcExpiry: dto.amcExpiry ? new Date(dto.amcExpiry) : null } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.allocatedTo !== undefined ? { allocatedTo: dto.allocatedTo } : {}),
        ...(dto.nextMaintenanceAt !== undefined
          ? { nextMaintenanceAt: dto.nextMaintenanceAt ? new Date(dto.nextMaintenanceAt) : null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.log(user, 'assets', 'asset.update', id, dto as Record<string, unknown>);
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const a = await this.prisma.asset.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!a) throw new NotFoundException('Asset not found');
    await this.prisma.asset.update({ where: { id }, data: { status: 'disposed' } });
    await this.audit.log(user, 'assets', 'asset.dispose', id);
    return { ok: true, disposed: true };
  }

  async addMaintenance(user: AuthUser, assetId: string, dto: AssetMaintenanceDto) {
    const a = await this.prisma.asset.findFirst({ where: { id: assetId, schoolId: user.schoolId } });
    if (!a) throw new NotFoundException('Asset not found');
    return this.prisma.assetMaintenance.create({
      data: { assetId, date: new Date(dto.date), type: dto.type, cost: dto.cost ?? 0, notes: dto.notes ?? null },
    });
  }

  async analytics(user: AuthUser) {
    const assets = await this.prisma.asset.findMany({ where: { schoolId: user.schoolId } });
    const byCategory: Record<string, { count: number; cost: number; value: number }> = {};
    const byStatus: Record<string, number> = {};
    let totalCost = 0;
    let totalValue = 0;
    for (const a of assets) {
      const value = currentValue(Number(a.purchaseCost), Number(a.depreciationRate), a.purchaseDate);
      const c = (byCategory[a.category] ??= { count: 0, cost: 0, value: 0 });
      c.count++; c.cost += Number(a.purchaseCost); c.value += value;
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      totalCost += Number(a.purchaseCost);
      totalValue += value;
    }
    const maintenanceDue = assets.filter(
      (a) => a.nextMaintenanceAt && a.nextMaintenanceAt < new Date(Date.now() + 30 * 86400000),
    ).length;
    const amcExpiring = assets.filter(
      (a) => a.amcExpiry && a.amcExpiry < new Date(Date.now() + 60 * 86400000) && a.amcExpiry > new Date(),
    ).length;
    return {
      total: assets.length,
      totalCost: Math.round(totalCost),
      totalValue: Math.round(totalValue),
      byCategory, byStatus, maintenanceDue, amcExpiring,
    };
  }
}

@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Get()
  @RequirePermission('assets', 'read')
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { category?: string; status?: string }) {
    return this.svc.list(user, q);
  }

  @Get('analytics')
  @RequirePermission('assets', 'read')
  analytics(@CurrentUser() user: AuthUser) {
    return this.svc.analytics(user);
  }

  @Post()
  @RequirePermission('assets', 'create')
  create(@CurrentUser() user: AuthUser, @Body() dto: AssetDto) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('assets', 'update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<AssetDto>) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('assets', 'delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }

  @Post(':id/maintenance')
  @RequirePermission('assets', 'update')
  addMaintenance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssetMaintenanceDto) {
    return this.svc.addMaintenance(user, id, dto);
  }
}

@Module({ controllers: [AssetsController], providers: [AssetsService] })
export class AssetsModule {}
