import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '@ai-projectos/shared';
import { createTestContext, type TestContext } from '../../../test/integration-module';
import {
  createMember,
  createProject,
  setupOrgWithAdmin,
  type OrgWithAdmin,
} from '../../../test/factories';
import type { ToolContext } from './ai-tool';

let ctx: TestContext | null = null;

beforeAll(async () => {
  ctx = await createTestContext();
  if (ctx) {
    // dropDatabase() (in the harness) also drops indexes — rebuild the text
    // indexes the search paths rely on.
    await ctx.connection.models.Project?.syncIndexes();
    await ctx.connection.models.Task?.syncIndexes();
  }
});

afterAll(async () => {
  if (ctx) {
    await ctx.connection.dropDatabase();
    await ctx.module.close();
  }
});

const maybe = (name: string, fn: () => Promise<void>): void => {
  it(name, async () => {
    if (!ctx) return; // Mongo unavailable → skip.
    await fn();
  });
};

function toolCtx(orgId: string, userId: string, role: Role): ToolContext {
  return { principal: { userId, orgId, role }, requestId: 'req-tool-test' };
}

/** Convenience: run a tool as a given principal through the registry. */
async function run(
  c: TestContext,
  setup: OrgWithAdmin,
  name: string,
  args: Record<string, unknown>,
  role: Role = 'admin',
  userId = setup.admin.userId,
) {
  return c.toolRegistry.execute(name, args, toolCtx(setup.org.id, userId, role));
}

describe('AI action tools (integration)', () => {
  maybe('createTask resolves project key + assignee name and audits source "ai"', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Tools Org');
    await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const mahesh = await createMember(c, setup.org.id, setup.admin.userId, { name: 'Mahesh' });

    const res = await run(c, setup, 'createTask', {
      project: 'AUTH',
      title: 'Backend auth task',
      priority: 'high',
      assignee: 'Mahesh',
    });

    expect(res.ok).toBe(true);
    const data = res.data as { id: string; key: string; assigneeId: string | null; priority: string };
    expect(data.key).toMatch(/^AUTH-\d+$/);
    expect(data.assigneeId).toBe(mahesh.userId);
    expect(data.priority).toBe('high');

    // Parity: the persisted task matches what the tool reported.
    const task = await c.tasks.getTask(setup.org.id, data.id);
    expect(task.title).toBe('Backend auth task');
    expect(task.assigneeId).toBe(mahesh.userId);

    // Audited as an AI action.
    const audits = await c.audit.list(setup.org.id, { limit: 25 });
    const created = audits.items.find((a) => a.action === 'task.created');
    expect(created?.source).toBe('ai');
    expect(created?.actorType).toBe('ai');
  });

  maybe('blocks a developer via requiredPermission (no escalation)', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Developer Org');
    const developer = await createMember(c, setup.org.id, setup.admin.userId, { role: 'developer' });

    // Developers cannot create projects (project:create is admin/manager only).
    const res = await run(
      c,
      setup,
      'createProject',
      { name: 'Should not be created' },
      'developer',
      developer.userId,
    );

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('PERMISSION_DENIED');
    // createProject is not even offered to a developer's model.
    expect(c.toolRegistry.functionDeclarations('developer').map((d) => d.name)).not.toContain(
      'createProject',
    );
  });

  maybe('disambiguates an ambiguous assignee name', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Ambiguous Org');
    await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    await createMember(c, setup.org.id, setup.admin.userId, { name: 'Sam Carter' });
    await createMember(c, setup.org.id, setup.admin.userId, { name: 'Sam Doyle' });

    const res = await run(c, setup, 'createTask', {
      project: 'AUTH',
      title: 'Ambiguous assignee',
      assignee: 'Sam',
    });

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('VALIDATION_ERROR');
    expect((res.error?.details as unknown[]).length).toBe(2);
  });

  maybe('searchTasks returns compact summaries filtered by project', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Search Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Searchable task', priority: 'urgent' },
      { requestId: 't' },
    );

    const res = await run(c, setup, 'searchTasks', { project: 'AUTH', query: 'Searchable' });
    expect(res.ok).toBe(true);
    const data = res.data as { count: number; tasks: Array<{ title: string; url: string }> };
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.tasks[0]?.url).toMatch(/^\/tasks\//);
  });

  maybe('assign + move + comment operate on a task by key', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Flow Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const created = await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Flow task' },
      { requestId: 't' },
    );
    const member = await createMember(c, setup.org.id, setup.admin.userId, { name: 'Riya' });

    const assigned = await run(c, setup, 'assignTask', { task: created.key, assignee: 'Riya' });
    expect((assigned.data as { assigneeId: string }).assigneeId).toBe(member.userId);

    const moved = await run(c, setup, 'moveTask', { task: created.key, status: 'in_progress' });
    expect((moved.data as { status: string }).status).toBe('in_progress');

    const commented = await run(c, setup, 'addComment', { task: created.key, text: 'Looks good' });
    expect(commented.ok).toBe(true);
    const comments = await c.comments.list(setup.org.id, created.id, { limit: 10 });
    expect(comments.items.length).toBe(1);
  });

  maybe('sprint tools: create, add tasks, complete', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Sprint Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const task = await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Sprint task', storyPoints: 5 },
      { requestId: 't' },
    );

    const sprint = await run(c, setup, 'createSprint', { project: 'AUTH', name: 'Sprint 1' });
    expect(sprint.ok).toBe(true);

    const added = await run(c, setup, 'addTasksToSprint', {
      project: 'AUTH',
      sprint: 'Sprint 1',
      tasks: [task.key],
    });
    expect((added.data as { updated: number }).updated).toBe(1);

    const completed = await run(c, setup, 'completeSprint', { project: 'AUTH', sprint: 'Sprint 1' });
    expect((completed.data as { status: string }).status).toBe('completed');
  });

  maybe('deleteProject requires confirmation before committing', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Confirm Org');
    await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });

    const first = await run(c, setup, 'deleteProject', { project: 'AUTH' });
    expect(first.ok).toBe(true);
    expect((first.data as { needsConfirmation: boolean }).needsConfirmation).toBe(true);
    // Still there.
    await expect(c.projects.getProject(setup.org.id, (first.data as { id: string }).id)).resolves.toBeDefined();

    const second = await run(c, setup, 'deleteProject', { project: 'AUTH', confirm: true });
    expect((second.data as { deleted: boolean }).deleted).toBe(true);
    await expect(
      c.projects.getProject(setup.org.id, (second.data as { id: string }).id),
    ).rejects.toThrow(/not found/i);
  });

  maybe('bulkDeleteTasks requires confirmation before committing', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Bulk Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const t1 = await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Bulk 1' },
      { requestId: 't' },
    );
    const t2 = await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Bulk 2' },
      { requestId: 't' },
    );

    const first = await run(c, setup, 'bulkDeleteTasks', { tasks: [t1.key, t2.key] });
    expect((first.data as { needsConfirmation: boolean; count: number }).needsConfirmation).toBe(true);
    expect((first.data as { count: number }).count).toBe(2);

    const second = await run(c, setup, 'bulkDeleteTasks', { tasks: [t1.key, t2.key], confirm: true });
    expect((second.data as { deleted: number }).deleted).toBe(2);
  });
});
