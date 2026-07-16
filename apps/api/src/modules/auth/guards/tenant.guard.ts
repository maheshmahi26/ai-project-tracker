import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';
import { MembershipsRepository } from '../../organizations/memberships.repository';
import type { RequestWithAuth } from '../auth.types';

/**
 * Tenant guard for resource routes whose path id is NOT the org id (e.g.
 * `/projects/:id`). The active org is taken from the `x-org-id` header (or
 * `orgId` in the body), the caller's ACTIVE membership is verified, and the
 * derived role is attached to `req.orgContext` for the PermissionsGuard.
 *
 * (Contrast with {@link OrgGuard}, which reads the org from `params.id` and is
 * used only on `/orgs/:id` routes.)
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly memberships: MembershipsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    if (!req.user) throw AppException.unauthenticated();

    const orgId = resolveOrgId(req);
    if (!orgId) {
      throw AppException.validation('Missing organization id', [
        { path: 'x-org-id', issue: 'required' },
      ]);
    }

    const membership = await this.memberships.findActive(orgId, req.user.userId);
    if (!membership) {
      // Do not leak whether the org exists.
      throw AppException.notFound('Organization not found');
    }

    req.orgContext = { orgId, userId: req.user.userId, role: membership.role };
    return true;
  }
}

function resolveOrgId(req: RequestWithAuth): string | undefined {
  const header = req.headers['x-org-id'];
  const body = (req.body ?? {}) as Record<string, unknown>;
  return (
    (typeof header === 'string' ? header : undefined) ??
    (typeof body.orgId === 'string' ? body.orgId : undefined)
  );
}
