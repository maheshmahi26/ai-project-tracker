import { z } from 'zod';
import type { CreateLabelInput } from '@ai-projectos/shared';
import type { CommentsService } from '../../comments/comments.service';
import type { LabelsService } from '../../labels/labels.service';
import type { AiTool } from './ai-tool';
import type { ReferenceResolver } from './reference-resolver';
import { aiHexColor, aiMeta, labelSummarySchema, taskUrl, toLabelSummary } from './tool-support';

/** Wrap a plain string into the minimal TipTap/ProseMirror document the UI stores. */
function textToDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
}

/** Collaboration action tools: comments and labels. */
export function createCollabTools(
  comments: CommentsService,
  labels: LabelsService,
  resolver: ReferenceResolver,
): AiTool[] {
  const addComment: AiTool<z.infer<typeof addCommentInput>, z.infer<typeof addCommentOutput>> = {
    name: 'addComment',
    description: 'Add a plain-text comment to a task. Reference the task by key or id.',
    requiredPermission: 'task:update',
    inputSchema: addCommentInput,
    outputSchema: addCommentOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const taskId = await resolver.taskId(orgId, input.task);
      const created = await comments.create(
        orgId,
        ctx.principal.userId,
        taskId,
        { body: textToDoc(input.text) },
        aiMeta(ctx),
      );
      return { id: created.id, taskId, url: taskUrl(taskId) };
    },
  };

  const createLabel: AiTool<z.infer<typeof createLabelInput>, z.infer<typeof labelSummarySchema>> = {
    name: 'createLabel',
    description:
      'Create a label. Scope it to a project (by key/name/id) or leave it org-wide by omitting project.',
    requiredPermission: 'project:update',
    inputSchema: createLabelInput,
    outputSchema: labelSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = input.project ? await resolver.projectId(orgId, input.project) : undefined;
      const dto: CreateLabelInput = { name: input.name, color: input.color, projectId };
      const created = await labels.create(orgId, ctx.principal.userId, dto, aiMeta(ctx));
      return toLabelSummary(created);
    },
  };

  return [addComment, createLabel] as unknown as AiTool[];
}

// ── Input schemas ─────────────────────────────────────────────────────────────

const addCommentInput = z.object({
  task: z.string().describe('Task key or id.'),
  text: z.string().trim().min(1).max(10000),
});

const addCommentOutput = z.object({ id: z.string(), taskId: z.string(), url: z.string() });

const createLabelInput = z.object({
  name: z.string().trim().min(1).max(40),
  color: aiHexColor,
  project: z.string().optional().describe('Project key, name, or id (omit for org-wide label).'),
});
