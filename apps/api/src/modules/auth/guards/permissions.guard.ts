import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission } from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { RequestWithAuth } from '../auth.types';

/**
 * RBAC guard (defense layer 3). Requires the org role (from OrgGuard) to grant
 * every permission listed via @Permissions(). Must run after OrgGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const ctx = req.orgContext;
    if (!ctx) {
      throw AppException.forbidden('Organization context is required for this action');
    }

    const missing = required.filter((permission) => !can(ctx.role, permission));
    if (missing.length > 0) {
      throw AppException.forbidden(`Your role (${ctx.role}) lacks: ${missing.join(', ')}`);
    }
    return true;
  }
}
