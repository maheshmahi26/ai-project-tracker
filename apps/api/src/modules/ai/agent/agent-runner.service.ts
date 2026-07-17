import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { Content, Part } from '@google/genai';
import type { AiExecutionStatus } from '@ai-projectos/shared';
import { AppConfigService } from '../../../config/config.module';
import { GeminiClient, type GeminiToolCall } from '../../../infra/ai/gemini.client';
import { ToolRegistry } from '../tools/tool-registry';
import type { AgentEmit, AgentRunParams, AgentRunResult, RecordedToolCall } from './agent.types';
import { NodeTimeoutError, withTimeout } from './timeout';

/**
 * LangGraph state for a single agent run. Channels use last-value-wins reducers;
 * nodes return the *new* array/number so accumulation is explicit and inspectable.
 */
const AgentState = Annotation.Root({
  contents: Annotation<Content[]>(),
  pending: Annotation<GeminiToolCall[]>(),
  iterations: Annotation<number>(),
  toolCalls: Annotation<RecordedToolCall[]>(),
  finalText: Annotation<string>(),
  tokensIn: Annotation<number>(),
  tokensOut: Annotation<number>(),
  trace: Annotation<string[]>(),
});

type AgentStateT = typeof AgentState.State;

interface Guardrails {
  maxIterations: number;
  tokenBudget: number;
  nodeTimeoutMs: number;
  runTimeoutMs: number;
}

/**
 * Runs the agent as a state machine: `ingest → reason → (act ↔ reason)* → respond`.
 *
 * Guardrails (defense against runaway loops / cost):
 *  - **maxIterations** — cap on reason→act cycles; extra tool calls are dropped.
 *  - **tokenBudget** — stop once cumulative tokens exceed the budget.
 *  - **nodeTimeoutMs** — per-model-call timeout (aborts the request).
 *  - **runTimeoutMs** — hard stop for the whole run + LangGraph `recursionLimit`.
 *
 * The Gemini client is injected via a narrow interface, so tests bind a fake and
 * CI never makes a network call.
 */
@Injectable()
export class AgentRunner {
  private readonly logger = new Logger(AgentRunner.name);

  constructor(
    private readonly gemini: GeminiClient,
    private readonly registry: ToolRegistry,
    private readonly config: AppConfigService,
  ) {}

  private guardrails(): Guardrails {
    return {
      maxIterations: this.config.get('AI_MAX_ITERATIONS'),
      tokenBudget: this.config.get('AI_TOKEN_BUDGET'),
      nodeTimeoutMs: this.config.get('AI_NODE_TIMEOUT_MS'),
      runTimeoutMs: this.config.get('AI_RUN_TIMEOUT_MS'),
    };
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const guards = this.guardrails();
    const declarations = this.registry.functionDeclarations(params.ctx.principal.role);

    // Combine the caller's signal with an overall run-timeout signal.
    const runController = new AbortController();
    const onParentAbort = (): void => runController.abort();
    if (params.signal) {
      if (params.signal.aborted) runController.abort();
      else params.signal.addEventListener('abort', onParentAbort, { once: true });
    }
    const runTimer = setTimeout(() => runController.abort(), guards.runTimeoutMs);

    const graph = this.buildGraph(params, declarations, guards, runController.signal);

    const initial: AgentStateT = {
      contents: [...params.history, { role: 'user', parts: [{ text: params.userMessage }] }],
      pending: [],
      iterations: 0,
      toolCalls: [],
      finalText: '',
      tokensIn: 0,
      tokensOut: 0,
      trace: [],
    };

    try {
      const final = await graph.invoke(initial, {
        recursionLimit: guards.maxIterations * 2 + 6,
        signal: runController.signal,
      });
      const status: AiExecutionStatus = final.pending.length > 0 ? 'partial' : 'success';
      return this.toResult(final, status);
    } catch (error) {
      this.logger.error('Agent run failed', error as Error);
      const message =
        error instanceof NodeTimeoutError
          ? 'The request took too long and was stopped.'
          : 'Something went wrong while processing your request.';
      params.emit({ type: 'error', code: 'AGENT_FAILED', message });
      // Preserve any partial work if a tool already ran.
      return {
        text: message,
        status: 'failed',
        toolCalls: [],
        tokens: { in: 0, out: 0 },
        iterations: 0,
        graphState: 'failed',
      };
    } finally {
      clearTimeout(runTimer);
      if (params.signal) params.signal.removeEventListener('abort', onParentAbort);
    }
  }

  private toResult(final: AgentStateT, status: AiExecutionStatus): AgentRunResult {
    return {
      text: final.finalText,
      status,
      toolCalls: final.toolCalls,
      tokens: { in: final.tokensIn, out: final.tokensOut },
      iterations: final.iterations,
      graphState: final.trace.join('→'),
    };
  }

  private buildGraph(
    params: AgentRunParams,
    declarations: ReturnType<ToolRegistry['functionDeclarations']>,
    guards: Guardrails,
    signal: AbortSignal,
  ) {
    const emit: AgentEmit = params.emit;

    const ingest = async (state: AgentStateT): Promise<Partial<AgentStateT>> => {
      // Memory + RBAC context load happens here; history is already seeded.
      // RAG memory is layered in a later task.
      return { trace: [...state.trace, 'ingest'] };
    };

    const reason = async (state: AgentStateT): Promise<Partial<AgentStateT>> => {
      const turn = await withTimeout(
        (nodeSignal) =>
          this.gemini.generate({
            contents: state.contents,
            systemInstruction: params.systemInstruction,
            functionDeclarations: declarations,
            signal: nodeSignal,
            onToken: (delta) => emit({ type: 'token', delta }),
          }),
        guards.nodeTimeoutMs,
        signal,
      );

      const modelParts: Part[] = [];
      if (turn.text) modelParts.push({ text: turn.text });
      for (const call of turn.toolCalls) {
        modelParts.push({ functionCall: { id: call.callId, name: call.name, args: call.args } });
      }

      return {
        contents: [...state.contents, { role: 'model', parts: modelParts }],
        pending: turn.toolCalls,
        finalText: turn.text || state.finalText,
        tokensIn: state.tokensIn + turn.tokens.in,
        tokensOut: state.tokensOut + turn.tokens.out,
        trace: [...state.trace, 'reason'],
      };
    };

    const act = async (state: AgentStateT): Promise<Partial<AgentStateT>> => {
      const recorded: RecordedToolCall[] = [];
      const responseParts: Part[] = [];

      for (const call of state.pending) {
        emit({ type: 'tool_call', callId: call.callId, name: call.name, args: call.args });
        const start = Date.now();
        const result = await this.registry.execute(call.name, call.args, {
          ...params.ctx,
          signal,
        });
        const ms = Date.now() - start;
        emit({
          type: 'tool_result',
          callId: call.callId,
          name: call.name,
          ok: result.ok,
          data: result.data,
          error: result.error ?? null,
        });
        recorded.push({
          callId: call.callId,
          name: call.name,
          args: call.args,
          ok: result.ok,
          ms,
          data: result.data,
          error: result.error ? { code: result.error.code, message: result.error.message } : null,
        });
        responseParts.push({
          functionResponse: {
            id: call.callId,
            name: call.name,
            response: result.ok ? { result: result.data ?? null } : { error: result.error },
          },
        });
      }

      return {
        contents: [...state.contents, { role: 'user', parts: responseParts }],
        toolCalls: [...state.toolCalls, ...recorded],
        pending: [],
        iterations: state.iterations + 1,
        trace: [...state.trace, 'act'],
      };
    };

    const respond = async (state: AgentStateT): Promise<Partial<AgentStateT>> => {
      const finalText =
        state.finalText ||
        (state.pending.length > 0
          ? 'I reached my step limit before finishing. Here is what I managed to do.'
          : '');
      return { finalText, trace: [...state.trace, 'respond'] };
    };

    const routeAfterReason = (state: AgentStateT): 'act' | 'respond' => {
      if (state.pending.length === 0) return 'respond';
      if (state.iterations >= guards.maxIterations) return 'respond';
      if (state.tokensIn + state.tokensOut >= guards.tokenBudget) return 'respond';
      return 'act';
    };

    return new StateGraph(AgentState)
      .addNode('ingest', ingest)
      .addNode('reason', reason)
      .addNode('act', act)
      .addNode('respond', respond)
      .addEdge(START, 'ingest')
      .addEdge('ingest', 'reason')
      .addConditionalEdges('reason', routeAfterReason, { act: 'act', respond: 'respond' })
      .addEdge('act', 'reason')
      .addEdge('respond', END)
      .compile();
  }
}
