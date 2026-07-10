import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ONLY_KEY, IS_PUBLIC_KEY, PERMISSION_KEY } from '../decorators';
import { PermissionsService } from '../permissions.service';

/**
 * Data-driven RBAC guard. Every non-public route MUST declare
 * @RequirePermission(module, action); routes without it are rejected
 * (fail closed) so no endpoint can ship unguarded by accident.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const authOnly = this.reflector.getAllAndOverride<boolean>(AUTH_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (authOnly) {
      const u = ctx.switchToHttp().getRequest().user;
      if (!u) throw new ForbiddenException('No authenticated user');
      return true;
    }

    const required = this.reflector.getAllAndOverride<{ module: string; action: string }>(
      PERMISSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('No authenticated user');

    if (!required) {
      throw new ForbiddenException('Endpoint has no permission declaration (fail closed)');
    }

    const match = await this.permissions.find(user.schoolId, user.role, required.module, required.action);
    if (!match) {
      throw new ForbiddenException(
        `Role '${user.role}' lacks '${required.action}' on '${required.module}'`,
      );
    }
    user.permissionScope = match.scope ?? null;
    return true;
  }
}
