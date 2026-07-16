import type { Request } from 'express';
import type { Role } from '@ai-projectos/shared';

/** The authenticated principal attached by JwtStrategy → req.user. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
}

/** Org membership context attached by OrgGuard → req.orgContext. */
export interface OrgContext {
  orgId: string;
  userId: string;
  role: Role;
}

export interface RequestWithAuth extends Request {
  user?: AuthenticatedUser;
  orgContext?: OrgContext;
}
