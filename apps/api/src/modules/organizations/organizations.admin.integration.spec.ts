import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreateMemberInput } from '@ai-projectos/shared';
import { createTestContext, type TestContext } from '../../test/integration-module';
import { META, createMember, setupOrgWithAdmin, uniqueEmail } from '../../test/factories';
import { UsersRepository } from '../users/users.repository';

describe('Admin user management (integration)', () => {
  let ctx: TestContext | null;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.connection.dropDatabase();
      await ctx.module.close();
    }
  });

  beforeEach(async () => {
    if (ctx) await ctx.connection.dropDatabase();
  });

  describe('create-user', () => {
    it('provisions an active user with a temp password + mustChangePassword, and audits it', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      const member = await createMember(ctx, org.id, admin.userId, { role: 'developer' });

      const users = ctx.module.get(UsersRepository);
      const created = await users.findById(member.userId);
      expect(created?.status).toBe('active');
      expect(created?.mustChangePassword).toBe(true);

      // The temp password authenticates.
      const principal = await ctx.auth.validateLocalUser(member.email, member.password);
      expect(principal.userId).toBe(member.userId);

      const audit = await ctx.audit.list(org.id, { action: 'org.member.create', limit: 10 });
      expect(audit.items).toHaveLength(1);
      expect(audit.items[0]?.entity).toEqual({ type: 'user', id: member.userId });
    });

    it('refuses to mint an admin through this path', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      await expect(
        ctx.orgs.createMember(
          org.id,
          admin.userId,
          {
            email: uniqueEmail(),
            name: 'Sneaky',
            password: 'password123',
            role: 'admin',
          } as unknown as CreateMemberInput,
          META,
        ),
      ).rejects.toThrow(/admin/i);
    });

    it('rejects a duplicate email', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      const email = uniqueEmail('dup');
      await createMember(ctx, org.id, admin.userId, { email });
      await expect(createMember(ctx, org.id, admin.userId, { email })).rejects.toThrow(/already/i);
    });

    it('forbids non-admins from creating users', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      const dev = await createMember(ctx, org.id, admin.userId, { role: 'developer' });
      await expect(
        ctx.orgs.createMember(
          org.id,
          dev.userId,
          { email: uniqueEmail(), name: 'X', password: 'password123', role: 'viewer' },
          META,
        ),
      ).rejects.toThrow();
    });
  });

  describe('block / unblock', () => {
    it('disables the account, clears the refresh token, and refuses login', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      const member = await createMember(ctx, org.id, admin.userId, { role: 'developer' });

      // Establish a session so a refresh token hash exists.
      const principal = await ctx.auth.validateLocalUser(member.email, member.password);
      await ctx.auth.login(principal, META);

      const users = ctx.module.get(UsersRepository);
      expect((await users.findByIdWithSecrets(member.userId))?.refreshTokenHash).toBeTruthy();

      await ctx.orgs.setUserBlocked(org.id, admin.userId, member.userId, true, META);

      const blocked = await users.findByIdWithSecrets(member.userId);
      expect(blocked?.status).toBe('disabled');
      expect(blocked?.refreshTokenHash ?? null).toBeNull();

      await expect(ctx.auth.validateLocalUser(member.email, member.password)).rejects.toThrow(
        /disabled/i,
      );

      const audit = await ctx.audit.list(org.id, { action: 'org.member.block', limit: 10 });
      expect(audit.items).toHaveLength(1);
    });

    it('unblocks a member and restores login', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      const member = await createMember(ctx, org.id, admin.userId, { role: 'developer' });

      await ctx.orgs.setUserBlocked(org.id, admin.userId, member.userId, true, META);
      await ctx.orgs.setUserBlocked(org.id, admin.userId, member.userId, false, META);

      const principal = await ctx.auth.validateLocalUser(member.email, member.password);
      expect(principal.userId).toBe(member.userId);
    });

    it('guards self-block and owner-block', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);

      // Cannot block yourself.
      await expect(
        ctx.orgs.setUserBlocked(org.id, admin.userId, admin.userId, true, META),
      ).rejects.toThrow(/yourself/i);

      // Promote a second admin, who then may not block the owner.
      const other = await createMember(ctx, org.id, admin.userId, { role: 'developer' });
      await ctx.orgs.changeMemberRole(org.id, admin.userId, other.userId, 'admin', META);
      await expect(
        ctx.orgs.setUserBlocked(org.id, other.userId, admin.userId, true, META),
      ).rejects.toThrow(/owner/i);
    });

    it('blocks and removes an invited (not-yet-active) member', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      const invited = await ctx.orgs.inviteMember(
        org.id,
        admin.userId,
        { email: uniqueEmail('inv'), role: 'viewer' },
        META,
      );

      // Regression: block/remove resolve the membership via findByOrgAndUser,
      // so they work even though the invite is not `active`.
      const blocked = await ctx.orgs.setUserBlocked(
        org.id,
        admin.userId,
        invited.userId,
        true,
        META,
      );
      expect(blocked.userId).toBe(invited.userId);

      await expect(
        ctx.orgs.removeMember(org.id, admin.userId, invited.userId, META),
      ).resolves.toBeUndefined();
    });
  });

  describe('members pagination', () => {
    it('returns page/pageSize/total', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      for (let i = 0; i < 4; i += 1) {
        await createMember(ctx, org.id, admin.userId, {});
      }

      const page1 = await ctx.orgs.listMembersPaged(org.id, admin.userId, 1, 2);
      expect(page1.total).toBe(5); // 4 created + the admin
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);
      expect(page1.items).toHaveLength(2);

      const page2 = await ctx.orgs.listMembersPaged(org.id, admin.userId, 2, 2);
      expect(page2.items).toHaveLength(2);

      const page3 = await ctx.orgs.listMembersPaged(org.id, admin.userId, 3, 2);
      expect(page3.items).toHaveLength(1);
    });
  });

  describe('change-password (forced first login)', () => {
    it('clears mustChangePassword, rotates tokens, and swaps the credential', async (t) => {
      if (!ctx) return t.skip();
      const { org, admin } = await setupOrgWithAdmin(ctx);
      const member = await createMember(ctx, org.id, admin.userId, { role: 'developer' });

      // Wrong current password is rejected.
      await expect(
        ctx.auth.changePassword(
          member.userId,
          { currentPassword: 'not-it', newPassword: 'brand-new-pass-1' },
          META,
        ),
      ).rejects.toThrow();

      const result = await ctx.auth.changePassword(
        member.userId,
        { currentPassword: member.password, newPassword: 'brand-new-pass-1' },
        META,
      );
      expect(result.user.mustChangePassword).toBe(false);
      expect(result.tokens.accessToken).toBeTruthy();

      // Old credential no longer works; the new one does.
      await expect(ctx.auth.validateLocalUser(member.email, member.password)).rejects.toThrow();
      const principal = await ctx.auth.validateLocalUser(member.email, 'brand-new-pass-1');
      expect(principal.userId).toBe(member.userId);
    });
  });
});
