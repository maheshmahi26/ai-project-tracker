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
}

/** The distilled result of one Gemini turn (text + any tool calls + usage). */
export interface GeminiTurn {
  text: string;
  toolCalls: GeminiToolCall[];
  tokens: { in: number; out: number };
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

  async generate(params: GeminiGenerateParams): Promise<GeminiTurn> {
    if (!this.ai) throw new Error('GEMINI_API_KEY is not configured');

    const tools = params.functionDeclarations?.length
      ? [{ functionDeclarations: params.functionDeclarations }]
      : undefined;

    const stream = await this.ai.models.generateContentStream({
      model: this.model,
      contents: params.contents,
      config: {
        systemInstruction: params.systemInstruction,
        abortSignal: params.signal,
        temperature: 0.2,
        ...(tools
          ? {
              tools,
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            }
          : {}),
      },
    });

    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let callSeq = 0;
    const toolCalls: GeminiToolCall[] = [];

    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        params.onToken?.(delta);
      }
      const calls = chunk.functionCalls;
      if (calls?.length) {
        for (const call of calls) {
          toolCalls.push({
            callId: call.id ?? `call_${callSeq++}`,
            name: call.name ?? 'unknown',
            args: (call.args ?? {}) as Record<string, unknown>,
          });
        }
      }
      const usage = chunk.usageMetadata;
      if (usage) {
        tokensIn = usage.promptTokenCount ?? tokensIn;
        tokensOut = usage.candidatesTokenCount ?? tokensOut;
      }
    }

    return { text, toolCalls, tokens: { in: tokensIn, out: tokensOut } };
  }

  async generateJson(params: GeminiJsonParams): Promise<GeminiJsonResult> {
    if (!this.ai) throw new Error('GEMINI_API_KEY is not configured');

    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
      config: {
        systemInstruction: params.systemInstruction,
        abortSignal: params.signal,
        temperature: 0.3,
        responseMimeType: 'application/json',
        ...(params.responseSchema ? { responseJsonSchema: params.responseSchema } : {}),
      },
    });

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
    const res = await this.ai.models.embedContent({
      model: this.embedModel,
      contents: texts,
      config: { outputDimensionality: this.embedDim },
    });
    return (res.embeddings ?? []).map((e) => e.values ?? []);
  }
}
