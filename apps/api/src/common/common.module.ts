import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { ScopeService } from './scope.service';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [PermissionsService, ScopeService, AuditService],
  exports: [PermissionsService, ScopeService, AuditService],
})
export class CommonModule {}
