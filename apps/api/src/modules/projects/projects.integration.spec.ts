import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

async function setupOrg(
  ctx: TestContext,
  email = 'owner@example.com',
): Promise<{ orgId: string; userId: string }> {
  const reg = await ctx.auth.register({ email, password: 'password123', name: email }, meta);
  const org = await ctx.orgs.createOrg(reg.user.id, { name: 'Acme Inc', timezone: 'UTC' }, meta);
  return { orgId: org.id, userId: reg.user.id };
}

describe('Projects backend (integration)', () => {
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
    // Recreate the text index dropped with the database (search test needs it).
    await ctx.connection.models.Project?.syncIndexes();
  });

  it('creates a project with a derived key and writes audit + activity', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);

    const project = await ctx.projects.createProject(
      orgId,
      userId,
      { name: 'Authentication' },
      meta,
    );
    expect(project.key).toBe('AUTH');
    expect(project.status).toBe('active');
    expect(project.counters.taskSeq).toBe(0);

    const audits = await ctx.audit.list(orgId, { limit: 25 });
    expect(audits.items.some((a) => a.action === 'project.created')).toBe(true);
    const created = audits.items.find((a) => a.action === 'project.created');
    expect(created?.entity).toEqual({ type: 'project', id: project.id });

    const activity = await ctx.activity.list(orgId, { limit: 25 });
    expect(activity.items.some((a) => a.verb === 'created' && a.object.id === project.id)).toBe(
      true,
    );
  });

  it('honors an explicit key and rejects duplicates', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    const p = await ctx.projects.createProject(orgId, userId, { name: 'Billing', key: 'PAY' }, meta);
    expect(p.key).toBe('PAY');

    await expect(
      ctx.projects.createProject(orgId, userId, { name: 'Payments', key: 'PAY' }, meta),
    ).rejects.toThrow();
  });

  it('auto-increments the key when names collide', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    const a = await ctx.projects.createProject(orgId, userId, { name: 'Acme' }, meta);
    const b = await ctx.projects.createProject(orgId, userId, { name: 'Acme' }, meta);
    expect(a.key).toBe('ACME');
    expect(b.key).toBe('ACME2');
  });

  it('updates a project and records a before/after diff', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    const p = await ctx.projects.createProject(orgId, userId, { name: 'Old Name' }, meta);

    const updated = await ctx.projects.updateProject(
      orgId,
      userId,
      p.id,
      { name: 'New Name', color: '#000000' },
      meta,
    );
    expect(updated.name).toBe('New Name');

    const audits = await ctx.audit.list(orgId, { action: 'project.updated', limit: 25 });
    const row = audits.items[0];
    expect(row?.before).toMatchObject({ name: 'Old Name' });
    expect(row?.after).toMatchObject({ name: 'New Name', color: '#000000' });
  });

  it('archives and restores; rejects double-archive', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    const p = await ctx.projects.createProject(orgId, userId, { name: 'Lifecycle' }, meta);

    const archived = await ctx.projects.archiveProject(orgId, userId, p.id, meta);
    expect(archived.status).toBe('archived');
    await expect(ctx.projects.archiveProject(orgId, userId, p.id, meta)).rejects.toThrow();

    const restored = await ctx.projects.restoreProject(orgId, userId, p.id, meta);
    expect(restored.status).toBe('active');
  });

  it('soft-deletes and undoes the delete', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    const p = await ctx.projects.createProject(orgId, userId, { name: 'Temp' }, meta);

    await ctx.projects.deleteProject(orgId, userId, p.id, meta);
    await expect(ctx.projects.getProject(orgId, p.id)).rejects.toThrow();
    const listed = await ctx.projects.listProjects(orgId, { status: 'all', limit: 25 });
    expect(listed.items).toHaveLength(0);

    const restored = await ctx.projects.undoDelete(orgId, userId, p.id, meta);
    expect(restored.id).toBe(p.id);
    const afterUndo = await ctx.projects.getProject(orgId, p.id);
    expect(afterUndo.id).toBe(p.id);
  });

  it('paginates with a cursor and filters by status', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    for (let i = 0; i < 3; i += 1) {
      await ctx.projects.createProject(orgId, userId, { name: `Project ${i}` }, meta);
    }
    const page1 = await ctx.projects.listProjects(orgId, { status: 'active', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.page.hasMore).toBe(true);
    expect(page1.page.nextCursor).toBeTruthy();

    const page2 = await ctx.projects.listProjects(orgId, {
      status: 'active',
      limit: 2,
      cursor: page1.page.nextCursor ?? undefined,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.page.hasMore).toBe(false);
  });

  it('supports offset pagination with total and status filter', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    const p = await ctx.projects.createProject(orgId, userId, { name: 'Alpha' }, meta);
    await ctx.projects.createProject(orgId, userId, { name: 'Beta' }, meta);
    await ctx.projects.archiveProject(orgId, userId, p.id, meta);

    const active = await ctx.projects.listProjects(orgId, {
      status: 'active',
      page: 1,
      pageSize: 10,
      limit: 25,
    });
    expect(active.page.total).toBe(1);
    const archived = await ctx.projects.listProjects(orgId, {
      status: 'archived',
      page: 1,
      pageSize: 10,
      limit: 25,
    });
    expect(archived.page.total).toBe(1);
    expect(archived.items[0]?.id).toBe(p.id);
  });

  it('full-text searches by name', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    await ctx.projects.createProject(orgId, userId, { name: 'Mobile App' }, meta);
    await ctx.projects.createProject(orgId, userId, { name: 'Website Redesign' }, meta);

    const results = await ctx.projects.listProjects(orgId, { status: 'all', q: 'mobile', limit: 25 });
    expect(results.items).toHaveLength(1);
    expect(results.items[0]?.name).toBe('Mobile App');
  });

  it('enforces tenant isolation between orgs', async (t) => {
    if (!ctx) return t.skip();
    const a = await setupOrg(ctx, 'alice@example.com');
    const b = await setupOrg(ctx, 'bob@example.com');
    const project = await ctx.projects.createProject(a.orgId, a.userId, { name: 'Secret' }, meta);

    await expect(ctx.projects.getProject(b.orgId, project.id)).rejects.toThrow();
    const bobList = await ctx.projects.listProjects(b.orgId, { status: 'all', limit: 25 });
    expect(bobList.items).toHaveLength(0);
  });

  it('allocates sequential task numbers from the project counter', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupOrg(ctx);
    const p = await ctx.projects.createProject(orgId, userId, { name: 'Counter', key: 'CNT' }, meta);

    const first = await ctx.projects.allocateTaskNumber(orgId, p.id);
    const second = await ctx.projects.allocateTaskNumber(orgId, p.id);
    expect(first).toEqual({ key: 'CNT-1', seq: 1 });
    expect(second).toEqual({ key: 'CNT-2', seq: 2 });
  });
});
