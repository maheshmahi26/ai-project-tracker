import { z } from 'zod';
import { Types } from 'mongoose';
import {
  documentTaskPlanSchema,
  groundedAnswerSchema,
  knowledgeSearchResultSchema,
  proposedTaskSchema,
} from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { DocumentsRepository } from '../../documents/documents.repository';
import type { RagService } from '../../documents/rag/rag.service';
import type { TasksService } from '../../tasks/tasks.service';
import type { AiTool } from './ai-tool';
import type { ReferenceResolver } from './reference-resolver';
import { aiMeta, taskSummarySchema, toTaskSummary } from './tool-support';

export interface RagDeps {
  rag: RagService;
  documents: DocumentsRepository;
  tasks: TasksService;
  resolver: ReferenceResolver;
}

const isObjectId = (value: string): boolean => Types.ObjectId.isValid(value) && value.length === 24;

/**
 * RAG tools. Retrieval + grounded Q&A are read-only; the doc→tasks flow is
 * propose (`generateTasksFromDocument`) → confirm-gated commit
 * (`applyGeneratedTasks`) so the user reviews before anything is written. All
 * reads/writes are org-scoped and go through the same services as the UI.
 */
export function createRagTools(deps: RagDeps): AiTool[] {
  const { rag, documents, tasks, resolver } = deps;

  /** Resolve a document reference (id or title) to its id, org-scoped. */
  const resolveDocument = async (orgId: string, ref: string): Promise<string> => {
    const value = ref.trim();
    if (isObjectId(value)) {
      const byId = await documents.findById(orgId, value);
      if (byId) return byId._id.toString();
    }
    const rows = await documents.list({ orgId, limit: 100 });
    const lower = value.toLowerCase();
    const exact = rows.filter((d) => d.title.toLowerCase() === lower);
    const pool = exact.length > 0 ? exact : rows.filter((d) => d.title.toLowerCase().includes(lower));
    if (pool.length === 1) return pool[0]!._id.toString();
    if (pool.length === 0) throw AppException.notFound(`No document matches "${value}"`);
    throw AppException.validation(
      `Multiple documents match "${value}". Ask the user which one they mean.`,
      pool.map((d) => ({ path: d._id.toString(), issue: d.title })),
    );
  };

  const searchKnowledge: AiTool<z.infer<typeof searchInput>, z.infer<typeof knowledgeSearchResultSchema>> = {
    name: 'searchKnowledge',
    description:
      'Semantic search over the org\'s uploaded documents. Returns the most relevant chunks with ' +
      'citations (documentTitle + chunkIndex). Use this to ground answers in the user\'s own documents.',
    requiredPermission: 'read',
    inputSchema: searchInput,
    outputSchema: knowledgeSearchResultSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = input.project ? await resolver.projectId(orgId, input.project) : undefined;
      return rag.search(orgId, {
        query: input.query,
        projectId,
        limit: input.limit ?? 6,
        signal: ctx.signal,
      });
    },
  };

  const askDocuments: AiTool<z.infer<typeof askInput>, z.infer<typeof groundedAnswerSchema>> = {
    name: 'askDocuments',
    description:
      'Answer a question grounded in the uploaded documents. Retrieves relevant chunks, then returns a ' +
      'concise answer WITH citations. Prefer this over guessing when the user asks about their docs/PRDs.',
    requiredPermission: 'read',
    inputSchema: askInput,
    outputSchema: groundedAnswerSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = input.project ? await resolver.projectId(orgId, input.project) : undefined;
      return rag.answer(orgId, {
        question: input.question,
        projectId,
        limit: input.limit ?? 6,
        signal: ctx.signal,
      });
    },
  };

  const generateTasksFromDocument: AiTool<
    z.infer<typeof genTasksInput>,
    z.infer<typeof documentTaskPlanSchema>
  > = {
    name: 'generateTasksFromDocument',
    description:
      'Propose structured tasks (title, description, priority, points) grounded in a specific document ' +
      '(e.g. a PRD). Returns a proposal to review — nothing is created until applyGeneratedTasks.',
    requiredPermission: 'read',
    inputSchema: genTasksInput,
    outputSchema: documentTaskPlanSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const documentId = await resolveDocument(orgId, input.document);
      return rag.generateTasks(orgId, documentId, input.count ?? 6, ctx.signal);
    },
  };

  const applyGeneratedTasks: AiTool<
    z.infer<typeof applyTasksInput>,
    z.infer<typeof applyTasksOutput>
  > = {
    name: 'applyGeneratedTasks',
    description:
      'Commit a set of proposed tasks (from generateTasksFromDocument) into a project. Confirmation-gated: ' +
      'the first call reports what will be created; re-call with confirm=true to commit.',
    requiredPermission: 'task:create',
    inputSchema: applyTasksInput,
    outputSchema: applyTasksOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const userId = ctx.principal.userId;
      const projectId = await resolver.projectId(orgId, input.project);
      const sprintId = input.sprint ? await resolver.sprintId(orgId, projectId, input.sprint) : undefined;

      if (input.confirm !== true) {
        return {
          needsConfirmation: true,
          taskCount: input.tasks.length,
          message: `This will create ${input.tasks.length} task(s) in the project${
            input.sprint ? ` (sprint ${input.sprint})` : ''
          }. Re-call with confirm=true to proceed.`,
        };
      }

      const created = [];
      for (const t of input.tasks) {
        const task = await tasks.createTask(
          orgId,
          userId,
          {
            projectId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            storyPoints: t.storyPoints,
            sprintId,
          },
          aiMeta(ctx),
        );
        created.push(toTaskSummary(task));
      }
      return { needsConfirmation: false, created: created.length, tasks: created };
    },
  };

  return [
    searchKnowledge,
    askDocuments,
    generateTasksFromDocument,
    applyGeneratedTasks,
  ] as unknown as AiTool[];
}

// ── Input schemas ─────────────────────────────────────────────────────────────

const searchInput = z.object({
  query: z.string().min(2).max(1000).describe('What to search for in the documents.'),
  project: z.string().optional().describe('Optional project key/name/id to scope the search.'),
  limit: z.number().int().min(1).max(20).optional(),
});

const askInput = z.object({
  question: z.string().min(3).max(2000).describe('The question to answer from the documents.'),
  project: z.string().optional().describe('Optional project key/name/id to scope retrieval.'),
  limit: z.number().int().min(1).max(20).optional(),
});

const genTasksInput = z.object({
  document: z.string().describe('Document id or title to derive tasks from.'),
  count: z.number().int().min(1).max(20).optional(),
});

const applyTasksInput = z.object({
  project: z.string().describe('Project key, name, or id to create the tasks in.'),
  tasks: z.array(proposedTaskSchema).min(1).max(30),
  sprint: z.string().optional().describe('Optional sprint name (with project) or id to attach the tasks to.'),
  confirm: z.boolean().optional().describe('Set true to actually create after the user confirms.'),
});

const applyTasksOutput = z.object({
  needsConfirmation: z.boolean(),
  taskCount: z.number().optional(),
  message: z.string().optional(),
  created: z.number().optional(),
  tasks: z.array(taskSummarySchema).optional(),
});
