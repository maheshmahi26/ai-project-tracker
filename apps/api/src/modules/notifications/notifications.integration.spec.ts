import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

interface Ctx {
  orgId: string;
  ownerId: string;
  memberId: string;
  memberEmail: string;
  taskId: string;
}

async function setup(ctx: TestContext): Promise<Ctx> {
  const owner = await ctx.auth.register(
    { email: 'owner@example.com', password: 'password123', name: 'Owner' },
    meta,
  );
  const org = await ctx.orgs.createOrg(owner.user.id, { name: 'Acme', timezone: 'UTC' }, meta);

  const memberEmail = 'dev@example.com';
  await ctx.auth.register({ email: memberEmail, password: 'password123', name: 'Dev' }, meta);
  const membership = await ctx.orgs.inviteMember(
    org.id,
    owner.user.id,
    { email: memberEmail, role: 'developer' },
    meta,
  );

  const project = await ctx.projects.createProject(
    org.id,
    owner.user.id,
    { name: 'Auth', key: 'AUTH' },
    meta,
  );
  const task = await ctx.tasks.createTask(org.id, owner.user.id, { projectId: project.id, title: 'T' }, meta);

  return {
    orgId: org.id,
    ownerId: owner.user.id,
    memberId: membership.userId,
    memberEmail,
    taskId: task.id,
  };
}

describe('Notifications backend (integration)', () => {
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
    if (!ctx) return;
    await ctx.connection.dropDatabase();
    await ctx.connection.models.Project?.syncIndexes();
    await ctx.connection.models.Task?.syncIndexes();
    ctx.mail.notifications.length = 0;
  });

  it('creates an assignment notification via the domain-event listener', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, memberId, memberEmail, taskId } = await setup(ctx);

    await ctx.tasks.assignTask(orgId, ownerId, taskId, { assigneeId: memberId }, meta);

    const inbox = await ctx.notifications.list(orgId, memberId, { limit: 25 });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]?.type).toBe('assignment');
    expect(ctx.mail.notifications.some((m) => m.to === memberEmail)).toBe(true);
  });

  it('does not notify on self-assignment', async (t) => {
    if (!ctx) return t.skip();
    // Only developers/testers can be assigned, so a member assigns to themselves.
    const { orgId, memberId, taskId } = await setup(ctx);
    await ctx.tasks.assignTask(orgId, memberId, taskId, { assigneeId: memberId }, meta);
    const inbox = await ctx.notifications.list(orgId, memberId, { limit: 25 });
    expect(inbox.items).toHaveLength(0);
  });

  it('fans out with dedup and marks read / read-all', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, memberId } = await setup(ctx);

    const created = await ctx.notifications.fanOut({
      orgId,
      recipientIds: [memberId, memberId, ownerId], // dedup + still both distinct users
      type: 'system',
      title: 'Heads up',
      excludeUserId: ownerId, // owner is excluded → only member remains
    });
    expect(created).toHaveLength(1);

    // fan out two more to the member so there are 3 unread total.
    await ctx.notifications.fanOut({ orgId, recipientIds: [memberId], type: 'system', title: 'A' });
    await ctx.notifications.fanOut({ orgId, recipientIds: [memberId], type: 'system', title: 'B' });

    let unread = await ctx.notifications.list(orgId, memberId, { unreadOnly: 'true', limit: 25 });
    expect(unread.items).toHaveLength(3);
    expect(unread.page.total).toBe(3);

    await ctx.notifications.markRead(orgId, memberId, unread.items[0]!.id);
    unread = await ctx.notifications.list(orgId, memberId, { unreadOnly: 'true', limit: 25 });
    expect(unread.items).toHaveLength(2);

    const res = await ctx.notifications.markAllRead(orgId, memberId);
    expect(res.updated).toBe(2);
    unread = await ctx.notifications.list(orgId, memberId, { unreadOnly: 'true', limit: 25 });
    expect(unread.items).toHaveLength(0);
  });

  it('rejects marking a notification that is not the user’s', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, memberId } = await setup(ctx);
    const [notif] = await ctx.notifications.fanOut({
      orgId,
      recipientIds: [memberId],
      type: 'system',
      title: 'X',
    });
    await expect(ctx.notifications.markRead(orgId, ownerId, notif!.id)).rejects.toThrow();
  });
});
