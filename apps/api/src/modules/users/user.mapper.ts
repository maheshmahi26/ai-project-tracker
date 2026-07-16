import type { PublicUser } from '@ai-projectos/shared';
import type { UserLean } from './users.repository';

/** Maps an internal user document to the safe, serializable public shape. */
export function toPublicUser(user: UserLean): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    provider: user.provider,
    status: user.status,
    defaultOrgId: user.defaultOrgId ? user.defaultOrgId.toString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}
