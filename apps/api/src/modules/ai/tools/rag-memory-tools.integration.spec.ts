import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { Role } from '@ai-projectos/shared';
import { createTestContext, type TestContext } from '../../../test/integration-module';
import { createProject, createMember, setupOrgWithAdmin, type OrgWithAdmin } from '../../../test/factories';
import type { ToolContext } from './ai-tool';

let ctx: TestContext | null = null;

beforeAll(async () => {
  ctx = await createTestContext();
  if (ctx) {
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
    if (!ctx) return;
    await fn();
  });
};

function toolCtx(orgId: string, userId: string, role: Role, sessionId?: string): ToolContext {
  return { principal: { userId, orgId, role }, requestId: 'req-rag-test', sessionId };
}

async function run(
  c: TestContext,
  setup: OrgWithAdmin,
  name: string,
  args: Record<string, unknown>,
  role: Role = 'admin',
  userId = setup.admin.userId,
  sessionId?: string,
) {
  return c.toolRegistry.execute(name, args, toolCtx(setup.org.id, userId, role, sessionId));
}

const PRD_TEXT = Array.from(
  { length: 30 },
  (_, i) => `Requirement ${i}: build the authentication capability number ${i}.`,
).join(' ');

async function uploadAndIndex(c: TestContext, orgId: string, userId: string, title = 'PRD') {
  const presigned = await c.documents.presign(orgId, {
    fileName: `${title}.txt`,
    mimeType: 'text/plain',
    sizeBytes: PRD_TEXT.length,
  });
  c.storage.objects.set(presigned.storageKey, Buffer.from(PRD_TEXT, 'utf8'));
  const doc = await c.documents.confirm(orgId, userId, {
    storageKey: presigned.storageKey,
    title,
    mimeType: 'text/plain',
    sizeBytes: PRD_TEXT.length,
  });
  await c.documentIndexer.index(orgId, doc.id);
  return doc;
}

describe('RAG tools (integration)', () => {
  maybe('searchKnowledge returns citations grounded in the org documents', async () => {
    const c = ctx!;
    c.gemini.reset();
    const setup = await setupOrgWithAdmin(c, 'RAG Org');
    await uploadAndIndex(c, setup.org.id, setup.admin.userId, 'Auth PRD');

    const res = await run(c, setup, 'searchKnowledge', { query: 'authentication' });
    expect(res.ok).toBe(true);
    const data = res.data as { chunks: Array<{ documentTitle: string; chunkIndex: number }> };
    expect(data.chunks.length).toBeGreaterThan(0);
    expect(data.chunks[0]!.documentTitle).toBe('Auth PRD');
  });

  maybe('askDocuments answers with citations', async () => {
    const c = ctx!;
    c.gemini.reset();
    const setup = await setupOrgWithAdmin(c, 'Ask Org');
    await uploadAndIndex(c, setup.org.id, setup.admin.userId, 'Auth PRD');
    c.gemini.scriptJson({ answer: 'Auth must support SSO.', hasAnswer: true });

    const res = await run(c, setup, 'askDocuments', { question: 'What must auth support?' });
    expect(res.ok).toBe(true);
    const data = res.data as { answer: string; citations: unknown[] };
    expect(data.answer).toContain('SSO');
    expect(data.citations.length).toBeGreaterThan(0);
  });

  maybe('generateTasksFromDocument → applyGeneratedTasks (propose → confirm → audited create)', async () => {
    const c = ctx!;
    c.gemini.reset();
    const setup = await setupOrgWithAdmin(c, 'DocTasks Org');
    await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const doc = await uploadAndIndex(c, setup.org.id, setup.admin.userId, 'Auth PRD');

    c.gemini.scriptJson({
      tasks: [
        { title: 'Login endpoint', description: 'JWT', priority: 'high', storyPoints: 5 },
        { title: 'MFA', priority: 'medium' },
      ],
    });
    const proposal = await run(c, setup, 'generateTasksFromDocument', { document: doc.id });
    expect(proposal.ok).toBe(true);
    const plan = proposal.data as { tasks: unknown[] };
    expect(plan.tasks).toHaveLength(2);

    // Propose (no confirm) → nothing created.
    const dry = await run(c, setup, 'applyGeneratedTasks', { project: 'AUTH', tasks: plan.tasks });
    expect(dry.ok).toBe(true);
    expect((dry.data as { needsConfirmation: boolean }).needsConfirmation).toBe(true);

    // Confirm → tasks created.
    const commit = await run(c, setup, 'applyGeneratedTasks', {
      project: 'AUTH',
      tasks: plan.tasks,
      confirm: true,
    });
    expect(commit.ok).toBe(true);
    const created = commit.data as { created: number; tasks: Array<{ key: string }> };
    expect(created.created).toBe(2);
    expect(created.tasks[0]!.key).toMatch(/^AUTH-\d+$/);

    const audits = await c.audit.list(setup.org.id, { limit: 25 });
    const createEvent = audits.items.find((a) => a.action === 'task.created');
    expect(createEvent?.source).toBe('ai');
  });

  maybe('blocks a tester from a privileged action (no escalation)', async () => {
    const c = ctx!;
    c.gemini.reset();
    const setup = await setupOrgWithAdmin(c, 'DocTasks Tester Org');
    await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const tester = await createMember(c, setup.org.id, setup.admin.userId, { role: 'tester' });

    // Testers may create/apply tasks, but cannot delete a project (project:delete).
    const res = await run(
      c,
      setup,
      'deleteProject',
      { project: 'AUTH', confirm: true },
      'tester',
      tester.userId,
    );
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('PERMISSION_DENIED');
  });
});

describe('Conversation memory (integration)', () => {
  /** Yesterday, in the middle of the UTC day, so it falls inside the resolver window. */
  function yesterdayMidday(): Date {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return new Date(startOfToday.getTime() - 12 * 60 * 60 * 1000);
  }

  async function seedAssistantRef(
    c: TestContext,
    orgId: string,
    userId: string,
    sessionId: string,
    taskKey: string,
    taskId: string,
    createdAt: Date,
  ): Promise<void> {
    await c.connection.collection('chatmessages').insertOne({
      orgId: new Types.ObjectId(orgId),
      sessionId: new Types.ObjectId(sessionId),
      userId: new Types.ObjectId(userId),
      role: 'assistant',
      content: `Created ${taskKey}.`,
      toolResults: [
        { callId: 'c1', ok: true, data: { key: taskKey, id: taskId, url: `/tasks/${taskId}` }, error: null },
      ],
      createdAt,
    });
  }

  maybe('recallTasks resolves task keys referenced "yesterday" in this session', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Recall Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const task = await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Task A' },
      { requestId: 't' },
    );
    const session = await c.chat.createSession(setup.org.id, setup.admin.userId, {});

    await seedAssistantRef(c, setup.org.id, setup.admin.userId, session.id, task.key, task.id, yesterdayMidday());

    const recalled = await c.memoryResolver.recallTasks(setup.org.id, session.id, 'yesterday');
    expect(recalled.tasks.map((t) => t.key)).toContain(task.key);
    expect(recalled.tasks[0]!.id).toBe(task.id);
  });

  maybe('recallTasks is session-scoped (no leakage across sessions)', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Recall Scope Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const task = await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Task B' },
      { requestId: 't' },
    );
    const s1 = await c.chat.createSession(setup.org.id, setup.admin.userId, {});
    const s2 = await c.chat.createSession(setup.org.id, setup.admin.userId, {});
    await seedAssistantRef(c, setup.org.id, setup.admin.userId, s1.id, task.key, task.id, yesterdayMidday());

    const other = await c.memoryResolver.recallTasks(setup.org.id, s2.id, 'yesterday');
    expect(other.tasks).toHaveLength(0);
  });

  maybe('recallTasks tool returns concrete keys the agent can act on', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Recall Tool Org');
    const project = await createProject(c, setup.org.id, setup.admin.userId, { name: 'Auth', key: 'AUTH' });
    const task = await c.tasks.createTask(
      setup.org.id,
      setup.admin.userId,
      { projectId: project.id, title: 'Task C' },
      { requestId: 't' },
    );
    const session = await c.chat.createSession(setup.org.id, setup.admin.userId, {});
    await seedAssistantRef(c, setup.org.id, setup.admin.userId, session.id, task.key, task.id, yesterdayMidday());

    const res = await run(c, setup, 'recallTasks', { timeframe: 'yesterday' }, 'admin', setup.admin.userId, session.id);
    expect(res.ok).toBe(true);
    const data = res.data as { tasks: Array<{ key: string }> };
    expect(data.tasks.map((t) => t.key)).toContain(task.key);
  });

  maybe('rolling summary folds older turns into session.summary once long', async () => {
    const c = ctx!;
    c.gemini.reset();
    const setup = await setupOrgWithAdmin(c, 'Summary Org');
    const session = await c.chat.createSession(setup.org.id, setup.admin.userId, {});

    // Seed 30 short turns so the session crosses the summarize threshold.
    const rows = Array.from({ length: 30 }, (_, i) => ({
      orgId: new Types.ObjectId(setup.org.id),
      sessionId: new Types.ObjectId(session.id),
      userId: new Types.ObjectId(setup.admin.userId),
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Turn ${i} discussing the roadmap.`,
      createdAt: new Date(Date.now() - (30 - i) * 1000),
    }));
    await c.connection.collection('chatmessages').insertMany(rows);

    c.gemini.scriptJson({ summary: 'User is planning the Q3 roadmap.' });
    await c.memory.maybeSummarize(setup.org.id, setup.admin.userId, session.id, '');

    const refreshed = await c.chat.getSessionOrThrow(setup.org.id, setup.admin.userId, session.id);
    expect(refreshed.summary).toContain('roadmap');
  });

  maybe('rolling summary is a no-op for short sessions', async () => {
    const c = ctx!;
    c.gemini.reset();
    const setup = await setupOrgWithAdmin(c, 'Short Org');
    const session = await c.chat.createSession(setup.org.id, setup.admin.userId, {});

    await c.memory.maybeSummarize(setup.org.id, setup.admin.userId, session.id, '');
    expect(c.gemini.jsonCalls).toHaveLength(0);
  });
});
