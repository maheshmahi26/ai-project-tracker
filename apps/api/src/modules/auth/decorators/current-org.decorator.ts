import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { OrgContext, RequestWithAuth } from '../auth.types';

/** Injects the org membership context (req.orgContext) set by OrgGuard. */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();
    return req.orgContext;
  },
);
