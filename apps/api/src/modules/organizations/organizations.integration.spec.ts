import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

async function registerUser(ctx: TestContext, email: string): Promise<string> {
  const res = await ctx.auth.register({ email, password: 'password123', name: email }, meta);
  return res.user.id;
}

describe('Organizations + RBAC (integration)', () => {
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

  it('creates an org making the creator an admin member', async (t) => {
    if (!ctx) return t.skip();
    const userId = await registerUser(ctx, 'owner@example.com');
    const org = await ctx.orgs.createOrg(userId, { name: 'Acme Inc', timezone: 'UTC' }, meta);
    expect(org.role).toBe('admin');
    expect(org.slug).toBe('acme-inc');

    const mine = await ctx.orgs.listMine(userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(org.id);
  });

  it('enforces tenant isolation between orgs', async (t) => {
    if (!ctx) return t.skip();
    const aliceId = await registerUser(ctx, 'alice@example.com');
    const bobId = await registerUser(ctx, 'bob@example.com');
    const orgA = await ctx.orgs.createOrg(aliceId, { name: 'Alice Org', timezone: 'UTC' }, meta);

    // Bob is not a member → must not be able to read Alice's org.
    await expect(ctx.orgs.getOrg(orgA.id, bobId)).rejects.toThrow();
    expect(await ctx.orgs.listMine(bobId)).toHaveLength(0);
  });

  it('blocks a viewer from writes but allows reads', async (t) => {
    if (!ctx) return t.skip();
    const adminId = await registerUser(ctx, 'admin@example.com');
    const viewerId = await registerUser(ctx, 'viewer@example.com');
    const org = await ctx.orgs.createOrg(adminId, { name: 'Rbac Org', timezone: 'UTC' }, meta);

    await ctx.orgs.inviteMember(org.id, adminId, { email: 'viewer@example.com', role: 'tester' }, meta);

    // Tester can read.
    const read = await ctx.orgs.getOrg(org.id, viewerId);
    expect(read.role).toBe('tester');

    // Viewer cannot update settings or manage members.
    await expect(ctx.orgs.updateOrg(org.id, viewerId, { name: 'Nope' }, meta)).rejects.toThrow();
    await expect(
      ctx.orgs.inviteMember(org.id, viewerId, { email: 'x@example.com', role: 'developer' }, meta),
    ).rejects.toThrow();
  });

  it('lets an admin change roles and lists members', async (t) => {
    if (!ctx) return t.skip();
    const adminId = await registerUser(ctx, 'admin@example.com');
    await registerUser(ctx, 'dev@example.com');
    const org = await ctx.orgs.createOrg(adminId, { name: 'Team Org', timezone: 'UTC' }, meta);

    const membership = await ctx.orgs.inviteMember(
      org.id,
      adminId,
      { email: 'dev@example.com', role: 'developer' },
      meta,
    );
    expect(membership.role).toBe('developer');

    const promoted = await ctx.orgs.changeMemberRole(
      org.id,
      adminId,
      membership.userId,
      'manager',
      meta,
    );
    expect(promoted.role).toBe('manager');

    const members = await ctx.orgs.listMembers(org.id, adminId);
    expect(members).toHaveLength(2);
  });

  it('protects the last admin and the owner', async (t) => {
    if (!ctx) return t.skip();
    const adminId = await registerUser(ctx, 'admin@example.com');
    const org = await ctx.orgs.createOrg(adminId, { name: 'Solo Org', timezone: 'UTC' }, meta);

    // Cannot demote the only admin.
    await expect(
      ctx.orgs.changeMemberRole(org.id, adminId, adminId, 'tester', meta),
    ).rejects.toThrow();

    // Cannot remove the owner.
    await expect(ctx.orgs.removeMember(org.id, adminId, adminId, meta)).rejects.toThrow();
  });
});
