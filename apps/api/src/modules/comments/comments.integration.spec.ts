import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };
const body = { type: 'doc', content: [{ type: 'text', text: 'hello' }] };

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

describe('Comments backend (integration)', () => {
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

  it('creates a comment, increments the task count, and writes audit + activity', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, taskId } = await setup(ctx);

    const comment = await ctx.comments.create(orgId, ownerId, taskId, { body }, meta);
    expect(comment.authorId).toBe(ownerId);
    expect(comment.mentions).toEqual([]);

    const task = await ctx.tasks.getTask(orgId, taskId);
    expect(task.commentsCount).toBe(1);

    const audits = await ctx.audit.list(orgId, { action: 'comment.created', limit: 25 });
    expect(audits.items[0]?.entity).toEqual({ type: 'comment', id: comment.id });
    const activity = await ctx.activity.list(orgId, { limit: 25 });
    expect(activity.items.some((a) => a.verb === 'commented on' && a.object.id === taskId)).toBe(true);
  });

  it('a mention creates a notification and enqueues an email (author excluded)', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, memberId, memberEmail, taskId } = await setup(ctx);

    await ctx.comments.create(
      orgId,
      ownerId,
      taskId,
      { body, mentions: [memberId, ownerId] }, // ownerId is the author → dropped
      meta,
    );

    const inbox = await ctx.notifications.list(orgId, memberId, { limit: 25 });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]?.type).toBe('mention');

    // Author never notifies themselves.
    const ownerInbox = await ctx.notifications.list(orgId, ownerId, { limit: 25 });
    expect(ownerInbox.items).toHaveLength(0);

    // Email job enqueued for the mentioned member.
    expect(ctx.mail.notifications.some((m) => m.to === memberEmail)).toBe(true);
  });

  it('drops mentions for non-members', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, taskId } = await setup(ctx);
    const stranger = await ctx.auth.register(
      { email: 'stranger@example.com', password: 'password123', name: 'X' },
      meta,
    );

    const comment = await ctx.comments.create(
      orgId,
      ownerId,
      taskId,
      { body, mentions: [stranger.user.id] },
      meta,
    );
    expect(comment.mentions).toEqual([]);
  });

  it('lets only the author edit a comment', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, memberId, taskId } = await setup(ctx);
    const comment = await ctx.comments.create(orgId, ownerId, taskId, { body }, meta);

    await expect(
      ctx.comments.update(orgId, memberId, taskId, comment.id, { body }, meta),
    ).rejects.toThrow();

    const edited = await ctx.comments.update(
      orgId,
      ownerId,
      taskId,
      comment.id,
      { body: { type: 'doc', content: [] } },
      meta,
    );
    expect(edited.editedAt).not.toBeNull();
  });

  it('soft-deletes a comment and decrements the task count', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, taskId } = await setup(ctx);
    const comment = await ctx.comments.create(orgId, ownerId, taskId, { body }, meta);

    await ctx.comments.remove(orgId, ownerId, taskId, comment.id, meta);

    const list = await ctx.comments.list(orgId, taskId, { limit: 25 });
    expect(list.items).toHaveLength(0);
    const task = await ctx.tasks.getTask(orgId, taskId);
    expect(task.commentsCount).toBe(0);
  });

  it('isolates comments across organizations', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, ownerId, taskId } = await setup(ctx);
    await ctx.comments.create(orgId, ownerId, taskId, { body }, meta);

    const other = await ctx.auth.register(
      { email: 'other@example.com', password: 'password123', name: 'Other' },
      meta,
    );
    const otherOrg = await ctx.orgs.createOrg(other.user.id, { name: 'Other', timezone: 'UTC' }, meta);

    await expect(ctx.comments.list(otherOrg.id, taskId, { limit: 25 })).rejects.toThrow();
  });
});
