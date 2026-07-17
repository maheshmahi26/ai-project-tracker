import { Injectable, Logger } from '@nestjs/common';
import type { FunctionDeclaration } from '@google/genai';
import { can, type AiToolInfoDTO, type Role } from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { AiTool, ToolContext, ToolExecutionResult } from './ai-tool';
import { zodToJsonSchema } from './zod-to-gemini';

/**
 * Central registry of AI tools. Owns three responsibilities:
 *  1. Expose Gemini function declarations (only the ones a role may use).
 *  2. Enforce permission + argument validation before any handler runs.
 *  3. Convert thrown domain errors into structured, model-readable results.
 *
 * The agent talks only to this registry — it can never reach a service directly,
 * so RBAC and auditing cannot be bypassed.
 */
@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools = new Map<string, AiTool>();

  register(tool: AiTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): AiTool | undefined {
    return this.tools.get(name);
  }

  list(): AiTool[] {
    return [...this.tools.values()];
  }

  /** Tools the given role is allowed to invoke (used both for LLM + introspection). */
  private allowedFor(role: Role): AiTool[] {
    return this.list().filter((tool) => can(role, tool.requiredPermission));
  }

  /** Gemini function declarations scoped to what the role may actually call. */
  functionDeclarations(role: Role): FunctionDeclaration[] {
    return this.allowedFor(role).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: zodToJsonSchema(tool.inputSchema),
    }));
  }

  /** Registry introspection for `GET /ai/tools` (scoped to the caller's role). */
  toInfo(role: Role): AiToolInfoDTO[] {
    return this.allowedFor(role).map((tool) => ({
      name: tool.name,
      description: tool.description,
      requiredPermission: tool.requiredPermission,
      inputSchema: zodToJsonSchema(tool.inputSchema) as Record<string, unknown>,
      destructive: tool.destructive ?? false,
    }));
  }

  /**
   * Validate → authorize → run → validate output. Never throws: the agent must
   * be able to read the failure and self-correct.
   */
  async execute(
    name: string,
    rawArgs: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: { code: 'UNKNOWN_TOOL', message: `No tool named "${name}"` } };
    }

    if (!can(ctx.principal.role, tool.requiredPermission)) {
      return {
        ok: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: `Role "${ctx.principal.role}" lacks "${tool.requiredPermission}" for ${name}`,
        },
      };
    }

    const parsedInput = tool.inputSchema.safeParse(rawArgs);
    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Arguments failed validation',
          details: parsedInput.error.issues.map((i) => ({
            path: i.path.join('.'),
            issue: i.message,
          })),
        },
      };
    }

    try {
      const output = await tool.handler(parsedInput.data, ctx);
      const parsedOutput = tool.outputSchema.safeParse(output);
      if (!parsedOutput.success) {
        this.logger.error(`Tool "${name}" returned an output that failed its schema`);
        return {
          ok: false,
          error: { code: 'OUTPUT_INVALID', message: 'Tool produced an invalid result' },
        };
      }
      return { ok: true, data: parsedOutput.data };
    } catch (error) {
      if (error instanceof AppException) {
        return {
          ok: false,
          error: { code: error.code, message: error.message, details: error.details },
        };
      }
      this.logger.error(`Tool "${name}" threw`, error as Error);
      return { ok: false, error: { code: 'INTERNAL', message: 'Tool execution failed' } };
    }
  }
}
