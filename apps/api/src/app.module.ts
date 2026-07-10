import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { HealthController } from './health.controller';
import { UsersModule } from './modules/users.module';
import { StudentsModule } from './modules/students.module';
import { StaffModule } from './modules/staff.module';
import { AcademicsModule } from './modules/academics.module';
import { AttendanceModule } from './modules/attendance.module';
import { HomeworkModule } from './modules/homework.module';
import { GradebookModule } from './modules/gradebook.module';
import { FeesModule } from './modules/fees.module';
import { PaymentsModule } from './modules/payments.module';
import { PayrollModule } from './modules/payroll.module';
import { LibraryModule } from './modules/library.module';
import { FleetModule } from './modules/fleet.module';
import { AssetsModule } from './modules/assets.module';
import { ComplaintsModule } from './modules/complaints.module';
import { CommunicationModule } from './modules/communication.module';
import { NotificationsModule } from './modules/notifications.module';
import { StaffMonitoringModule } from './modules/staff-monitoring.module';
import { ReportsModule } from './modules/reports.module';
import { AnalyticsModule } from './modules/analytics.module';
import { AccessControlModule } from './modules/access-control.module';
import { SettingsModule } from './modules/settings.module';
import { FilesModule } from './modules/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CommonModule,
    AuthModule,
    NotificationsModule,
    UsersModule,
    StudentsModule,
    StaffModule,
    AcademicsModule,
    AttendanceModule,
    HomeworkModule,
    GradebookModule,
    FeesModule,
    PaymentsModule,
    PayrollModule,
    LibraryModule,
    FleetModule,
    AssetsModule,
    ComplaintsModule,
    CommunicationModule,
    StaffMonitoringModule,
    ReportsModule,
    AnalyticsModule,
    AccessControlModule,
    SettingsModule,
    FilesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
