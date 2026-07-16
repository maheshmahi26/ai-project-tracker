import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';
import { MembershipsRepository } from '../../organizations/memberships.repository';
import type { RequestWithAuth } from '../auth.types';

/**
 * Tenant guard (defense layer 2). Resolves the target orgId from the route/body/
 * header, verifies the caller has an ACTIVE membership, and attaches the derived
 * role to req.orgContext for downstream PermissionsGuard + services.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(private readonly memberships: MembershipsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    if (!req.user) throw AppException.unauthenticated();

    const orgId = resolveOrgId(req);
    if (!orgId) {
      throw AppException.validation('Missing organization id', [
        { path: 'orgId', issue: 'required' },
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
  const params = req.params as Record<string, string | undefined>;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const header = req.headers['x-org-id'];
  return (
    params.orgId ??
    params.id ??
    (typeof body.orgId === 'string' ? body.orgId : undefined) ??
    (typeof header === 'string' ? header : undefined)
  );
}
