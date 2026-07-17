import { z } from 'zod';
import { Types } from 'mongoose';
import type { CreateSprintInput } from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { SprintsService } from '../../sprints/sprints.service';
import type { TasksService } from '../../tasks/tasks.service';
import type { AiTool } from './ai-tool';
import type { ReferenceResolver } from './reference-resolver';
import { aiDateField, aiMeta, sprintSummarySchema, toSprintSummary } from './tool-support';

/**
 * Sprint action tools. `addTasksToSprint` reuses {@link TasksService.bulkUpdate}
 * (moving tasks into a sprint is a task write), keeping sprint point totals
 * recomputed exactly as the UI does.
 */
export function createSprintTools(
  sprints: SprintsService,
  tasks: TasksService,
  resolver: ReferenceResolver,
): AiTool[] {
  /** Resolve a sprint ref within an optional project ref (or an id on its own). */
  const resolveSprint = async (orgId: string, sprintRef: string, projectRef?: string): Promise<string> => {
    if (projectRef) {
      const projectId = await resolver.projectId(orgId, projectRef);
      return resolver.sprintId(orgId, projectId, sprintRef);
    }
    if (Types.ObjectId.isValid(sprintRef) && sprintRef.length === 24) {
      const sprint = await sprints.getSprint(orgId, sprintRef);
      return sprint.id;
    }
    throw AppException.validation('Provide `project` to resolve the sprint by name, or pass the sprint id.');
  };

  const createSprint: AiTool<z.infer<typeof createSprintInput>, z.infer<typeof sprintSummarySchema>> = {
    name: 'createSprint',
    description: 'Create a sprint in a project. Reference the project by key, name, or id.',
    requiredPermission: 'sprint:manage',
    inputSchema: createSprintInput,
    outputSchema: sprintSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const dto: CreateSprintInput = {
        name: input.name,
        goal: input.goal,
        startDate: input.startDate,
        endDate: input.endDate,
        capacityPoints: input.capacityPoints,
      };
      const created = await sprints.createSprint(orgId, ctx.principal.userId, projectId, dto, aiMeta(ctx));
      return toSprintSummary(created);
    },
  };

  const addTasksToSprint: AiTool<z.infer<typeof addTasksInput>, z.infer<typeof addTasksOutput>> = {
    name: 'addTasksToSprint',
    description:
      'Add one or more tasks to a sprint. Reference the sprint by name (with project) or id, and each task by key or id.',
    requiredPermission: 'sprint:manage',
    inputSchema: addTasksInput,
    outputSchema: addTasksOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const sprintId = await resolveSprint(orgId, input.sprint, input.project);
      const ids = await Promise.all(input.tasks.map((ref) => resolver.taskId(orgId, ref)));
      const res = await tasks.bulkUpdate(
        orgId,
        ctx.principal.userId,
        { ids, patch: { sprintId } },
        aiMeta(ctx),
      );
      const sprint = await sprints.getSprint(orgId, sprintId);
      return { updated: res.updated, sprint: toSprintSummary(sprint) };
    },
  };

  const completeSprint: AiTool<z.infer<typeof completeSprintInput>, z.infer<typeof sprintSummarySchema>> = {
    name: 'completeSprint',
    description: 'Mark a sprint as completed. Reference the sprint by name (with project) or id.',
    requiredPermission: 'sprint:manage',
    inputSchema: completeSprintInput,
    outputSchema: sprintSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const sprintId = await resolveSprint(orgId, input.sprint, input.project);
      const completed = await sprints.completeSprint(orgId, ctx.principal.userId, sprintId, aiMeta(ctx));
      return toSprintSummary(completed);
    },
  };

  return [createSprint, addTasksToSprint, completeSprint] as unknown as AiTool[];
}

// ── Input schemas ─────────────────────────────────────────────────────────────

const createSprintInput = z.object({
  project: z.string().describe('Project key, name, or id.'),
  name: z.string().trim().min(2).max(120),
  goal: z.string().trim().max(2000).optional(),
  startDate: aiDateField.optional(),
  endDate: aiDateField.optional(),
  capacityPoints: z.number().int().min(0).max(10000).optional(),
});

const addTasksInput = z.object({
  sprint: z.string().describe('Sprint name (with project) or id.'),
  project: z.string().optional().describe('Project key/name/id — needed to resolve the sprint by name.'),
  tasks: z.array(z.string()).min(1).max(100).describe('Task keys or ids.'),
});

const addTasksOutput = z.object({ updated: z.number(), sprint: sprintSummarySchema });

const completeSprintInput = z.object({
  sprint: z.string().describe('Sprint name (with project) or id.'),
  project: z.string().optional().describe('Project key/name/id — needed to resolve the sprint by name.'),
});
