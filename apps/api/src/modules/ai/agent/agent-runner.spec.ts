import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ChatSseEvent } from '@ai-projectos/shared';
import type { AppConfigService } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import {
  GeminiClient,
  type GeminiGenerateParams,
  type GeminiTurn,
} from '../../../infra/ai/gemini.client';
import { FakeGeminiClient } from '../../../test/fake-gemini';
import { ToolRegistry } from '../tools/tool-registry';
import type { AiTool } from '../tools/ai-tool';
import { AgentRunner } from './agent-runner.service';
import type { AgentRunParams } from './agent.types';

const guards: Partial<Env> = {
  AI_MAX_ITERATIONS: 3,
  AI_TOKEN_BUDGET: 24000,
  AI_NODE_TIMEOUT_MS: 1000,
  AI_RUN_TIMEOUT_MS: 5000,
};

const config = {
  get: <K extends keyof Env>(k: K): Env[K] => guards[k] as Env[K],
} as unknown as AppConfigService;

const pingTool: AiTool = {
  name: 'ping',
  description: 'ping',
  requiredPermission: 'read',
  inputSchema: z.object({}),
  outputSchema: z.object({ pong: z.boolean() }),
  handler: async () => ({ pong: true }),
};

function makeRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(pingTool);
  return r;
}

function runParams(overrides: Partial<AgentRunParams>, events: ChatSseEvent[]): AgentRunParams {
  return {
    ctx: { principal: { userId: 'u', orgId: 'o', role: 'admin' }, requestId: 'r' },
    systemInstruction: 'sys',
    history: [],
    userMessage: 'hello',
    emit: (e) => events.push(e),
    ...overrides,
  };
}

describe('AgentRunner', () => {
  it('runs the ingest→reason→act→reason→respond loop for a tool call', async () => {
    const gemini = new FakeGeminiClient().script(
      { toolCalls: [{ name: 'ping', args: {} }] },
      { text: 'all done' },
    );
    const runner = new AgentRunner(gemini, makeRegistry(), config);
    const events: ChatSseEvent[] = [];

    const result = await runner.run(runParams({}, events));

    expect(result.status).toBe('success');
    expect(result.iterations).toBe(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ name: 'ping', ok: true });
    expect(result.text).toBe('all done');
    expect(result.graphState).toBe('ingest→reason→act→reason→respond');

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('token');
  });

  it('stops at the iteration guardrail and reports partial', async () => {
    const gemini = new FakeGeminiClient().loop({ toolCalls: [{ name: 'ping', args: {} }] });
    const runner = new AgentRunner(gemini, makeRegistry(), config);
    const events: ChatSseEvent[] = [];

    const result = await runner.run(runParams({}, events));

    expect(result.status).toBe('partial');
    expect(result.iterations).toBe(3);
    expect(result.toolCalls).toHaveLength(3);
  });

  it('stops when the token budget is exceeded before acting', async () => {
    const gemini = new FakeGeminiClient().script({
      toolCalls: [{ name: 'ping', args: {} }],
      tokens: { in: 20000, out: 5000 },
    });
    const runner = new AgentRunner(gemini, makeRegistry(), config);
    const events: ChatSseEvent[] = [];

    const result = await runner.run(runParams({}, events));

    expect(result.status).toBe('partial');
    expect(result.iterations).toBe(0);
    expect(result.toolCalls).toHaveLength(0);
  });

  it('fails gracefully when the model throws', async () => {
    class ThrowingClient extends GeminiClient {
      readonly model = 'gemini-test';
      get isConfigured(): boolean {
        return true;
      }
      generate(_params: GeminiGenerateParams): Promise<GeminiTurn> {
        return Promise.reject(new Error('model exploded'));
      }
      embed(): Promise<number[][]> {
        return Promise.resolve([]);
      }
    }
    const runner = new AgentRunner(new ThrowingClient(), makeRegistry(), config);
    const events: ChatSseEvent[] = [];

    const result = await runner.run(runParams({}, events));

    expect(result.status).toBe('failed');
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});
