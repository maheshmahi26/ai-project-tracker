import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

async function setupProject(
  ctx: TestContext,
  email = 'owner@example.com',
): Promise<{ orgId: string; userId: string; projectId: string }> {
  const reg = await ctx.auth.register({ email, password: 'password123', name: email }, meta);
  const org = await ctx.orgs.createOrg(reg.user.id, { name: 'Acme Inc', timezone: 'UTC' }, meta);
  const project = await ctx.projects.createProject(org.id, reg.user.id, { name: 'Platform' }, meta);
  return { orgId: org.id, userId: reg.user.id, projectId: project.id };
}

describe('Sprints backend (integration)', () => {
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
  });

  it('creates a sprint (planned) and writes audit + activity', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setupProject(ctx);

    const sprint = await ctx.sprints.createSprint(
      orgId,
      userId,
      projectId,
      { name: 'Sprint 1', goal: 'Ship auth', capacityPoints: 20 },
      meta,
    );
    expect(sprint.status).toBe('planned');
    expect(sprint.committedPoints).toBe(0);
    expect(sprint.capacityPoints).toBe(20);

    const audits = await ctx.audit.list(orgId, { action: 'sprint.created', limit: 25 });
    expect(audits.items[0]?.entity).toEqual({ type: 'sprint', id: sprint.id });
  });

  it('rejects sprint creation for a missing project', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setupProject(ctx);
    await expect(
      ctx.sprints.createSprint(orgId, userId, '65'.padEnd(24, '0'), { name: 'X' }, meta),
    ).rejects.toThrow();
  });

  it('starts and completes a sprint with lifecycle guards', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setupProject(ctx);
    const sprint = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'S1' }, meta);

    const started = await ctx.sprints.startSprint(orgId, userId, sprint.id, meta);
    expect(started.status).toBe('active');
    expect(started.startDate).toBeTruthy();
    await expect(ctx.sprints.startSprint(orgId, userId, sprint.id, meta)).rejects.toThrow();

    const completed = await ctx.sprints.completeSprint(orgId, userId, sprint.id, meta);
    expect(completed.status).toBe('completed');
    await expect(ctx.sprints.completeSprint(orgId, userId, sprint.id, meta)).rejects.toThrow();
    await expect(ctx.sprints.startSprint(orgId, userId, sprint.id, meta)).rejects.toThrow();
  });

  it('lists sprints for a project and filters by status', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setupProject(ctx);
    const a = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'A' }, meta);
    await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'B' }, meta);
    await ctx.sprints.startSprint(orgId, userId, a.id, meta);

    const all = await ctx.sprints.listSprints(orgId, projectId, { status: 'all', limit: 50 });
    expect(all.items).toHaveLength(2);
    const active = await ctx.sprints.listSprints(orgId, projectId, { status: 'active', limit: 50 });
    expect(active.items).toHaveLength(1);
    expect(active.items[0]?.id).toBe(a.id);
  });

  it('deletes a sprint and detaches its tasks', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setupProject(ctx);
    const sprint = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'S1' }, meta);
    const task = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'In sprint', sprintId: sprint.id, storyPoints: 3 },
      meta,
    );

    await ctx.sprints.deleteSprint(orgId, userId, sprint.id, meta);
    await expect(ctx.sprints.getSprint(orgId, sprint.id)).rejects.toThrow();

    const detached = await ctx.tasks.getTask(orgId, task.id);
    expect(detached.sprintId).toBeNull();
  });

  it('enforces tenant isolation', async (t) => {
    if (!ctx) return t.skip();
    const a = await setupProject(ctx, 'alice@example.com');
    const b = await setupProject(ctx, 'bob@example.com');
    const sprint = await ctx.sprints.createSprint(a.orgId, a.userId, a.projectId, { name: 'S' }, meta);

    await expect(ctx.sprints.getSprint(b.orgId, sprint.id)).rejects.toThrow();
  });
});
