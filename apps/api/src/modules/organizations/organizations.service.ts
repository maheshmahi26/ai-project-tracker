import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import {
  can,
  type CreateMemberInput,
  type CreateOrgInput,
  type MembershipDTO,
  type OrganizationDTO,
  type PaginatedMembers,
  type Role,
  type UpdateOrgInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { UsersRepository } from '../users/users.repository';
import { MembershipsRepository } from './memberships.repository';
import { MembershipsService } from './memberships.service';
import { OrganizationsRepository, type OrgLean } from './organizations.repository';
import { toMembershipDTO, toOrganizationDTO } from './organizations.mapper';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly orgs: OrganizationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly membershipsService: MembershipsService,
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async createOrg(
    userId: string,
    input: CreateOrgInput,
    meta: RequestMeta,
  ): Promise<OrganizationDTO> {
    const slug = await this.resolveSlug(input.slug ?? input.name);

    // Creating org + owner membership is a multi-doc invariant → run it in a
    // transaction on a replica set. On a standalone Mongo (no txn support) we
    // fall back to sequential writes so local dev still works.
    const writeOrgAndOwner = async (session?: ClientSession): Promise<OrgLean> => {
      const created = await this.orgs.create(
        {
          name: input.name,
          slug,
          ownerId: new Types.ObjectId(userId),
          plan: 'free',
          settings: { timezone: input.timezone || 'UTC', features: {} },
        },
        session,
      );
      await this.memberships.create(
        {
          orgId: created._id,
          userId: new Types.ObjectId(userId),
          role: 'admin',
          status: 'active',
          joinedAt: new Date(),
        },
        session,
      );
      return created;
    };

    let org: OrgLean | undefined;
    try {
      if (await this.supportsTransactions()) {
        const session = await this.connection.startSession();
        try {
          await session.withTransaction(async () => {
            org = await writeOrgAndOwner(session);
          });
        } finally {
          await session.endSession();
        }
      } else {
        org = await writeOrgAndOwner();
      }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppException.conflict('An organization with this slug already exists');
      }
      throw error;
    }

    if (!org) throw AppException.businessRule('Failed to create organization');

    const user = await this.users.findById(userId);
    if (user && !user.defaultOrgId) {
      await this.users.updateById(userId, { $set: { defaultOrgId: org._id } });
    }

    await this.audit.record({
      action: 'org.create',
      actorId: userId,
      orgId: org._id.toString(),
      entity: { type: 'organization', id: org._id.toString() },
      after: { name: org.name, slug: org.slug },
      ...meta,
    });
    return toOrganizationDTO(org, 'admin');
  }

  async listMine(userId: string): Promise<OrganizationDTO[]> {
    const memberships = await this.membershipsService.listForUser(userId);
    if (memberships.length === 0) return [];
    const roleByOrg = new Map<string, Role>(
      memberships.map((m) => [m.orgId.toString(), m.role]),
    );
    const orgs = await this.orgs.findByIds([...roleByOrg.keys()]);
    return orgs.map((org) => toOrganizationDTO(org, roleByOrg.get(org._id.toString())));
  }

  async getOrg(orgId: string, userId: string): Promise<OrganizationDTO> {
    const membership = await this.membershipsService.requireActive(orgId, userId);
    const org = await this.orgs.findById(orgId);
    if (!org) throw AppException.notFound('Organization not found');
    return toOrganizationDTO(org, membership.role);
  }

  async updateOrg(
    orgId: string,
    userId: string,
    input: UpdateOrgInput,
    meta: RequestMeta,
  ): Promise<OrganizationDTO> {
    const membership = await this.requirePermission(orgId, userId, 'manage:org');
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.logoUrl !== undefined) update.logoUrl = input.logoUrl;
    if (input.timezone !== undefined) update['settings.timezone'] = input.timezone;

    const org = await this.orgs.updateById(orgId, { $set: update });
    if (!org) throw AppException.notFound('Organization not found');

    await this.audit.record({
      action: 'org.update',
      actorId: userId,
      orgId,
      entity: { type: 'organization', id: orgId },
      after: update,
      ...meta,
    });
    return toOrganizationDTO(org, membership.role);
  }

  async deleteOrg(orgId: string, userId: string, meta: RequestMeta): Promise<void> {
    await this.requirePermission(orgId, userId, 'manage:org');
    const deleted = await this.orgs.softDelete(orgId);
    if (!deleted) throw AppException.notFound('Organization not found');
    await this.audit.record({
      action: 'org.delete',
      actorId: userId,
      orgId,
      entity: { type: 'organization', id: orgId },
      ...meta,
    });
  }

  async listMembers(orgId: string, userId: string): Promise<MembershipDTO[]> {
    await this.membershipsService.requireActive(orgId, userId);
    return this.membershipsService.listOrgMembers(orgId);
  }

  async listMembersPaged(
    orgId: string,
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedMembers> {
    await this.membershipsService.requireActive(orgId, userId);
    return this.membershipsService.listOrgMembersPaged(orgId, page, pageSize);
  }

  async createMember(
    orgId: string,
    actingUserId: string,
    input: CreateMemberInput,
    meta: RequestMeta,
  ): Promise<MembershipDTO> {
    await this.requirePermission(orgId, actingUserId, 'manage:users');

    // Defense in depth: the schema already restricts this, but never let an admin
    // be minted through this path.
    if ((input.role as Role) === 'admin') {
      throw AppException.businessRule('Admins cannot be created here');
    }

    const existing = await this.users.findByEmail(input.email);
    if (existing) throw AppException.conflict('An account with this email already exists');

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
      provider: 'local',
      status: 'active',
      mustChangePassword: true,
    });

    const membership = await this.memberships.create({
      orgId: new Types.ObjectId(orgId),
      userId: user._id,
      role: input.role,
      status: 'active',
      invitedBy: new Types.ObjectId(actingUserId),
      joinedAt: new Date(),
    });

    await this.audit.record({
      action: 'org.member.create',
      actorId: actingUserId,
      orgId,
      entity: { type: 'user', id: user._id.toString() },
      after: { role: input.role },
      ...meta,
    });
    return toMembershipDTO(membership, user);
  }

  async setUserBlocked(
    orgId: string,
    actingUserId: string,
    targetUserId: string,
    blocked: boolean,
    meta: RequestMeta,
  ): Promise<MembershipDTO> {
    await this.requirePermission(orgId, actingUserId, 'manage:users');
    if (actingUserId === targetUserId) {
      throw AppException.businessRule('You cannot block yourself');
    }

    const target = await this.memberships.findByOrgAndUser(orgId, targetUserId);
    if (!target) throw AppException.notFound('Member not found');

    const org = await this.orgs.findById(orgId);
    if (blocked && org && org.ownerId.toString() === targetUserId) {
      throw AppException.businessRule('The organization owner cannot be blocked');
    }
    if (blocked && target.role === 'admin') {
      await this.assertNotLastAdmin(orgId);
    }

    const user = await this.users.updateById(targetUserId, {
      $set: { status: blocked ? 'disabled' : 'active' },
      // Blocking must also end any active session.
      ...(blocked ? { $unset: { refreshTokenHash: '' } } : {}),
    });
    if (!user) throw AppException.notFound('Member not found');

    await this.audit.record({
      action: blocked ? 'org.member.block' : 'org.member.unblock',
      actorId: actingUserId,
      orgId,
      entity: { type: 'user', id: targetUserId },
      ...meta,
    });
    return toMembershipDTO(target, user);
  }

  async inviteMember(
    orgId: string,
    actingUserId: string,
    input: { email: string; role: Role },
    meta: RequestMeta,
  ): Promise<MembershipDTO> {
    await this.requirePermission(orgId, actingUserId, 'manage:users');

    let user = await this.users.findByEmail(input.email);
    if (!user) {
      user = await this.users.create({
        email: input.email,
        name: input.email,
        provider: 'local',
        status: 'invited',
      });
    }

    const existing = await this.memberships.findActive(orgId, user._id.toString());
    if (existing) throw AppException.conflict('User is already a member of this organization');

    const membership = await this.memberships.create({
      orgId: new Types.ObjectId(orgId),
      userId: user._id,
      role: input.role,
      status: user.status === 'invited' ? 'invited' : 'active',
      invitedBy: new Types.ObjectId(actingUserId),
      joinedAt: user.status === 'invited' ? null : new Date(),
    });

    await this.audit.record({
      action: 'org.member.invite',
      actorId: actingUserId,
      orgId,
      entity: { type: 'user', id: user._id.toString() },
      after: { role: input.role },
      ...meta,
    });
    return toMembershipDTO(membership, user);
  }

  async changeMemberRole(
    orgId: string,
    actingUserId: string,
    targetUserId: string,
    role: Role,
    meta: RequestMeta,
  ): Promise<MembershipDTO> {
    await this.requirePermission(orgId, actingUserId, 'manage:users');
    const target = await this.memberships.findActive(orgId, targetUserId);
    if (!target) throw AppException.notFound('Member not found');

    if (target.role === 'admin' && role !== 'admin') {
      await this.assertNotLastAdmin(orgId);
    }

    const updated = await this.memberships.updateRole(orgId, targetUserId, role);
    if (!updated) throw AppException.notFound('Member not found');

    await this.audit.record({
      action: 'org.member.role_change',
      actorId: actingUserId,
      orgId,
      entity: { type: 'user', id: targetUserId },
      before: { role: target.role },
      after: { role },
      ...meta,
    });
    const user = await this.users.findById(targetUserId);
    return toMembershipDTO(updated, user);
  }

  async removeMember(
    orgId: string,
    actingUserId: string,
    targetUserId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.requirePermission(orgId, actingUserId, 'manage:users');
    const target = await this.memberships.findByOrgAndUser(orgId, targetUserId);
    if (!target) throw AppException.notFound('Member not found');

    const org = await this.orgs.findById(orgId);
    if (org && org.ownerId.toString() === targetUserId) {
      throw AppException.businessRule('The organization owner cannot be removed');
    }
    if (target.role === 'admin') {
      await this.assertNotLastAdmin(orgId);
    }

    await this.memberships.remove(orgId, targetUserId);
    await this.audit.record({
      action: 'org.member.remove',
      actorId: actingUserId,
      orgId,
      entity: { type: 'user', id: targetUserId },
      ...meta,
    });
  }

  private async requirePermission(
    orgId: string,
    userId: string,
    permission: Parameters<typeof can>[1],
  ) {
    const membership = await this.membershipsService.requireActive(orgId, userId);
    if (!can(membership.role, permission)) {
      throw AppException.forbidden(`Your role (${membership.role}) cannot ${permission}`);
    }
    return membership;
  }

  private txnSupport?: boolean;

  /**
   * Multi-doc transactions require a replica set / mongos. We detect support once
   * so local standalone Mongo still works (creating org + membership sequentially).
   */
  private async supportsTransactions(): Promise<boolean> {
    if (this.txnSupport !== undefined) return this.txnSupport;
    try {
      const hello = await this.connection.db?.admin().command({ hello: 1 });
      this.txnSupport = Boolean(hello?.setName) || hello?.msg === 'isdbgrid';
    } catch {
      this.txnSupport = false;
    }
    if (!this.txnSupport) {
      this.logger.warn(
        'MongoDB transactions unavailable (standalone); multi-doc writes run sequentially',
      );
    }
    return this.txnSupport;
  }

  private async assertNotLastAdmin(orgId: string): Promise<void> {
    const admins = await this.membershipsService.countAdmins(orgId);
    if (admins <= 1) {
      throw AppException.businessRule('An organization must have at least one admin');
    }
  }

  private async resolveSlug(source: string): Promise<string> {
    const base = slugify(source) || 'org';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
      const existing = await this.orgs.findBySlug(candidate);
      if (!existing) return candidate;
    }
    return `${base}-${randomSuffix()}`;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
