import { z } from 'zod';
import {
  taskPrioritySchema,
  taskStatusSchema,
  type BulkUpdateTasksInput,
  type CreateTaskInput,
  type ListTasksQuery,
  type MoveTaskInput,
  type UpdateTaskInput,
} from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { TasksService } from '../../tasks/tasks.service';
import type { AiTool } from './ai-tool';
import type { ReferenceResolver } from './reference-resolver';
import {
  aiDateField,
  aiMeta,
  aiStoryPoints,
  taskSummarySchema,
  toTaskSummary,
} from './tool-support';

/**
 * Action tools for tasks. Each is a thin wrapper over {@link TasksService} — the
 * same use case the REST API calls — so validation, RBAC, transactions, sprint
 * recomputation, and auditing are shared. The only extra work here is resolving
 * natural-language references (project key, assignee name) into ids.
 */
export function createTaskTools(tasks: TasksService, resolver: ReferenceResolver): AiTool[] {
  const createTask: AiTool<z.infer<typeof createTaskInput>, z.infer<typeof taskSummarySchema>> = {
    name: 'createTask',
    description:
      'Create a task in a project. Reference the project by its key (e.g. "AUTH"), name, or id, ' +
      'and the assignee by name, email, or id.',
    requiredPermission: 'task:create',
    inputSchema: createTaskInput,
    outputSchema: taskSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const assigneeId = input.assignee ? await resolver.memberId(orgId, input.assignee) : undefined;
      const sprintId = input.sprint
        ? await resolver.sprintId(orgId, projectId, input.sprint)
        : undefined;

      const dto: CreateTaskInput = {
        projectId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId,
        sprintId,
        storyPoints: input.storyPoints,
        dueDate: input.dueDate,
      };
      const created = await tasks.createTask(orgId, ctx.principal.userId, dto, aiMeta(ctx));
      return toTaskSummary(created);
    },
  };

  const updateTask: AiTool<z.infer<typeof updateTaskInput>, z.infer<typeof taskSummarySchema>> = {
    name: 'updateTask',
    description:
      'Update fields of an existing task (title, description, status, priority, assignee, sprint, ' +
      'story points, due date). Reference the task by key (e.g. "AUTH-12") or id. ' +
      'Pass assignee/sprint as null to clear them.',
    requiredPermission: 'task:update',
    inputSchema: updateTaskInput,
    outputSchema: taskSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const taskId = await resolver.taskId(orgId, input.task);
      const current = await tasks.getTask(orgId, taskId);

      const patch: UpdateTaskInput = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.status !== undefined) patch.status = input.status;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.assignee !== undefined) {
        patch.assigneeId = input.assignee === null ? null : await resolver.memberId(orgId, input.assignee);
      }
      if (input.sprint !== undefined) {
        patch.sprintId =
          input.sprint === null ? null : await resolver.sprintId(orgId, current.projectId, input.sprint);
      }
      if (input.storyPoints !== undefined) patch.storyPoints = input.storyPoints;
      if (input.dueDate !== undefined) patch.dueDate = input.dueDate;

      const updated = await tasks.updateTask(orgId, ctx.principal.userId, taskId, patch, aiMeta(ctx));
      return toTaskSummary(updated);
    },
  };

  const assignTask: AiTool<z.infer<typeof assignTaskInput>, z.infer<typeof taskSummarySchema>> = {
    name: 'assignTask',
    description:
      'Assign a task to a member (by name, email, or id) or pass assignee=null to unassign. ' +
      'Reference the task by key or id.',
    requiredPermission: 'task:assign',
    inputSchema: assignTaskInput,
    outputSchema: taskSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const taskId = await resolver.taskId(orgId, input.task);
      const assigneeId = input.assignee === null ? null : await resolver.memberId(orgId, input.assignee);
      const updated = await tasks.assignTask(orgId, ctx.principal.userId, taskId, { assigneeId }, aiMeta(ctx));
      return toTaskSummary(updated);
    },
  };

  const moveTask: AiTool<z.infer<typeof moveTaskInput>, z.infer<typeof taskSummarySchema>> = {
    name: 'moveTask',
    description:
      'Move a task to a different status column and/or sprint. Reference the task by key or id; ' +
      'pass sprint=null to remove it from its sprint.',
    requiredPermission: 'task:update',
    inputSchema: moveTaskInput,
    outputSchema: taskSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const taskId = await resolver.taskId(orgId, input.task);
      const current = await tasks.getTask(orgId, taskId);

      const move: MoveTaskInput = {};
      if (input.status !== undefined) move.status = input.status;
      if (input.order !== undefined) move.order = input.order;
      if (input.sprint !== undefined) {
        move.sprintId =
          input.sprint === null ? null : await resolver.sprintId(orgId, current.projectId, input.sprint);
      }
      const updated = await tasks.moveTask(orgId, ctx.principal.userId, taskId, move, aiMeta(ctx));
      return toTaskSummary(updated);
    },
  };

  const deleteTask: AiTool<z.infer<typeof taskRefInput>, { deleted: boolean; id: string }> = {
    name: 'deleteTask',
    description:
      'Delete a single task (soft delete — reversible via undo). Reference the task by key or id.',
    requiredPermission: 'task:delete',
    destructive: true,
    inputSchema: taskRefInput,
    outputSchema: z.object({ deleted: z.boolean(), id: z.string() }),
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const taskId = await resolver.taskId(orgId, input.task);
      await tasks.deleteTask(orgId, ctx.principal.userId, taskId, aiMeta(ctx));
      return { deleted: true, id: taskId };
    },
  };

  const searchTasks: AiTool<z.infer<typeof searchTasksInput>, z.infer<typeof searchTasksOutput>> = {
    name: 'searchTasks',
    description:
      'Search/list tasks. Filter by project, free-text query, comma-separated statuses/priorities, ' +
      'assignee, and sprint. Returns compact task summaries.',
    requiredPermission: 'read',
    inputSchema: searchTasksInput,
    outputSchema: searchTasksOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = input.project ? await resolver.projectId(orgId, input.project) : undefined;
      const assigneeId = input.assignee ? await resolver.memberId(orgId, input.assignee) : undefined;
      let sprintId: string | undefined;
      if (input.sprint) {
        if (!projectId) {
          throw AppException.validation('Provide `project` to filter by sprint name.');
        }
        sprintId = await resolver.sprintId(orgId, projectId, input.sprint);
      }

      const query: ListTasksQuery = {
        projectId,
        assigneeId,
        sprintId,
        status: input.status,
        priority: input.priority,
        q: input.query,
        limit: input.limit ?? 20,
      };
      const page = await tasks.listTasks(orgId, query);
      return {
        count: page.items.length,
        hasMore: page.page.hasMore,
        nextCursor: page.page.nextCursor ?? null,
        tasks: page.items.map(toTaskSummary),
      };
    },
  };

  const bulkUpdateTasks: AiTool<z.infer<typeof bulkUpdateInput>, { updated: number }> = {
    name: 'bulkUpdateTasks',
    description:
      'Apply the same patch to many tasks at once. Reference each task by key or id. ' +
      'To set a sprint by name, also pass `project`.',
    requiredPermission: 'task:update',
    inputSchema: bulkUpdateInput,
    outputSchema: z.object({ updated: z.number() }),
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const ids = await Promise.all(input.tasks.map((ref) => resolver.taskId(orgId, ref)));

      const p = input.patch;
      const patch: BulkUpdateTasksInput['patch'] = {};
      if (p.status !== undefined) patch.status = p.status;
      if (p.priority !== undefined) patch.priority = p.priority;
      if (p.storyPoints !== undefined) patch.storyPoints = p.storyPoints;
      if (p.dueDate !== undefined) patch.dueDate = p.dueDate;
      if (p.assignee !== undefined) {
        patch.assigneeId = p.assignee === null ? null : await resolver.memberId(orgId, p.assignee);
      }
      if (p.sprint !== undefined) {
        if (p.sprint === null) {
          patch.sprintId = null;
        } else {
          if (!input.project) {
            throw AppException.validation('Provide `project` to resolve the sprint by name.');
          }
          const projectId = await resolver.projectId(orgId, input.project);
          patch.sprintId = await resolver.sprintId(orgId, projectId, p.sprint);
        }
      }

      return tasks.bulkUpdate(orgId, ctx.principal.userId, { ids, patch }, aiMeta(ctx));
    },
  };

  const bulkDeleteTasks: AiTool<z.infer<typeof bulkDeleteInput>, z.infer<typeof bulkDeleteOutput>> = {
    name: 'bulkDeleteTasks',
    description:
      'Delete many tasks at once (soft delete — reversible). Destructive: first call returns a ' +
      'confirmation prompt; re-call with confirm=true to commit.',
    requiredPermission: 'task:delete',
    destructive: true,
    inputSchema: bulkDeleteInput,
    outputSchema: bulkDeleteOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const ids = await Promise.all(input.tasks.map((ref) => resolver.taskId(orgId, ref)));
      if (input.confirm !== true) {
        return {
          needsConfirmation: true,
          count: ids.length,
          message: `This will delete ${ids.length} task(s). Re-call with confirm=true to proceed (reversible via undo).`,
        };
      }
      const res = await tasks.bulkDelete(orgId, ctx.principal.userId, { ids }, aiMeta(ctx));
      return { needsConfirmation: false, deleted: res.deleted };
    },
  };

  return [
    createTask,
    updateTask,
    assignTask,
    moveTask,
    deleteTask,
    searchTasks,
    bulkUpdateTasks,
    bulkDeleteTasks,
  ] as unknown as AiTool[];
}

// ── Input schemas (AI-facing; references are strings the resolver maps) ────────

const createTaskInput = z.object({
  project: z.string().describe('Project key, name, or id.'),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignee: z.string().optional().describe('Member name, email, or id.'),
  sprint: z.string().optional().describe('Sprint name or id within the project.'),
  storyPoints: aiStoryPoints.optional(),
  dueDate: aiDateField.optional(),
});

const taskRefInput = z.object({ task: z.string().describe('Task key (e.g. "AUTH-12") or id.') });

const updateTaskInput = z.object({
  task: z.string().describe('Task key or id.'),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignee: z.string().nullable().optional().describe('Member name/email/id, or null to unassign.'),
  sprint: z.string().nullable().optional().describe('Sprint name/id, or null to remove from sprint.'),
  storyPoints: aiStoryPoints.nullable().optional(),
  dueDate: aiDateField.nullable().optional(),
});

const assignTaskInput = z.object({
  task: z.string().describe('Task key or id.'),
  assignee: z.string().nullable().describe('Member name/email/id, or null to unassign.'),
});

const moveTaskInput = z
  .object({
    task: z.string().describe('Task key or id.'),
    status: taskStatusSchema.optional(),
    sprint: z.string().nullable().optional().describe('Sprint name/id, or null to remove from sprint.'),
    order: z.number().finite().optional(),
  })
  .refine((v) => v.status !== undefined || v.sprint !== undefined || v.order !== undefined, {
    message: 'Provide at least one of status, sprint, or order.',
  });

const searchTasksInput = z.object({
  project: z.string().optional().describe('Project key, name, or id.'),
  query: z.string().trim().max(200).optional().describe('Free-text search over title/description.'),
  status: z.string().optional().describe('Comma-separated statuses, e.g. "todo,in_progress".'),
  priority: z.string().optional().describe('Comma-separated priorities, e.g. "high,urgent".'),
  assignee: z.string().optional().describe('Member name, email, or id.'),
  sprint: z.string().optional().describe('Sprint name or id (requires project).'),
  limit: z.number().int().min(1).max(50).optional(),
});

const searchTasksOutput = z.object({
  count: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
  tasks: z.array(taskSummarySchema),
});

const bulkPatchInput = z
  .object({
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assignee: z.string().nullable(),
    sprint: z.string().nullable(),
    storyPoints: aiStoryPoints.nullable(),
    dueDate: aiDateField.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Patch must not be empty.' });

const bulkUpdateInput = z.object({
  tasks: z.array(z.string()).min(1).max(100).describe('Task keys or ids.'),
  patch: bulkPatchInput,
  project: z.string().optional().describe('Project key/name/id — required to set a sprint by name.'),
});

const bulkDeleteInput = z.object({
  tasks: z.array(z.string()).min(1).max(100).describe('Task keys or ids.'),
  confirm: z.boolean().optional().describe('Set true to actually delete after the user confirms.'),
});

const bulkDeleteOutput = z.object({
  needsConfirmation: z.boolean(),
  count: z.number().optional(),
  deleted: z.number().optional(),
  message: z.string().optional(),
});
