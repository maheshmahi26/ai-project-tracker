import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@ai-projectos/shared';
import { createTestContext, type TestContext } from '../../../test/integration-module';
import { createProject, setupOrgWithAdmin, type OrgWithAdmin } from '../../../test/factories';
import type { ToolContext } from './ai-tool';

let ctx: TestContext | null = null;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  if (ctx) {
    await ctx.connection.dropDatabase();
    await ctx.module.close();
  }
});

beforeEach(() => {
  if (ctx) ctx.gemini.reset();
});

const maybe = (name: string, fn: () => Promise<void>): void => {
  it(name, async () => {
    if (!ctx) return; // Mongo unavailable → skip.
    await fn();
  });
};

function toolCtx(orgId: string, userId: string, role: Role): ToolContext {
  return { principal: { userId, orgId, role }, requestId: 'req-gen-test' };
}

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

describe('AI generative tools (integration)', () => {
  maybe('each generative tool returns schema-valid JSON (mocked Gemini)', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Gen Org');

    const cases: Array<[string, Record<string, unknown>, unknown]> = [
      [
        'generateUserStories',
        { feature: 'Login with Google' },
        { stories: [{ title: 'SSO', asA: 'user', iWant: 'google login', soThat: 'faster', acceptanceCriteria: ['works'] }] },
      ],
      [
        'generateMeetingSummary',
        { notes: 'We decided to ship Friday. Riya owns the migration.' },
        { summary: 'Ship Friday', decisions: ['Ship Friday'], actionItems: [{ owner: 'Riya', task: 'migration' }] },
      ],
      [
        'generateRoadmap',
        { goals: 'Reach 10k users' },
        { phases: [{ name: 'Phase 1', objective: 'Foundation', durationWeeks: 4, items: ['auth'] }] },
      ],
      ['generateAcceptanceCriteria', { description: 'Reset password' }, { criteria: ['Given a valid token, when...'] }],
    ];

    for (const [name, args, json] of cases) {
      c.gemini.scriptJson(json);
      const res = await run(c, setup, name, args);
      expect(res.ok, `${name} should succeed`).toBe(true);
    }
  });

  maybe('rejects model output that violates the schema', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Bad Gen Org');
    // Missing required `criteria` array → schema validation fails.
    c.gemini.scriptJson({ notCriteria: true });
    const res = await run(c, setup, 'generateAcceptanceCriteria', { description: 'x' });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('BUSINESS_RULE');
  });

  maybe('generateSprint proposal → applySprintPlan commit creates a real sprint + tasks, audited', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Plan Org');
    await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });

    c.gemini.scriptJson({
      name: 'Sprint 1',
      goal: 'Ship auth',
      durationDays: 14,
      tasks: [
        { title: 'Login form', priority: 'high', storyPoints: 3 },
        { title: 'Session refresh', priority: 'medium', storyPoints: 5 },
      ],
    });

    const proposal = await run(c, setup, 'generateSprint', { project: 'AUTH' });
    expect(proposal.ok).toBe(true);
    const plan = proposal.data;

    // First apply → confirmation required, nothing created.
    const gate = await run(c, setup, 'applySprintPlan', { project: 'AUTH', plan });
    expect((gate.data as { needsConfirmation: boolean }).needsConfirmation).toBe(true);

    // Confirmed apply → real sprint + tasks.
    const commit = await run(c, setup, 'applySprintPlan', { project: 'AUTH', plan, confirm: true });
    const data = commit.data as { sprintId: string; created: number; taskKeys: string[] };
    expect(data.created).toBe(2);

    const sprint = await c.sprints.getSprint(setup.org.id, data.sprintId);
    expect(sprint.name).toBe('Sprint 1');
    const sprintTasks = await c.tasks.listTasks(setup.org.id, { sprintId: data.sprintId, limit: 50 });
    expect(sprintTasks.items).toHaveLength(2);

    const audits = await c.audit.list(setup.org.id, { limit: 50 });
    expect(audits.items.some((a) => a.action === 'sprint.created' && a.source === 'ai')).toBe(true);
    expect(audits.items.some((a) => a.action === 'task.created' && a.source === 'ai')).toBe(true);
  });

  maybe('analytics answers a structured question from real aggregates', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Analytics Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'A done task', status: 'done' },
      { requestId: 't' },
    );
    await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'An open task' },
      { requestId: 't' },
    );

    const res = await run(c, setup, 'analytics', { metric: 'overview', project: 'AUTH' });
    expect(res.ok).toBe(true);
    const data = res.data as { metric: string; points: Array<{ label: string; value: number }> };
    expect(data.metric).toBe('overview');
    expect(data.points.find((p) => p.label === 'done')?.value).toBe(1);
    expect(data.points.find((p) => p.label === 'open')?.value).toBe(1);
    // No LLM call for deterministic analytics.
    expect(c.gemini.jsonCalls).toHaveLength(0);
  });

  maybe('blocks a viewer from committing a plan (sprint:manage)', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Gen Viewer Org');
    const res = await run(
      c,
      setup,
      'applySprintPlan',
      { project: 'AUTH', plan: { name: 'S', goal: '', durationDays: 14, tasks: [{ title: 't', priority: 'medium' }] }, confirm: true },
      'viewer',
      'deadbeefdeadbeefdeadbeef',
    );
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('PERMISSION_DENIED');
  });
});
