import { Injectable } from '@nestjs/common';
import type { MembershipDTO, Role } from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { UsersRepository } from '../users/users.repository';
import { MembershipsRepository, type MembershipLean } from './memberships.repository';
import { toMembershipDTO } from './organizations.mapper';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly users: UsersRepository,
  ) {}

  getRole(orgId: string, userId: string): Promise<Role | null> {
    return this.memberships.findActive(orgId, userId).then((m) => m?.role ?? null);
  }

  async requireActive(orgId: string, userId: string): Promise<MembershipLean> {
    const membership = await this.memberships.findActive(orgId, userId);
    // 404 (not 403) so we never reveal that an org the caller can't see exists.
    if (!membership) throw AppException.notFound('Organization not found');
    return membership;
  }

  listForUser(userId: string): Promise<MembershipLean[]> {
    return this.memberships.listByUser(userId);
  }

  countAdmins(orgId: string): Promise<number> {
    return this.memberships.countByOrgAndRole(orgId, 'admin');
  }

  async listOrgMembers(orgId: string): Promise<MembershipDTO[]> {
    const members = await this.memberships.listByOrg(orgId);
    const users = await this.users.findByIds(members.map((m) => m.userId.toString()));
    const byId = new Map(users.map((u) => [u._id.toString(), u]));
    return members.map((m) => toMembershipDTO(m, byId.get(m.userId.toString()) ?? null));
  }
}
