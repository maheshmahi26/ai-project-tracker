import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

interface Ctx {
  orgId: string;
  userId: string;
  /** A developer member — the only kind of user that can be assigned tasks. */
  memberId: string;
  projectId: string;
}

async function setup(ctx: TestContext, email = 'owner@example.com'): Promise<Ctx> {
  const reg = await ctx.auth.register({ email, password: 'password123', name: email }, meta);
  const org = await ctx.orgs.createOrg(reg.user.id, { name: 'Acme Inc', timezone: 'UTC' }, meta);
  const member = await ctx.orgs.createMember(
    org.id,
    reg.user.id,
    { email: `dev-${email}`, name: 'Dev', password: 'password123', role: 'developer' },
    meta,
  );
  const project = await ctx.projects.createProject(org.id, reg.user.id, { name: 'Auth', key: 'AUTH' }, meta);
  return { orgId: org.id, userId: reg.user.id, memberId: member.userId, projectId: project.id };
}

describe('Dashboard & reports backend (integration)', () => {
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
    await ctx.connection.models.Sprint?.syncIndexes();
  });

  it('computes overview counts, open/done, and overdue', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);

    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'A', status: 'todo', storyPoints: 3 }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'B', status: 'in_progress', storyPoints: 5 }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'C', status: 'done', storyPoints: 2 }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'D', status: 'done', storyPoints: 8 }, meta);
    await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'E', status: 'todo', dueDate: '2020-01-01' },
      meta,
    );

    const overview = await ctx.dashboard.overview(orgId, {});
    expect(overview.tasks.total).toBe(5);
    expect(overview.tasks.byStatus.todo).toBe(2);
    expect(overview.tasks.byStatus.in_progress).toBe(1);
    expect(overview.tasks.byStatus.done).toBe(2);
    expect(overview.tasks.done).toBe(2);
    expect(overview.tasks.open).toBe(3);
    expect(overview.tasks.overdue).toBe(1);
    expect(overview.projects.total).toBe(1);
    expect(overview.projects.active).toBe(1);
  });

  it('groups tasks per user and by priority', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, memberId, projectId } = await setup(ctx);

    await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'A', priority: 'high', assigneeId: memberId, status: 'done', storyPoints: 3 },
      meta,
    );
    await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'B', priority: 'high', assigneeId: memberId, status: 'todo' },
      meta,
    );
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'C', priority: 'low' }, meta);

    const perUser = await ctx.dashboard.tasksPerUser(orgId, {});
    const mine = perUser.find((r) => r.assigneeId === memberId);
    expect(mine).toMatchObject({ total: 2, done: 1, open: 1, points: 3 });
    const unassigned = perUser.find((r) => r.assigneeId === null);
    expect(unassigned?.total).toBe(1);

    const priority = await ctx.dashboard.priorityDistribution(orgId, {});
    expect(priority.find((p) => p.priority === 'high')?.count).toBe(2);
    expect(priority.find((p) => p.priority === 'low')?.count).toBe(1);
    expect(priority.find((p) => p.priority === 'urgent')?.count).toBe(0);
  });

  it('reports project progress as a completion percentage', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);

    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'A', status: 'done', storyPoints: 2 }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'B', status: 'todo', storyPoints: 3 }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'C', status: 'todo' }, meta);

    const progress = await ctx.dashboard.projectProgress(orgId);
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      projectId,
      key: 'AUTH',
      total: 3,
      done: 1,
      open: 2,
      percentComplete: 33,
      points: 5,
      donePoints: 2,
    });
  });

  it('returns velocity and a burndown series for a sprint', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);

    const start = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const sprint = await ctx.sprints.createSprint(
      orgId,
      userId,
      projectId,
      { name: 'Sprint 1', startDate: start, endDate: end },
      meta,
    );

    await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'A', sprintId: sprint.id, status: 'done', storyPoints: 3 },
      meta,
    );
    await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'B', sprintId: sprint.id, status: 'todo', storyPoints: 5 },
      meta,
    );

    const velocity = await ctx.dashboard.velocity(orgId, {});
    const point = velocity.find((v) => v.sprintId === sprint.id);
    expect(point).toBeDefined();
    expect(point?.committedPoints).toBe(8);
    expect(point?.completedPoints).toBe(3);

    const burndown = await ctx.dashboard.burndown(orgId, sprint.id);
    expect(burndown.totalPoints).toBe(8);
    expect(burndown.points.length).toBeGreaterThanOrEqual(2);
    expect(burndown.points[0]?.ideal).toBe(8);
    expect(burndown.points[burndown.points.length - 1]?.ideal).toBe(0);
    // All done work (3 pts) is burned by the final day.
    expect(burndown.points[burndown.points.length - 1]?.remaining).toBe(5);
  });

  it('rejects burndown for an unknown sprint', async (t) => {
    if (!ctx) return t.skip();
    const { orgId } = await setup(ctx);
    await expect(ctx.dashboard.burndown(orgId, '507f1f77bcf86cd799439011')).rejects.toThrow();
  });

  it('builds a weekly report with created/completed counts and contributors', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, memberId, projectId } = await setup(ctx);

    await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'A', priority: 'urgent', assigneeId: memberId, status: 'done' },
      meta,
    );
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'B', priority: 'low' }, meta);

    const sprint = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'S' }, meta);
    await ctx.sprints.startSprint(orgId, userId, sprint.id, meta);

    const report = await ctx.dashboard.weeklyReport(orgId, {});
    expect(report.createdCount).toBe(2);
    expect(report.completedCount).toBe(1);
    expect(report.createdByPriority.urgent).toBe(1);
    expect(report.createdByPriority.low).toBe(1);
    expect(report.activeSprints).toBe(1);
    expect(report.topContributors[0]).toMatchObject({ assigneeId: memberId, done: 1 });
  });

  it('exports tasks as CSV, quoting fields that contain commas', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);

    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Login, please', status: 'todo' }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Logout', status: 'done', storyPoints: 4 }, meta);

    const csv = await ctx.dashboard.exportTasksCsv(orgId, {});
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('key,title,status,priority,storyPoints,dueDate,assigneeId,createdAt');
    expect(lines).toHaveLength(3);
    expect(csv).toContain('"Login, please"');
    expect(csv).toContain('AUTH-1');
  });

  it('isolates aggregates by organization (tenancy)', async (t) => {
    if (!ctx) return t.skip();
    const a = await setup(ctx, 'a@example.com');
    await ctx.tasks.createTask(a.orgId, a.userId, { projectId: a.projectId, title: 'A' }, meta);

    const b = await setup(ctx, 'b@example.com');

    const overviewB = await ctx.dashboard.overview(b.orgId, {});
    expect(overviewB.tasks.total).toBe(0);

    const overviewA = await ctx.dashboard.overview(a.orgId, {});
    expect(overviewA.tasks.total).toBe(1);
  });
});
