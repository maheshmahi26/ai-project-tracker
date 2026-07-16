import type { MembershipDTO, OrganizationDTO, Role } from '@ai-projectos/shared';
import { toPublicUser } from '../users/user.mapper';
import type { UserLean } from '../users/users.repository';
import type { OrgLean } from './organizations.repository';
import type { MembershipLean } from './memberships.repository';

export function toOrganizationDTO(org: OrgLean, role?: Role): OrganizationDTO {
  return {
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl ?? null,
    ownerId: org.ownerId.toString(),
    plan: org.plan,
    settings: {
      timezone: org.settings?.timezone ?? 'UTC',
      features: org.settings?.features ?? {},
    },
    role,
    createdAt: org.createdAt.toISOString(),
  };
}

export function toMembershipDTO(membership: MembershipLean, user?: UserLean | null): MembershipDTO {
  return {
    id: membership._id.toString(),
    orgId: membership.orgId.toString(),
    userId: membership.userId.toString(),
    role: membership.role,
    status: membership.status,
    user: user ? toPublicUser(user) : undefined,
    joinedAt: membership.joinedAt ? membership.joinedAt.toISOString() : null,
  };
}
