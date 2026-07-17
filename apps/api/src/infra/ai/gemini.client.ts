import { Injectable, Logger } from '@nestjs/common';
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
} from '@google/genai';
import { AppConfigService } from '../../config/config.module';

/** A model-requested tool invocation surfaced by a single generation turn. */
export interface GeminiToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  /**
   * Opaque signature Gemini 3 (thinking) models attach to a functionCall part.
   * It MUST be echoed back on that part when the tool result is sent, or the
   * next request is rejected with `INVALID_ARGUMENT` (missing thought_signature).
   */
  thoughtSignature?: string;
}

/** The distilled result of one Gemini turn (text + any tool calls + usage). */
export interface GeminiTurn {
  text: string;
  toolCalls: GeminiToolCall[];
  tokens: { in: number; out: number };
  /** Signature attached to the model's text part (Gemini 3 thinking models). */
  textThoughtSignature?: string;
}

export interface GeminiGenerateParams {
  /** Full conversation so far, in Gemini `Content` shape. */
  contents: Content[];
  systemInstruction?: string;
  /** Tool schemas the model may call this turn. */
  functionDeclarations?: FunctionDeclaration[];
  /** Aborts the streamed request (guardrail timeouts / client disconnect). */
  signal?: AbortSignal;
  /** Invoked for every streamed text delta so callers can forward SSE tokens. */
  onToken?: (delta: string) => void;
}

/** Single-shot JSON-mode generation used by the generative tools (TASK-18). */
export interface GeminiJsonParams {
  systemInstruction?: string;
  prompt: string;
  /** JSON Schema constraining the model's response (Gemini `responseJsonSchema`). */
  responseSchema?: unknown;
  signal?: AbortSignal;
}

export interface GeminiJsonResult {
  /** Parsed JSON object (already `JSON.parse`d from the model's text). */
  json: unknown;
  raw: string;
  tokens: { in: number; out: number };
}

/**
 * DI token for the Gemini LLM. The concrete {@link GoogleGeminiClient} talks to
 * Google's API; tests bind a fake so CI never makes a network call. The agent
 * only ever depends on this narrow contract, not on the SDK.
 */
export abstract class GeminiClient {
  abstract readonly model: string;
  abstract get isConfigured(): boolean;
  abstract generate(params: GeminiGenerateParams): Promise<GeminiTurn>;
  /** Single-shot generation constrained to JSON output (generative tools). */
  abstract generateJson(params: GeminiJsonParams): Promise<GeminiJsonResult>;
  /** Batch text → embedding vectors (used by RAG in a later task). */
  abstract embed(texts: string[]): Promise<number[][]>;
}

/** Google AI SDK (`@google/genai`) implementation with streaming + function calling. */
@Injectable()
export class GoogleGeminiClient extends GeminiClient {
  private readonly logger = new Logger(GoogleGeminiClient.name);
  private readonly ai: GoogleGenAI | null;
  readonly model: string;
  private readonly embedModel: string;
  private readonly embedDim: number;

  constructor(config: AppConfigService) {
    super();
    const apiKey = config.get('GEMINI_API_KEY');
    this.model = config.get('GEMINI_MODEL');
    this.embedModel = config.get('GEMINI_EMBED_MODEL');
    this.embedDim = config.get('GEMINI_EMBED_DIM');
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    if (!this.ai) {
      this.logger.warn('GEMINI_API_KEY is not set — AI endpoints will be unavailable.');
    }
  }

  get isConfigured(): boolean {
    return this.ai !== null;
  }

  /** Max *additional* attempts after the first for transient upstream errors. */
  private static readonly MAX_RETRIES = 2;

  /**
   * Transient = worth retrying: rate limits (429) and upstream unavailability
   * (500/503) that Gemini surfaces under load — common on the free tier and for
   * preview models. Permanent errors (bad key, unknown model) are not retried.
   */
  private isTransient(error: unknown): boolean {
    const status = (error as { status?: unknown })?.status;
    if (typeof status === 'number' && [429, 500, 503].includes(status)) return true;
    const text = `${String(status ?? '')} ${(error as Error)?.message ?? ''}`.toUpperCase();
    return /\b(429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|OVERLOADED|HIGH DEMAND|TRY AGAIN/.test(
      text,
    );
  }

  /** Exponential backoff with jitter, capped so we stay within node timeouts. */
  private backoffMs(attempt: number): number {
    return Math.min(4000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('aborted'));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  }

  /** Retry wrapper for non-streaming calls (safe to replay in full). */
  private async withRetry<T>(op: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await op();
      } catch (error) {
        if (
          attempt > GoogleGeminiClient.MAX_RETRIES ||
          signal?.aborted ||
          !this.isTransient(error)
        ) {
          throw error;
        }
        this.logger.warn(
          `Gemini call transient error (attempt ${attempt}), retrying: ${(error as Error).message}`,
        );
        await this.delay(this.backoffMs(attempt), signal);
      }
    }
  }

  async generate(params: GeminiGenerateParams): Promise<GeminiTurn> {
    if (!this.ai) throw new Error('GEMINI_API_KEY is not configured');
    const ai = this.ai;

    const tools = params.functionDeclarations?.length
      ? [{ functionDeclarations: params.functionDeclarations }]
      : undefined;
    const config = {
      systemInstruction: params.systemInstruction,
      abortSignal: params.signal,
      temperature: 0.2,
      ...(tools
        ? {
            tools,
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
          }
        : {}),
    };

    // Retry transient upstream errors (429/503), but only while no streamed text
    // has been forwarded yet — otherwise the client would see duplicated tokens.
    for (let attempt = 1; ; attempt++) {
      let emittedAny = false;
      try {
        const stream = await ai.models.generateContentStream({
          model: this.model,
          contents: params.contents,
          config,
        });

        let text = '';
        let tokensIn = 0;
        let tokensOut = 0;
        let callSeq = 0;
        let textThoughtSignature: string | undefined;
        const toolCalls: GeminiToolCall[] = [];

        for await (const chunk of stream) {
          // Iterate parts directly (not the `functionCalls` getter) so we can
          // preserve each part's `thoughtSignature`, which Gemini 3 requires on
          // replay. Skip "thought" parts — those are internal reasoning.
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.thought) continue;
            if (typeof part.text === 'string' && part.text.length > 0) {
              text += part.text;
              emittedAny = true;
              params.onToken?.(part.text);
              if (part.thoughtSignature) textThoughtSignature = part.thoughtSignature;
            }
            if (part.functionCall) {
              toolCalls.push({
                callId: part.functionCall.id ?? `call_${callSeq++}`,
                name: part.functionCall.name ?? 'unknown',
                args: (part.functionCall.args ?? {}) as Record<string, unknown>,
                thoughtSignature: part.thoughtSignature,
              });
            }
          }
          const usage = chunk.usageMetadata;
          if (usage) {
            tokensIn = usage.promptTokenCount ?? tokensIn;
            tokensOut = usage.candidatesTokenCount ?? tokensOut;
          }
        }

        return { text, toolCalls, tokens: { in: tokensIn, out: tokensOut }, textThoughtSignature };
      } catch (error) {
        if (
          emittedAny ||
          attempt > GoogleGeminiClient.MAX_RETRIES ||
          params.signal?.aborted ||
          !this.isTransient(error)
        ) {
          throw error;
        }
        this.logger.warn(
          `Gemini generate transient error (attempt ${attempt}), retrying: ${(error as Error).message}`,
        );
        await this.delay(this.backoffMs(attempt), params.signal);
      }
    }
  }

  async generateJson(params: GeminiJsonParams): Promise<GeminiJsonResult> {
    if (!this.ai) throw new Error('GEMINI_API_KEY is not configured');
    const ai = this.ai;

    const res = await this.withRetry(
      () =>
        ai.models.generateContent({
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
          config: {
            systemInstruction: params.systemInstruction,
            abortSignal: params.signal,
            temperature: 0.3,
            responseMimeType: 'application/json',
            ...(params.responseSchema ? { responseJsonSchema: params.responseSchema } : {}),
          },
        }),
      params.signal,
    );

    const raw = res.text ?? '';
    const usage = res.usageMetadata;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error('Model did not return valid JSON');
    }
    return {
      json,
      raw,
      tokens: { in: usage?.promptTokenCount ?? 0, out: usage?.candidatesTokenCount ?? 0 },
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.ai) throw new Error('GEMINI_API_KEY is not configured');
    if (texts.length === 0) return [];
    const ai = this.ai;
    const res = await this.withRetry(() =>
      ai.models.embedContent({
        model: this.embedModel,
        contents: texts,
        config: { outputDimensionality: this.embedDim },
      }),
    );
    return (res.embeddings ?? []).map((e) => e.values ?? []);
  }
}
