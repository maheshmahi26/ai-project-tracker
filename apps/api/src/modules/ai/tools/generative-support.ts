import type { z, ZodTypeAny } from 'zod';
import { GENERATIVE_SYSTEM_PROMPT, type TaskDTO } from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { GeminiClient } from '../../../infra/ai/gemini.client';
import type { ToolContext } from './ai-tool';
import { zodToJsonSchema } from './zod-to-gemini';

/**
 * Run one JSON-mode Gemini generation and validate it against `schema`. The
 * schema is also handed to the model as `responseJsonSchema` so it constrains
 * generation up-front; we still re-validate on the way out so a tool NEVER
 * returns unvalidated model output. Validation failures surface as a readable
 * business-rule error the agent can retry or report.
 */
export async function generateStructured<S extends ZodTypeAny>(
  gemini: GeminiClient,
  schema: S,
  prompt: string,
  ctx: ToolContext,
): Promise<z.infer<S>> {
  const res = await gemini.generateJson({
    systemInstruction: GENERATIVE_SYSTEM_PROMPT,
    prompt,
    responseSchema: zodToJsonSchema(schema),
    signal: ctx.signal,
  });
  const parsed = schema.safeParse(res.json);
  if (!parsed.success) {
    throw AppException.businessRule(
      'The model returned data that did not match the expected schema.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), issue: i.message })),
    );
  }
  return parsed.data;
}

/** Compact one task into a single context line for prompts. */
export function taskLine(t: TaskDTO): string {
  const pts = t.storyPoints != null ? `, ${t.storyPoints}sp` : '';
  return `- [${t.key}] ${t.title} (${t.status}, ${t.priority}${pts})`;
}

export function taskLines(tasks: TaskDTO[]): string {
  return tasks.length ? tasks.map(taskLine).join('\n') : '(none)';
}
