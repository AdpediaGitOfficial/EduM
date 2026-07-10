import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks an endpoint as reachable without a JWT (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const AUTH_ONLY_KEY = 'authOnly';
/**
 * Requires a valid JWT but skips the module/action matrix check.
 * Reserved for endpoints that are self-scoped by construction
 * (own profile, own notifications, own dashboard summary).
 */
export const AuthOnly = () => SetMetadata(AUTH_ONLY_KEY, true);

export const PERMISSION_KEY = 'requiredPermission';
export type PermissionActionName = 'create' | 'read' | 'update' | 'delete' | 'export';

/**
 * Declares the (module, action) permission an endpoint requires.
 * Every non-public controller method must carry this decorator —
 * the PermissionsGuard rejects any route without it (fail closed).
 */
export const RequirePermission = (module: string, action: PermissionActionName) =>
  SetMetadata(PERMISSION_KEY, { module, action });

export interface AuthUser {
  userId: string;
  schoolId: string;
  role: string;
  email: string;
  name: string;
  staffId?: string | null;
  studentId?: string | null;
  /** Scope string from the matched permission row (e.g. 'own_class'), set by PermissionsGuard. */
  permissionScope?: string | null;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthUser;
});
