import { z } from 'zod';
import {
  taskPrioritySchema,
  taskStatusSchema,
  sprintStatusSchema,
  type LabelDTO,
  type ProjectDTO,
  type SprintDTO,
  type TaskDTO,
} from '@ai-projectos/shared';
import type { RequestMeta } from '../../auth/auth.service';
import type { ToolContext } from './ai-tool';

/**
 * Build the {@link RequestMeta} for an AI-initiated write. Tagging `source`/
 * `actorType` as `ai` makes every mutation the agent performs show up in audit
 * logs and activity feeds as the assistant's work, not the user's.
 */
export function aiMeta(ctx: ToolContext): RequestMeta {
  return { requestId: ctx.requestId, source: 'ai', actorType: 'ai' };
}

/** Deep links the chat UI can render so the user can jump straight to the record. */
export const taskUrl = (id: string): string => `/tasks/${id}`;
export const projectUrl = (id: string): string => `/projects/${id}`;

// ── Reusable, LLM-forgiving field schemas ────────────────────────────────────
export const aiDateField = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .describe('ISO date (YYYY-MM-DD) or full ISO-8601 timestamp');
export const aiHexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Hex color like #4f46e5');
export const aiStoryPoints = z.number().int().min(0).max(100);

// ── Compact, model-friendly result shapes ────────────────────────────────────
// Tools return purpose-built summaries (not the full DTO) so the model has just
// enough to narrate the outcome and link to it.

export const taskSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  assigneeId: z.string().nullable(),
  sprintId: z.string().nullable(),
  storyPoints: z.number().nullable(),
  projectId: z.string(),
  url: z.string(),
});
export type TaskSummary = z.infer<typeof taskSummarySchema>;

export function toTaskSummary(t: TaskDTO): TaskSummary {
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId ?? null,
    sprintId: t.sprintId ?? null,
    storyPoints: t.storyPoints ?? null,
    projectId: t.projectId,
    url: taskUrl(t.id),
  };
}

export const projectSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  status: z.enum(['active', 'archived']),
  leadId: z.string().nullable(),
  url: z.string(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export function toProjectSummary(p: ProjectDTO): ProjectSummary {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    status: p.status,
    leadId: p.leadId ?? null,
    url: projectUrl(p.id),
  };
}

export const sprintSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: sprintStatusSchema,
  projectId: z.string(),
  committedPoints: z.number(),
  completedPoints: z.number(),
});
export type SprintSummary = z.infer<typeof sprintSummarySchema>;

export function toSprintSummary(s: SprintDTO): SprintSummary {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    projectId: s.projectId,
    committedPoints: s.committedPoints,
    completedPoints: s.completedPoints,
  };
}

export const labelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  projectId: z.string().nullable(),
});
export function toLabelSummary(l: LabelDTO): z.infer<typeof labelSummarySchema> {
  return { id: l.id, name: l.name, color: l.color, projectId: l.projectId ?? null };
}
