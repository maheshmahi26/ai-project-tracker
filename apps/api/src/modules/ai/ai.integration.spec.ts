import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatSseEvent } from '@ai-projectos/shared';
import { createTestContext, type TestContext } from '../../test/integration-module';
import { setupOrgWithAdmin, type OrgWithAdmin } from '../../test/factories';

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

const maybe = (name: string, fn: () => Promise<void>): void => {
  it(name, async () => {
    if (!ctx) return; // Mongo unavailable → skip.
    await fn();
  });
};

async function collectReply(
  c: TestContext,
  setup: OrgWithAdmin,
  content: string,
): Promise<{ events: ChatSseEvent[]; sessionId: string }> {
  const session = await c.chat.createSession(setup.org.id, setup.admin.userId, {});
  const events: ChatSseEvent[] = [];
  await c.agent.streamReply({
    session,
    orgId: setup.org.id,
    userId: setup.admin.userId,
    role: 'admin',
    content,
    requestId: 'req-int',
    emit: (e) => events.push(e),
  });
  return { events, sessionId: session.id };
}

describe('AI chat + agent (integration)', () => {
  beforeEach(() => {
    if (ctx) ctx.gemini.reset();
  });

  maybe('streams a tool call end-to-end and persists the run', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'AI Org');
    c.gemini
      .script({ toolCalls: [{ name: 'whoAmI', args: {} }] }, { text: 'You are an admin.' })
      .loop({ text: '' });

    const { events, sessionId } = await collectReply(c, setup, 'who am I?');

    const toolCall = events.find((e) => e.type === 'tool_call');
    const toolResult = events.find((e) => e.type === 'tool_result');
    const done = events.find((e) => e.type === 'done');
    expect(toolCall).toMatchObject({ name: 'whoAmI' });
    expect(toolResult).toMatchObject({ name: 'whoAmI', ok: true });
    expect(done).toMatchObject({ status: 'success' });

    // Assistant message persisted with tool cards.
    const messages = await c.chat.listMessages(setup.org.id, setup.admin.userId, sessionId, {
      limit: 50,
    });
    expect(messages.items).toHaveLength(2);
    const assistant = messages.items.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('You are an admin.');
    expect(assistant?.toolCalls?.[0]?.name).toBe('whoAmI');
    expect(assistant?.toolResults?.[0]?.ok).toBe(true);

    // AIExecution trace persisted.
    const executionId = done && done.type === 'done' ? done.executionId : '';
    const execution = await c.chat.getExecutionOrThrow(setup.org.id, executionId);
    expect(execution.status).toBe('success');
    expect(execution.toolCalls[0]).toMatchObject({ name: 'whoAmI', ok: true });
    expect(execution.graphState).toContain('act');
    expect(execution.model).toBe('gemini-test');

    // Session title derived + counters bumped.
    const session = await c.chat.getSessionOrThrow(setup.org.id, setup.admin.userId, sessionId);
    expect(session.title).toBe('who am I?');
    expect(session.messageCount).toBe(2);
  });

  maybe('writes an audit row with source "ai"', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Audit Org');
    c.gemini.script({ text: 'Hi there.' }).loop({ text: '' });

    await collectReply(c, setup, 'hello');

    const audits = await c.audit.list(setup.org.id, { limit: 25 });
    const aiAudit = audits.items.find((a) => a.action === 'ai.chat.respond');
    expect(aiAudit).toBeDefined();
    expect(aiAudit?.source).toBe('ai');
    expect(aiAudit?.actorType).toBe('ai');
  });

  maybe('enforces tenant isolation on executions + sessions', async () => {
    const c = ctx!;
    const a = await setupOrgWithAdmin(c, 'Org A');
    const b = await setupOrgWithAdmin(c, 'Org B');
    c.gemini.script({ text: 'ok' }).loop({ text: '' });

    const { events } = await collectReply(c, a, 'ping');
    const done = events.find((e) => e.type === 'done');
    const executionId = done && done.type === 'done' ? done.executionId : '';

    await expect(c.chat.getExecutionOrThrow(b.org.id, executionId)).rejects.toThrow(/not found/i);
  });

  maybe('exposes role-scoped tool introspection', async () => {
    const c = ctx!;
    expect(c.toolRegistry.toInfo('viewer').map((t) => t.name)).toContain('whoAmI');
    expect(c.toolRegistry.functionDeclarations('viewer').map((d) => d.name)).toContain('whoAmI');
  });

  maybe('rejects reading another user session messages', async () => {
    const c = ctx!;
    const setup = await setupOrgWithAdmin(c, 'Private Org');
    const session = await c.chat.createSession(setup.org.id, setup.admin.userId, {});
    await expect(
      c.chat.listMessages(setup.org.id, 'deadbeefdeadbeefdeadbeef', session.id, { limit: 10 }),
    ).rejects.toThrow(/not found/i);
  });
});
