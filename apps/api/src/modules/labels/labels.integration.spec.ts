import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

interface Ctx {
  orgId: string;
  userId: string;
  projectId: string;
}

async function setup(ctx: TestContext): Promise<Ctx> {
  const owner = await ctx.auth.register(
    { email: 'owner@example.com', password: 'password123', name: 'Owner' },
    meta,
  );
  const org = await ctx.orgs.createOrg(owner.user.id, { name: 'Acme', timezone: 'UTC' }, meta);
  const project = await ctx.projects.createProject(
    org.id,
    owner.user.id,
    { name: 'Auth', key: 'AUTH' },
    meta,
  );
  return { orgId: org.id, userId: owner.user.id, projectId: project.id };
}

describe('Labels backend (integration)', () => {
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
    await ctx.connection.models.Label?.syncIndexes();
  });

  it('creates org-wide and project-scoped labels', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);

    const orgWide = await ctx.labels.create(orgId, userId, { name: 'bug', color: '#ff0000' }, meta);
    expect(orgWide.projectId).toBeNull();
    const scoped = await ctx.labels.create(
      orgId,
      userId,
      { name: 'frontend', color: '#00ff00', projectId },
      meta,
    );
    expect(scoped.projectId).toBe(projectId);
  });

  it('rejects duplicate label names within the same scope', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    await ctx.labels.create(orgId, userId, { name: 'bug', color: '#ff0000' }, meta);
    await expect(
      ctx.labels.create(orgId, userId, { name: 'bug', color: '#111111' }, meta),
    ).rejects.toThrow();
  });

  it('lists org-wide labels plus labels for the requested project', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const other = await ctx.projects.createProject(orgId, userId, { name: 'Other', key: 'OTH' }, meta);

    await ctx.labels.create(orgId, userId, { name: 'bug', color: '#ff0000' }, meta);
    await ctx.labels.create(orgId, userId, { name: 'fe', color: '#00ff00', projectId }, meta);
    await ctx.labels.create(orgId, userId, { name: 'be', color: '#0000ff', projectId: other.id }, meta);

    const list = await ctx.labels.list(orgId, { projectId, limit: 100 });
    const names = list.items.map((l) => l.name).sort();
    expect(names).toEqual(['bug', 'fe']);
  });

  it('detaches a label from all tasks when deleted', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const label = await ctx.labels.create(orgId, userId, { name: 'bug', color: '#ff0000' }, meta);
    const task = await ctx.tasks.createTask(orgId, userId, { projectId, title: 'T' }, meta);
    await ctx.tasks.updateTask(orgId, userId, task.id, { labelIds: [label.id] }, meta);

    let refreshed = await ctx.tasks.getTask(orgId, task.id);
    expect(refreshed.labelIds).toContain(label.id);

    await ctx.labels.remove(orgId, userId, label.id, meta);
    refreshed = await ctx.tasks.getTask(orgId, task.id);
    expect(refreshed.labelIds).not.toContain(label.id);
  });

  it('isolates labels across organizations', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    const label = await ctx.labels.create(orgId, userId, { name: 'bug', color: '#ff0000' }, meta);

    const other = await ctx.auth.register(
      { email: 'other@example.com', password: 'password123', name: 'Other' },
      meta,
    );
    const otherOrg = await ctx.orgs.createOrg(other.user.id, { name: 'Other', timezone: 'UTC' }, meta);

    await expect(ctx.labels.remove(otherOrg.id, other.user.id, label.id, meta)).rejects.toThrow();
  });
});
