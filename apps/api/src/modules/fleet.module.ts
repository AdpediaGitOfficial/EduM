import {
  BadRequestException,
  Body, Controller, Delete, Get, Headers, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query, UnauthorizedException,
} from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

class VehicleDto {
  @IsString() registration!: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsIn(['active', 'maintenance', 'retired']) status?: string;
  @IsOptional() @IsString() gpsDeviceId?: string;
}

class RouteDto {
  @IsString() name!: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsNumber() monthlyFee?: number;
}

class StopDto {
  @IsString() name!: string;
  @IsInt() sequence!: number;
  @IsOptional() @IsString() pickupTime?: string;
  @IsOptional() @IsString() dropTime?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

class MaintenanceDto {
  @IsIn(['service', 'repair', 'inspection']) type!: string;
  @IsString() date!: string;
  @IsOptional() @IsNumber() cost?: number;
  @IsOptional() @IsString() notes?: string;
}

class FuelLogDto {
  @IsString() date!: string;
  @IsNumber() liters!: number;
  @IsNumber() cost!: number;
  @IsOptional() @IsInt() odometer?: number;
}

class GpsPingDto {
  @IsNumber() lat!: number;
  @IsNumber() lng!: number;
}

@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── vehicles ──
  async listVehicles(user: AuthUser, q: PageQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      schoolId: user.schoolId,
      ...(q.search ? { registration: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where, skip, take, orderBy: { registration: 'asc' },
        include: { routes: { select: { id: true, name: true } }, _count: { select: { maintenance: true, fuelLogs: true } } },
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async createVehicle(user: AuthUser, dto: VehicleDto) {
    const v = await this.prisma.vehicle.create({
      data: { schoolId: user.schoolId, ...dto, status: (dto.status as never) ?? 'active' },
    });
    await this.audit.log(user, 'fleet', 'vehicle.create', v.id, { registration: v.registration });
    return v;
  }

  async updateVehicle(user: AuthUser, id: string, dto: Partial<VehicleDto>) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return this.prisma.vehicle.update({ where: { id }, data: { ...dto, status: dto.status as never } });
  }

  async deleteVehicle(user: AuthUser, id: string) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!v) throw new NotFoundException('Vehicle not found');
    await this.prisma.vehicle.update({ where: { id }, data: { status: 'retired' } });
    return { ok: true, retired: true };
  }

  // ── routes & stops ──
  async listRoutes(user: AuthUser) {
    return this.prisma.transportRoute.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: 'asc' },
      include: {
        vehicle: true,
        stops: { orderBy: { sequence: 'asc' }, include: { _count: { select: { students: true } } } },
      },
    });
  }

  async createRoute(user: AuthUser, dto: RouteDto) {
    return this.prisma.transportRoute.create({
      data: { schoolId: user.schoolId, name: dto.name, vehicleId: dto.vehicleId ?? null, monthlyFee: dto.monthlyFee ?? 0 },
    });
  }

  async updateRoute(user: AuthUser, id: string, dto: Partial<RouteDto>) {
    const r = await this.prisma.transportRoute.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!r) throw new NotFoundException('Route not found');
    return this.prisma.transportRoute.update({ where: { id }, data: dto });
  }

  async deleteRoute(user: AuthUser, id: string) {
    const r = await this.prisma.transportRoute.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { stops: { include: { _count: { select: { students: true } } } } },
    });
    if (!r) throw new NotFoundException('Route not found');
    if (r.stops.some((s) => s._count.students > 0)) {
      throw new BadRequestException('Students are assigned to stops on this route');
    }
    await this.prisma.transportRoute.delete({ where: { id } });
    return { ok: true };
  }

  async addStop(user: AuthUser, routeId: string, dto: StopDto) {
    const r = await this.prisma.transportRoute.findFirst({ where: { id: routeId, schoolId: user.schoolId } });
    if (!r) throw new NotFoundException('Route not found');
    return this.prisma.routeStop.create({ data: { routeId, ...dto } });
  }

  async deleteStop(user: AuthUser, stopId: string) {
    const s = await this.prisma.routeStop.findFirst({
      where: { id: stopId, route: { schoolId: user.schoolId } },
      include: { _count: { select: { students: true } } },
    });
    if (!s) throw new NotFoundException('Stop not found');
    if (s._count.students > 0) throw new BadRequestException('Students are assigned to this stop');
    await this.prisma.routeStop.delete({ where: { id: stopId } });
    return { ok: true };
  }

  // ── maintenance & fuel ──
  async addMaintenance(user: AuthUser, vehicleId: string, dto: MaintenanceDto) {
    const v = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, schoolId: user.schoolId } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return this.prisma.vehicleMaintenance.create({
      data: { vehicleId, type: dto.type, date: new Date(dto.date), cost: dto.cost ?? 0, notes: dto.notes ?? null },
    });
  }

  async maintenanceHistory(user: AuthUser, vehicleId: string) {
    return this.prisma.vehicleMaintenance.findMany({
      where: { vehicleId, vehicle: { schoolId: user.schoolId } },
      orderBy: { date: 'desc' },
    });
  }

  async addFuelLog(user: AuthUser, vehicleId: string, dto: FuelLogDto) {
    const v = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, schoolId: user.schoolId } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return this.prisma.fuelLog.create({
      data: { vehicleId, date: new Date(dto.date), liters: dto.liters, cost: dto.cost, odometer: dto.odometer ?? null },
    });
  }

  async fuelHistory(user: AuthUser, vehicleId: string) {
    return this.prisma.fuelLog.findMany({
      where: { vehicleId, vehicle: { schoolId: user.schoolId } },
      orderBy: { date: 'desc' },
    });
  }

  // ── GPS-ready ingestion (device-authenticated, hardware contract) ──
  async gpsPing(deviceKey: string, dto: GpsPingDto) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { gpsDeviceId: deviceKey } });
    if (!vehicle) throw new UnauthorizedException('Unknown GPS device');
    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { lastLat: dto.lat, lastLng: dto.lng, lastPingAt: new Date() },
    });
    return { ok: true };
  }

  /** parent/student view: own route + stop + vehicle last location */
  async myTransport(user: AuthUser) {
    const students = await this.prisma.student.findMany({
      where:
        user.role === 'student'
          ? { userId: user.userId }
          : { guardians: { some: { userId: user.userId } } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        routeStop: { include: { route: { include: { vehicle: true, stops: { orderBy: { sequence: 'asc' } } } } } },
      },
    });
    return students.map((s) => ({
      studentId: s.id,
      name: `${s.user.firstName} ${s.user.lastName}`,
      stop: s.routeStop
        ? {
            id: s.routeStop.id, name: s.routeStop.name,
            pickupTime: s.routeStop.pickupTime, dropTime: s.routeStop.dropTime,
          }
        : null,
      route: s.routeStop?.route
        ? { id: s.routeStop.route.id, name: s.routeStop.route.name, stops: s.routeStop.route.stops }
        : null,
      vehicle: s.routeStop?.route?.vehicle
        ? {
            registration: s.routeStop.route.vehicle.registration,
            driverName: s.routeStop.route.vehicle.driverName,
            driverPhone: s.routeStop.route.vehicle.driverPhone,
            lastLat: s.routeStop.route.vehicle.lastLat,
            lastLng: s.routeStop.route.vehicle.lastLng,
            lastPingAt: s.routeStop.route.vehicle.lastPingAt,
          }
        : null,
    }));
  }
}

@Controller('fleet')
export class FleetController {
  constructor(private readonly svc: FleetService) {}

  @Get('vehicles')
  @RequirePermission('fleet', 'read')
  listVehicles(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    return this.svc.listVehicles(user, q);
  }

  @Post('vehicles')
  @RequirePermission('fleet', 'create')
  createVehicle(@CurrentUser() user: AuthUser, @Body() dto: VehicleDto) {
    return this.svc.createVehicle(user, dto);
  }

  @Patch('vehicles/:id')
  @RequirePermission('fleet', 'update')
  updateVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<VehicleDto>) {
    return this.svc.updateVehicle(user, id, dto);
  }

  @Delete('vehicles/:id')
  @RequirePermission('fleet', 'delete')
  deleteVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteVehicle(user, id);
  }

  @Get('routes')
  @RequirePermission('fleet', 'read')
  listRoutes(@CurrentUser() user: AuthUser) {
    return this.svc.listRoutes(user);
  }

  @Post('routes')
  @RequirePermission('fleet', 'create')
  createRoute(@CurrentUser() user: AuthUser, @Body() dto: RouteDto) {
    return this.svc.createRoute(user, dto);
  }

  @Patch('routes/:id')
  @RequirePermission('fleet', 'update')
  updateRoute(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<RouteDto>) {
    return this.svc.updateRoute(user, id, dto);
  }

  @Delete('routes/:id')
  @RequirePermission('fleet', 'delete')
  deleteRoute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteRoute(user, id);
  }

  @Post('routes/:id/stops')
  @RequirePermission('fleet', 'update')
  addStop(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StopDto) {
    return this.svc.addStop(user, id, dto);
  }

  @Delete('stops/:stopId')
  @RequirePermission('fleet', 'update')
  deleteStop(@CurrentUser() user: AuthUser, @Param('stopId') stopId: string) {
    return this.svc.deleteStop(user, stopId);
  }

  @Post('vehicles/:id/maintenance')
  @RequirePermission('fleet', 'update')
  addMaintenance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MaintenanceDto) {
    return this.svc.addMaintenance(user, id, dto);
  }

  @Get('vehicles/:id/maintenance')
  @RequirePermission('fleet', 'read')
  maintenanceHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.maintenanceHistory(user, id);
  }

  @Post('vehicles/:id/fuel')
  @RequirePermission('fleet', 'update')
  addFuelLog(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FuelLogDto) {
    return this.svc.addFuelLog(user, id, dto);
  }

  @Get('vehicles/:id/fuel')
  @RequirePermission('fleet', 'read')
  fuelHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.fuelHistory(user, id);
  }

  /**
   * GPS ingestion contract for tracking hardware.
   * Authenticated by the device key (vehicle.gpsDeviceId), not a user JWT —
   * devices are not users. Rate-limited by the global throttler.
   */
  @Public()
  @Post('gps/ping')
  gpsPing(@Headers('x-device-key') deviceKey: string, @Body() dto: GpsPingDto) {
    if (!deviceKey) throw new UnauthorizedException('Missing X-Device-Key header');
    return this.svc.gpsPing(deviceKey, dto);
  }

  @Get('my-transport')
  @RequirePermission('fleet', 'read')
  myTransport(@CurrentUser() user: AuthUser) {
    return this.svc.myTransport(user);
  }
}

@Module({ controllers: [FleetController], providers: [FleetService] })
export class FleetModule {}
