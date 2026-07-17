import {
  GeminiClient,
  type GeminiGenerateParams,
  type GeminiJsonParams,
  type GeminiJsonResult,
  type GeminiTurn,
} from '../infra/ai/gemini.client';

export interface ScriptedTurn {
  text?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  tokens?: { in: number; out: number };
}

/**
 * Deterministic, offline Gemini stand-in for tests. Scripts a queue of turns and
 * (optionally) a "loop" turn returned forever once the queue drains — used to
 * prove the iteration guardrail without ever hitting the network.
 */
export class FakeGeminiClient extends GeminiClient {
  readonly model = 'gemini-test';
  readonly calls: GeminiGenerateParams[] = [];
  readonly jsonCalls: GeminiJsonParams[] = [];
  private readonly queue: ScriptedTurn[] = [];
  private readonly jsonQueue: unknown[] = [];
  private loopTurn: ScriptedTurn | null = null;
  private configured = true;

  get isConfigured(): boolean {
    return this.configured;
  }

  setConfigured(value: boolean): void {
    this.configured = value;
  }

  /** Queue turns returned in order by successive `generate` calls. */
  script(...turns: ScriptedTurn[]): this {
    this.queue.push(...turns);
    return this;
  }

  /** After the queue drains, return this turn forever (for loop/guardrail tests). */
  loop(turn: ScriptedTurn): this {
    this.loopTurn = turn;
    return this;
  }

  /** Queue JSON objects returned in order by successive `generateJson` calls. */
  scriptJson(...objects: unknown[]): this {
    this.jsonQueue.push(...objects);
    return this;
  }

  /** Clears scripted turns + recorded calls (call between tests sharing a module). */
  reset(): void {
    this.queue.length = 0;
    this.calls.length = 0;
    this.jsonQueue.length = 0;
    this.jsonCalls.length = 0;
    this.loopTurn = null;
  }

  async generate(params: GeminiGenerateParams): Promise<GeminiTurn> {
    this.calls.push(params);
    const turn = this.queue.shift() ?? this.loopTurn ?? { text: '' };
    if (turn.text) {
      for (const word of turn.text.split(' ')) params.onToken?.(`${word} `);
    }
    const idx = this.calls.length;
    const toolCalls = (turn.toolCalls ?? []).map((call, i) => ({
      callId: `call_${idx}_${i}`,
      name: call.name,
      args: call.args,
    }));
    return { text: turn.text ?? '', toolCalls, tokens: turn.tokens ?? { in: 10, out: 5 } };
  }

  async generateJson(params: GeminiJsonParams): Promise<GeminiJsonResult> {
    this.jsonCalls.push(params);
    const json = this.jsonQueue.shift() ?? {};
    return { json, raw: JSON.stringify(json), tokens: { in: 20, out: 40 } };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3]);
  }
}
