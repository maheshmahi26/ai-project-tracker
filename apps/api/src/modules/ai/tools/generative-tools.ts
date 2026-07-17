import { z } from 'zod';
import { Types } from 'mongoose';
import {
  acceptanceCriteriaSchema,
  analyticsMetricSchema,
  analyticsResultSchema,
  generativePrompts,
  meetingSummarySchema,
  releaseNotesSchema,
  reportSchema,
  roadmapSchema,
  sprintPlanSchema,
  standupSchema,
  subtaskPlanSchema,
  summarySchema,
  userStoriesSchema,
  weeklyReportGenSchema,
  type AnalyticsResult,
} from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { GeminiClient } from '../../../infra/ai/gemini.client';
import type { DashboardService } from '../../dashboard/dashboard.service';
import type { ProjectsService } from '../../projects/projects.service';
import type { SprintsService } from '../../sprints/sprints.service';
import type { TasksService } from '../../tasks/tasks.service';
import type { AiTool } from './ai-tool';
import type { ReferenceResolver } from './reference-resolver';
import { generateStructured, taskLines } from './generative-support';
import { aiMeta } from './tool-support';

const clip = (text: string | null | undefined, max = 2000): string =>
  (text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export interface GenerativeDeps {
  gemini: GeminiClient;
  tasks: TasksService;
  projects: ProjectsService;
  sprints: SprintsService;
  dashboard: DashboardService;
  resolver: ReferenceResolver;
}

/**
 * Generative / analytical tools. Each returns **schema-valid JSON** (never free
 * prose), so the chat UI can render a proposal the user accepts. Pure generation
 * is read-only; the sole mutation (`applySprintPlan`) is the confirm→commit step
 * for a `generateSprint` proposal and writes through the same services the UI uses.
 */
export function createGenerativeTools(deps: GenerativeDeps): AiTool[] {
  const { gemini, tasks, projects, sprints, dashboard, resolver } = deps;

  const resolveSprintRef = async (orgId: string, sprintRef: string, projectRef?: string): Promise<string> => {
    if (projectRef) {
      const projectId = await resolver.projectId(orgId, projectRef);
      return resolver.sprintId(orgId, projectId, sprintRef);
    }
    if (Types.ObjectId.isValid(sprintRef) && sprintRef.length === 24) {
      return (await sprints.getSprint(orgId, sprintRef)).id;
    }
    throw AppException.validation('Provide `project` to resolve the sprint by name, or pass the sprint id.');
  };

  const generateSprint: AiTool<z.infer<typeof genSprintInput>, z.infer<typeof sprintPlanSchema>> = {
    name: 'generateSprint',
    description:
      'Propose a sprint plan (name, goal, and a set of tasks with estimates) from a project backlog. ' +
      'Returns a proposal to review — nothing is created until you call applySprintPlan.',
    requiredPermission: 'read',
    inputSchema: genSprintInput,
    outputSchema: sprintPlanSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const backlog = await tasks.listTasks(orgId, { projectId, status: 'backlog,todo', limit: 50 });
      const prompt = generativePrompts.generateSprint({
        backlog: taskLines(backlog.items),
        durationDays: input.durationDays ?? 14,
        ask: input.focus,
      });
      return generateStructured(gemini, sprintPlanSchema, prompt, ctx);
    },
  };

  const applySprintPlan: AiTool<z.infer<typeof applyPlanInput>, z.infer<typeof applyPlanOutput>> = {
    name: 'applySprintPlan',
    description:
      'Commit a sprint plan (from generateSprint) into a real sprint plus its tasks. Confirmation-gated: ' +
      'the first call reports what will be created; re-call with confirm=true to commit.',
    requiredPermission: 'sprint:manage',
    inputSchema: applyPlanInput,
    outputSchema: applyPlanOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const userId = ctx.principal.userId;
      const projectId = await resolver.projectId(orgId, input.project);
      if (input.confirm !== true) {
        return {
          needsConfirmation: true,
          taskCount: input.plan.tasks.length,
          message: `This will create sprint "${input.plan.name}" with ${input.plan.tasks.length} task(s). Re-call with confirm=true to proceed.`,
        };
      }
      const sprint = await sprints.createSprint(
        orgId,
        userId,
        projectId,
        { name: input.plan.name, goal: input.plan.goal || undefined },
        aiMeta(ctx),
      );
      const taskKeys: string[] = [];
      for (const t of input.plan.tasks) {
        const created = await tasks.createTask(
          orgId,
          userId,
          {
            projectId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            storyPoints: t.storyPoints,
            sprintId: sprint.id,
          },
          aiMeta(ctx),
        );
        taskKeys.push(created.key);
      }
      return { needsConfirmation: false, sprintId: sprint.id, created: taskKeys.length, taskKeys };
    },
  };

  const generateStandup: AiTool<z.infer<typeof standupInput>, z.infer<typeof standupSchema>> = {
    name: 'generateStandup',
    description: 'Generate a daily standup (per person: yesterday / today / blockers) from recent task activity.',
    requiredPermission: 'read',
    inputSchema: standupInput,
    outputSchema: standupSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = input.project ? await resolver.projectId(orgId, input.project) : undefined;
      const recent = await tasks.listTasks(orgId, { projectId, sort: '-updatedAt', limit: 60 });
      const prompt = generativePrompts.generateStandup({
        activity: taskLines(recent.items),
        date: new Date().toISOString().slice(0, 10),
      });
      return generateStructured(gemini, standupSchema, prompt, ctx);
    },
  };

  const summarizeSprint: AiTool<z.infer<typeof sprintRefInput>, z.infer<typeof summarySchema>> = {
    name: 'summarizeSprint',
    description: 'Summarize a sprint: progress, highlights, and risks. Reference the sprint by name (with project) or id.',
    requiredPermission: 'read',
    inputSchema: sprintRefInput,
    outputSchema: summarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const sprintId = await resolveSprintRef(orgId, input.sprint, input.project);
      const sprint = await sprints.getSprint(orgId, sprintId);
      const sprintTasks = await tasks.listTasks(orgId, { sprintId, limit: 100 });
      const prompt = generativePrompts.summarizeSprint({
        sprint: `${sprint.name} — ${sprint.status}; committed ${sprint.committedPoints}sp / completed ${sprint.completedPoints}sp. Goal: ${sprint.goal ?? '(none)'}`,
        tasks: taskLines(sprintTasks.items),
      });
      return generateStructured(gemini, summarySchema, prompt, ctx);
    },
  };

  const summarizeProject: AiTool<z.infer<typeof projectRefInput>, z.infer<typeof summarySchema>> = {
    name: 'summarizeProject',
    description: 'Summarize a project: current state, highlights, and risks. Reference by key, name, or id.',
    requiredPermission: 'read',
    inputSchema: projectRefInput,
    outputSchema: summarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const project = await projects.getProject(orgId, projectId);
      const projTasks = await tasks.listTasks(orgId, { projectId, limit: 100 });
      const prompt = generativePrompts.summarizeProject({
        project: `${project.key} — ${project.name} (${project.status}). ${clip(project.description, 500)}`,
        tasks: taskLines(projTasks.items),
      });
      return generateStructured(gemini, summarySchema, prompt, ctx);
    },
  };

  const generateProjectReport: AiTool<z.infer<typeof projectRefInput>, z.infer<typeof reportSchema>> = {
    name: 'generateProjectReport',
    description: 'Produce a stakeholder project report (title, summary, sections) grounded in real metrics.',
    requiredPermission: 'read',
    inputSchema: projectRefInput,
    outputSchema: reportSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const project = await projects.getProject(orgId, projectId);
      const [overview, projTasks] = await Promise.all([
        dashboard.overview(orgId, { projectId }),
        tasks.listTasks(orgId, { projectId, limit: 100 }),
      ]);
      const prompt = generativePrompts.generateProjectReport({
        project: `${project.key} — ${project.name} (${project.status})`,
        metrics: JSON.stringify(overview.tasks),
        tasks: taskLines(projTasks.items),
      });
      return generateStructured(gemini, reportSchema, prompt, ctx);
    },
  };

  const generateWeeklyReport: AiTool<z.infer<typeof weeklyInput>, z.infer<typeof weeklyReportGenSchema>> = {
    name: 'generateWeeklyReport',
    description: 'Write a weekly status report grounded in the real weekly aggregates.',
    requiredPermission: 'read',
    inputSchema: weeklyInput,
    outputSchema: weeklyReportGenSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = input.project ? await resolver.projectId(orgId, input.project) : undefined;
      const wr = await dashboard.weeklyReport(orgId, { projectId, weekOf: input.weekOf });
      const prompt = generativePrompts.generateWeeklyReport({
        period: `${wr.rangeStart.slice(0, 10)} → ${wr.rangeEnd.slice(0, 10)}`,
        data: `created ${wr.createdCount}, completed ${wr.completedCount}, active sprints ${wr.activeSprints}; created by priority ${JSON.stringify(wr.createdByPriority)}`,
      });
      return generateStructured(gemini, weeklyReportGenSchema, prompt, ctx);
    },
  };

  const generateUserStories: AiTool<z.infer<typeof storiesInput>, z.infer<typeof userStoriesSchema>> = {
    name: 'generateUserStories',
    description: 'Draft well-formed user stories (As a / I want / So that) with acceptance criteria for a feature.',
    requiredPermission: 'read',
    inputSchema: storiesInput,
    outputSchema: userStoriesSchema,
    handler: async (input, ctx) =>
      generateStructured(
        gemini,
        userStoriesSchema,
        generativePrompts.generateUserStories({ feature: input.feature, count: input.count ?? 5 }),
        ctx,
      ),
  };

  const generateAcceptanceCriteria: AiTool<
    z.infer<typeof acInput>,
    z.infer<typeof acceptanceCriteriaSchema>
  > = {
    name: 'generateAcceptanceCriteria',
    description: 'Write clear, testable acceptance criteria for a task (by key/id) or a free-text item.',
    requiredPermission: 'read',
    inputSchema: acInput,
    outputSchema: acceptanceCriteriaSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      let item = input.description ?? '';
      if (input.task) {
        const t = await tasks.getTask(orgId, await resolver.taskId(orgId, input.task));
        item = `${t.key} ${t.title}\n${clip(t.description, 1500)}`;
      }
      return generateStructured(
        gemini,
        acceptanceCriteriaSchema,
        generativePrompts.generateAcceptanceCriteria({ item }),
        ctx,
      );
    },
  };

  const generateSubtasks: AiTool<z.infer<typeof subtasksInput>, z.infer<typeof subtaskPlanSchema>> = {
    name: 'generateSubtasks',
    description: 'Break a task (by key/id) into concrete subtasks. Returns a proposal (nothing is created).',
    requiredPermission: 'read',
    inputSchema: subtasksInput,
    outputSchema: subtaskPlanSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const t = await tasks.getTask(orgId, await resolver.taskId(orgId, input.task));
      return generateStructured(
        gemini,
        subtaskPlanSchema,
        generativePrompts.generateSubtasks({
          task: `${t.key} ${t.title}\n${clip(t.description, 1500)}`,
          count: input.count ?? 4,
        }),
        ctx,
      );
    },
  };

  const generateRoadmap: AiTool<z.infer<typeof roadmapInput>, z.infer<typeof roadmapSchema>> = {
    name: 'generateRoadmap',
    description: 'Propose a phased product roadmap from a set of goals.',
    requiredPermission: 'read',
    inputSchema: roadmapInput,
    outputSchema: roadmapSchema,
    handler: async (input, ctx) =>
      generateStructured(gemini, roadmapSchema, generativePrompts.generateRoadmap({ goals: input.goals }), ctx),
  };

  const generateReleaseNotes: AiTool<z.infer<typeof releaseInput>, z.infer<typeof releaseNotesSchema>> = {
    name: 'generateReleaseNotes',
    description: 'Draft release notes from completed work in a project (optionally scoped to a sprint).',
    requiredPermission: 'read',
    inputSchema: releaseInput,
    outputSchema: releaseNotesSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const sprintId = input.sprint ? await resolveSprintRef(orgId, input.sprint, input.project) : undefined;
      const done = await tasks.listTasks(orgId, { projectId, sprintId, status: 'done', limit: 100 });
      return generateStructured(
        gemini,
        releaseNotesSchema,
        generativePrompts.generateReleaseNotes({ changes: taskLines(done.items) }),
        ctx,
      );
    },
  };

  const generateMeetingSummary: AiTool<z.infer<typeof meetingInput>, z.infer<typeof meetingSummarySchema>> = {
    name: 'generateMeetingSummary',
    description: 'Summarize raw meeting notes into a summary, decisions, and action items.',
    requiredPermission: 'read',
    inputSchema: meetingInput,
    outputSchema: meetingSummarySchema,
    handler: async (input, ctx) =>
      generateStructured(
        gemini,
        meetingSummarySchema,
        generativePrompts.generateMeetingSummary({ notes: input.notes }),
        ctx,
      ),
  };

  const analytics: AiTool<z.infer<typeof analyticsInput>, AnalyticsResult> = {
    name: 'analytics',
    description:
      'Answer a structured analytics question from real dashboard aggregates. Pick a metric: overview, ' +
      'velocity, tasksPerUser, priorityDistribution, projectProgress, or weeklyReport.',
    requiredPermission: 'read',
    inputSchema: analyticsInput,
    outputSchema: analyticsResultSchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = input.project ? await resolver.projectId(orgId, input.project) : undefined;
      const point = (label: string, value: number) => ({ label, value });

      switch (input.metric) {
        case 'overview': {
          const o = await dashboard.overview(orgId, { projectId });
          return {
            metric: 'overview',
            note: `${o.tasks.open} open / ${o.tasks.done} done, ${o.tasks.overdue} overdue.`,
            points: [
              point('open', o.tasks.open),
              point('done', o.tasks.done),
              point('overdue', o.tasks.overdue),
              point('activeProjects', o.projects.active),
              point('activeSprints', o.sprints.active),
              point('committedPoints', o.points.committed),
              point('completedPoints', o.points.completed),
            ],
          };
        }
        case 'velocity': {
          const rows = await dashboard.velocity(orgId, { projectId });
          return {
            metric: 'velocity',
            note: `${rows.length} sprint(s) of completed-point history.`,
            points: rows.map((r) => point(r.name, r.completedPoints)),
          };
        }
        case 'tasksPerUser': {
          const rows = await dashboard.tasksPerUser(orgId, { projectId });
          return {
            metric: 'tasksPerUser',
            note: `Task load across ${rows.length} assignee bucket(s).`,
            points: rows.map((r) => point(r.assigneeId ?? 'unassigned', r.total)),
          };
        }
        case 'priorityDistribution': {
          const rows = await dashboard.priorityDistribution(orgId, { projectId });
          return {
            metric: 'priorityDistribution',
            note: 'Open+closed task counts by priority.',
            points: rows.map((r) => point(r.priority, r.count)),
          };
        }
        case 'projectProgress': {
          const rows = await dashboard.projectProgress(orgId);
          return {
            metric: 'projectProgress',
            note: `Percent-complete across ${rows.length} active project(s).`,
            points: rows.map((r) => point(r.key, r.percentComplete)),
          };
        }
        case 'weeklyReport': {
          const wr = await dashboard.weeklyReport(orgId, { projectId });
          return {
            metric: 'weeklyReport',
            note: `Week ${wr.rangeStart.slice(0, 10)} → ${wr.rangeEnd.slice(0, 10)}.`,
            points: [
              point('created', wr.createdCount),
              point('completed', wr.completedCount),
              point('activeSprints', wr.activeSprints),
            ],
          };
        }
        default:
          throw AppException.validation('Unknown analytics metric');
      }
    },
  };

  return [
    generateSprint,
    applySprintPlan,
    generateStandup,
    summarizeSprint,
    summarizeProject,
    generateProjectReport,
    generateWeeklyReport,
    generateUserStories,
    generateAcceptanceCriteria,
    generateSubtasks,
    generateRoadmap,
    generateReleaseNotes,
    generateMeetingSummary,
    analytics,
  ] as unknown as AiTool[];
}

// ── Input schemas ─────────────────────────────────────────────────────────────

const projectRefInput = z.object({ project: z.string().describe('Project key, name, or id.') });

const sprintRefInput = z.object({
  sprint: z.string().describe('Sprint name (with project) or id.'),
  project: z.string().optional().describe('Project key/name/id — needed to resolve the sprint by name.'),
});

const genSprintInput = z.object({
  project: z.string().describe('Project key, name, or id.'),
  durationDays: z.number().int().min(1).max(60).optional(),
  focus: z.string().max(500).optional().describe('Optional theme/goal to bias selection.'),
});

const applyPlanInput = z.object({
  project: z.string().describe('Project key, name, or id.'),
  plan: sprintPlanSchema,
  confirm: z.boolean().optional().describe('Set true to actually create after the user confirms.'),
});

const applyPlanOutput = z.object({
  needsConfirmation: z.boolean(),
  taskCount: z.number().optional(),
  message: z.string().optional(),
  sprintId: z.string().optional(),
  created: z.number().optional(),
  taskKeys: z.array(z.string()).optional(),
});

const standupInput = z.object({
  project: z.string().optional().describe('Project key, name, or id.'),
  sinceDays: z.number().int().min(1).max(14).optional(),
});

const weeklyInput = z.object({
  project: z.string().optional().describe('Project key, name, or id.'),
  weekOf: z.string().optional().describe('ISO date within the target week (defaults to now).'),
});

const storiesInput = z.object({
  feature: z.string().min(3).max(4000).describe('Feature/epic description to break into stories.'),
  count: z.number().int().min(1).max(30).optional(),
});

const acInput = z
  .object({
    task: z.string().optional().describe('Task key or id to derive criteria from.'),
    description: z.string().max(4000).optional().describe('Free-text item, if no task.'),
  })
  .refine((v) => Boolean(v.task) || Boolean(v.description), {
    message: 'Provide either task or description.',
  });

const subtasksInput = z.object({
  task: z.string().describe('Task key or id.'),
  count: z.number().int().min(1).max(20).optional(),
});

const roadmapInput = z.object({
  goals: z.string().min(3).max(4000).describe('Goals / vision to turn into a phased roadmap.'),
});

const releaseInput = z.object({
  project: z.string().describe('Project key, name, or id.'),
  sprint: z.string().optional().describe('Optional sprint name (with project) or id to scope notes.'),
});

const meetingInput = z.object({
  notes: z.string().min(10).max(20000).describe('Raw meeting notes / transcript.'),
});

const analyticsInput = z.object({
  metric: analyticsMetricSchema,
  project: z.string().optional().describe('Optional project key/name/id to scope the metric.'),
});
