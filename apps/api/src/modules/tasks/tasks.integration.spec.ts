import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

interface Ctx {
  orgId: string;
  userId: string;
  projectId: string;
  projectKey: string;
}

async function setup(ctx: TestContext, email = 'owner@example.com'): Promise<Ctx> {
  const reg = await ctx.auth.register({ email, password: 'password123', name: email }, meta);
  const org = await ctx.orgs.createOrg(reg.user.id, { name: 'Acme Inc', timezone: 'UTC' }, meta);
  const project = await ctx.projects.createProject(
    org.id,
    reg.user.id,
    { name: 'Auth', key: 'AUTH' },
    meta,
  );
  return { orgId: org.id, userId: reg.user.id, projectId: project.id, projectKey: project.key };
}

describe('Tasks backend (integration)', () => {
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

  it('creates a task with a project-derived key and writes audit + activity', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);

    const task = await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Login form' }, meta);
    expect(task.key).toBe('AUTH-1');
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('medium');
    expect(task.reporterId).toBe(userId);
    expect(task.order).toBeGreaterThan(0);

    const audits = await ctx.audit.list(orgId, { action: 'task.created', limit: 25 });
    expect(audits.items[0]?.entity).toEqual({ type: 'task', id: task.id });
    const activity = await ctx.activity.list(orgId, { limit: 25 });
    expect(activity.items.some((a) => a.verb === 'created' && a.object.id === task.id)).toBe(true);
  });

  it('enforces the depth-1 subtask rule', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const parent = await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Parent' }, meta);
    const sub = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'Child', parentId: parent.id },
      meta,
    );
    expect(sub.parentId).toBe(parent.id);
    expect(sub.key).toBe('AUTH-2');

    await expect(
      ctx.tasks.createTask(orgId, userId, { projectId, title: 'Grandchild', parentId: sub.id }, meta),
    ).rejects.toThrow();

    const subtasks = await ctx.tasks.listSubtasks(orgId, parent.id);
    expect(subtasks.items).toHaveLength(1);
  });

  it('assigns and unassigns a task', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    // Only developers/testers can be assigned to a task.
    const dev = await ctx.orgs.createMember(
      orgId,
      userId,
      { email: 'dev-assignee@example.com', name: 'Dev', password: 'password123', role: 'developer' },
      meta,
    );
    const task = await ctx.tasks.createTask(orgId, userId, { projectId, title: 'T' }, meta);

    const assigned = await ctx.tasks.assignTask(orgId, userId, task.id, { assigneeId: dev.userId }, meta);
    expect(assigned.assigneeId).toBe(dev.userId);
    const unassigned = await ctx.tasks.assignTask(orgId, userId, task.id, { assigneeId: null }, meta);
    expect(unassigned.assigneeId).toBeNull();

    // Non-assignable roles (e.g. the admin owner) are rejected.
    await expect(
      ctx.tasks.assignTask(orgId, userId, task.id, { assigneeId: userId }, meta),
    ).rejects.toThrow(/developers and testers/i);
  });

  it('maintains sprint point totals across create / move / delete (transactional)', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const sprint = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'S1' }, meta);

    const task = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'Estimated', sprintId: sprint.id, storyPoints: 5 },
      meta,
    );
    let s = await ctx.sprints.getSprint(orgId, sprint.id);
    expect(s.committedPoints).toBe(5);
    expect(s.completedPoints).toBe(0);

    // Complete the task → completedPoints reflects it.
    await ctx.tasks.moveTask(orgId, userId, task.id, { status: 'done' }, meta);
    s = await ctx.sprints.getSprint(orgId, sprint.id);
    expect(s.committedPoints).toBe(5);
    expect(s.completedPoints).toBe(5);

    // Move it out of the sprint → totals reset.
    await ctx.tasks.moveTask(orgId, userId, task.id, { sprintId: null }, meta);
    s = await ctx.sprints.getSprint(orgId, sprint.id);
    expect(s.committedPoints).toBe(0);
    expect(s.completedPoints).toBe(0);
  });

  it('moving a task between sprints updates both point totals atomically', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const a = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'A' }, meta);
    const b = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'B' }, meta);
    const task = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'Moving', sprintId: a.id, storyPoints: 8 },
      meta,
    );

    expect((await ctx.sprints.getSprint(orgId, a.id)).committedPoints).toBe(8);

    await ctx.tasks.moveTask(orgId, userId, task.id, { sprintId: b.id }, meta);
    expect((await ctx.sprints.getSprint(orgId, a.id)).committedPoints).toBe(0);
    expect((await ctx.sprints.getSprint(orgId, b.id)).committedPoints).toBe(8);
  });

  it('rejects moving a task into a sprint from another project', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const other = await ctx.projects.createProject(orgId, userId, { name: 'Other', key: 'OTH' }, meta);
    const foreignSprint = await ctx.sprints.createSprint(orgId, userId, other.id, { name: 'X' }, meta);
    const task = await ctx.tasks.createTask(orgId, userId, { projectId, title: 'T' }, meta);

    await expect(
      ctx.tasks.moveTask(orgId, userId, task.id, { sprintId: foreignSprint.id }, meta),
    ).rejects.toThrow();
  });

  it('bulk-updates tasks and recomputes sprint totals', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const sprint = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'S1' }, meta);
    const t1 = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'One', sprintId: sprint.id, storyPoints: 2 },
      meta,
    );
    const t2 = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'Two', sprintId: sprint.id, storyPoints: 3 },
      meta,
    );

    const res = await ctx.tasks.bulkUpdate(
      orgId,
      userId,
      { ids: [t1.id, t2.id], patch: { status: 'done' } },
      meta,
    );
    expect(res.updated).toBe(2);
    const s = await ctx.sprints.getSprint(orgId, sprint.id);
    expect(s.completedPoints).toBe(5);
  });

  it('bulk-deletes tasks and recomputes sprint totals', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const sprint = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'S1' }, meta);
    const t1 = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'One', sprintId: sprint.id, storyPoints: 2 },
      meta,
    );
    const t2 = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'Two', sprintId: sprint.id, storyPoints: 3 },
      meta,
    );
    expect((await ctx.sprints.getSprint(orgId, sprint.id)).committedPoints).toBe(5);

    const res = await ctx.tasks.bulkDelete(orgId, userId, { ids: [t1.id, t2.id] }, meta);
    expect(res.deleted).toBe(2);
    expect((await ctx.sprints.getSprint(orgId, sprint.id)).committedPoints).toBe(0);
  });

  it('soft-deletes and undoes a task, keeping sprint totals correct', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const sprint = await ctx.sprints.createSprint(orgId, userId, projectId, { name: 'S1' }, meta);
    const task = await ctx.tasks.createTask(
      orgId,
      userId,
      { projectId, title: 'Tmp', sprintId: sprint.id, storyPoints: 4 },
      meta,
    );
    expect((await ctx.sprints.getSprint(orgId, sprint.id)).committedPoints).toBe(4);

    await ctx.tasks.deleteTask(orgId, userId, task.id, meta);
    await expect(ctx.tasks.getTask(orgId, task.id)).rejects.toThrow();
    expect((await ctx.sprints.getSprint(orgId, sprint.id)).committedPoints).toBe(0);

    const restored = await ctx.tasks.undoDelete(orgId, userId, task.id, meta);
    expect(restored.id).toBe(task.id);
    expect((await ctx.sprints.getSprint(orgId, sprint.id)).committedPoints).toBe(4);
  });

  it('updates a task and records a before/after diff', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    const task = await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Old' }, meta);

    const updated = await ctx.tasks.updateTask(
      orgId,
      userId,
      task.id,
      { title: 'New', priority: 'high' },
      meta,
    );
    expect(updated.title).toBe('New');
    expect(updated.priority).toBe('high');

    const audits = await ctx.audit.list(orgId, { action: 'task.updated', limit: 25 });
    expect(audits.items[0]?.before).toMatchObject({ title: 'Old' });
    expect(audits.items[0]?.after).toMatchObject({ title: 'New', priority: 'high' });
  });

  it('filters, paginates (cursor), and full-text searches', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, projectId } = await setup(ctx);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Fix login bug' }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Add signup page' }, meta);
    await ctx.tasks.createTask(orgId, userId, { projectId, title: 'Write docs', status: 'done' }, meta);

    const page1 = await ctx.tasks.listTasks(orgId, { projectId, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.page.hasMore).toBe(true);
    const page2 = await ctx.tasks.listTasks(orgId, {
      projectId,
      limit: 2,
      cursor: page1.page.nextCursor ?? undefined,
    });
    expect(page2.items).toHaveLength(1);

    const done = await ctx.tasks.listTasks(orgId, { projectId, status: 'done', limit: 25 });
    expect(done.items).toHaveLength(1);
    expect(done.items[0]?.title).toBe('Write docs');

    const search = await ctx.tasks.listTasks(orgId, { q: 'login', limit: 25 });
    expect(search.items).toHaveLength(1);
    expect(search.items[0]?.title).toBe('Fix login bug');
  });

  it('enforces tenant isolation between orgs', async (t) => {
    if (!ctx) return t.skip();
    const a = await setup(ctx, 'alice@example.com');
    const b = await setup(ctx, 'bob@example.com');
    const task = await ctx.tasks.createTask(a.orgId, a.userId, { projectId: a.projectId, title: 'Secret' }, meta);

    await expect(ctx.tasks.getTask(b.orgId, task.id)).rejects.toThrow();
    const bobList = await ctx.tasks.listTasks(b.orgId, { limit: 25 });
    expect(bobList.items).toHaveLength(0);
  });
});
