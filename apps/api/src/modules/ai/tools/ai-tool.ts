import type { ZodType } from 'zod';
import type { Permission, Role } from '@ai-projectos/shared';

/** The acting identity for a tool run — mirrors the RBAC context of a UI request. */
export interface ToolPrincipal {
  userId: string;
  orgId: string;
  role: Role;
}

/** Ambient context handed to every tool handler (never comes from the LLM). */
export interface ToolContext {
  principal: ToolPrincipal;
  requestId: string;
  sessionId?: string;
  /** Aborts long-running handlers when the run times out or the client leaves. */
  signal?: AbortSignal;
}

/**
 * MCP-inspired tool contract. Each tool is a thin wrapper over an existing
 * Application use case (the same one the UI calls) so validation, authorization,
 * and auditing stay identical. See specs/05-ai-agent.md.
 */
export interface AiTool<I = unknown, O = unknown> {
  /** Stable identifier the model emits as a function call, e.g. `createTask`. */
  name: string;
  /** Natural-language purpose fed to the model to decide when to call it. */
  description: string;
  /** RBAC permission the principal must hold; enforced before the handler runs. */
  requiredPermission: Permission;
  /** Destructive tools require explicit user confirmation before committing. */
  destructive?: boolean;
  /** Validated (Zod) before the handler; also converted to a Gemini declaration. */
  inputSchema: ZodType<I>;
  /** Validated after the handler so results are safe to render as UI. */
  outputSchema: ZodType<O>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

/** Structured, model-readable result of a tool invocation (never throws to the agent). */
export interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}
