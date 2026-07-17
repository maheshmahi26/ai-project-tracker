import { z } from 'zod';
import type { CreateProjectInput, UpdateProjectInput } from '@ai-projectos/shared';
import type { ProjectsService } from '../../projects/projects.service';
import type { AiTool } from './ai-tool';
import type { ReferenceResolver } from './reference-resolver';
import {
  aiDateField,
  aiHexColor,
  aiMeta,
  projectSummarySchema,
  toProjectSummary,
} from './tool-support';

/**
 * Action tools for projects — thin wrappers over {@link ProjectsService}.
 * `deleteProject` is confirmation-gated: the first call reports what will be
 * deleted; the agent must re-invoke with `confirm=true` after the user agrees.
 */
export function createProjectTools(projects: ProjectsService, resolver: ReferenceResolver): AiTool[] {
  const createProject: AiTool<z.infer<typeof createProjectInput>, z.infer<typeof projectSummarySchema>> = {
    name: 'createProject',
    description:
      'Create a project. Optionally set a lead (by name/email/id). If no key is given, one is derived from the name.',
    requiredPermission: 'project:create',
    inputSchema: createProjectInput,
    outputSchema: projectSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const leadId = input.lead ? await resolver.memberId(orgId, input.lead) : undefined;
      const dto: CreateProjectInput = {
        name: input.name,
        key: input.key,
        description: input.description,
        leadId,
        color: input.color,
        startDate: input.startDate,
        targetDate: input.targetDate,
      };
      const created = await projects.createProject(orgId, ctx.principal.userId, dto, aiMeta(ctx));
      return toProjectSummary(created);
    },
  };

  const updateProject: AiTool<z.infer<typeof updateProjectInput>, z.infer<typeof projectSummarySchema>> = {
    name: 'updateProject',
    description:
      'Update a project (name, description, color, lead, dates). Reference the project by key, name, or id. ' +
      'Pass lead=null to clear the lead.',
    requiredPermission: 'project:update',
    inputSchema: updateProjectInput,
    outputSchema: projectSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const patch: UpdateProjectInput = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.color !== undefined) patch.color = input.color;
      if (input.startDate !== undefined) patch.startDate = input.startDate;
      if (input.targetDate !== undefined) patch.targetDate = input.targetDate;
      if (input.lead !== undefined) {
        patch.leadId = input.lead === null ? null : await resolver.memberId(orgId, input.lead);
      }
      const updated = await projects.updateProject(orgId, ctx.principal.userId, projectId, patch, aiMeta(ctx));
      return toProjectSummary(updated);
    },
  };

  const archiveProject: AiTool<z.infer<typeof projectRefInput>, z.infer<typeof projectSummarySchema>> = {
    name: 'archiveProject',
    description: 'Archive a project (hides it from active lists; reversible). Reference by key, name, or id.',
    requiredPermission: 'project:archive',
    inputSchema: projectRefInput,
    outputSchema: projectSummarySchema,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const archived = await projects.archiveProject(orgId, ctx.principal.userId, projectId, aiMeta(ctx));
      return toProjectSummary(archived);
    },
  };

  const deleteProject: AiTool<z.infer<typeof deleteProjectInput>, z.infer<typeof deleteProjectOutput>> = {
    name: 'deleteProject',
    description:
      'Delete a project (soft delete — reversible). Destructive: first call returns a confirmation ' +
      'prompt; re-call with confirm=true to commit.',
    requiredPermission: 'project:delete',
    destructive: true,
    inputSchema: deleteProjectInput,
    outputSchema: deleteProjectOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const projectId = await resolver.projectId(orgId, input.project);
      const project = await projects.getProject(orgId, projectId);
      if (input.confirm !== true) {
        return {
          needsConfirmation: true,
          id: projectId,
          message: `This will delete project ${project.key} — "${project.name}" and hide its tasks. Re-call with confirm=true to proceed (reversible via undo).`,
        };
      }
      await projects.deleteProject(orgId, ctx.principal.userId, projectId, aiMeta(ctx));
      return { needsConfirmation: false, deleted: true, id: projectId };
    },
  };

  return [createProject, updateProject, archiveProject, deleteProject] as unknown as AiTool[];
}

// ── Input schemas ─────────────────────────────────────────────────────────────

const createProjectInput = z.object({
  name: z.string().trim().min(2).max(120),
  key: z.string().trim().min(2).max(10).optional().describe('Uppercase key like "AUTH". Auto-derived if omitted.'),
  description: z.string().trim().max(2000).optional(),
  lead: z.string().optional().describe('Project lead — name, email, or id.'),
  color: aiHexColor.optional(),
  startDate: aiDateField.optional(),
  targetDate: aiDateField.optional(),
});

const projectRefInput = z.object({ project: z.string().describe('Project key, name, or id.') });

const updateProjectInput = z.object({
  project: z.string().describe('Project key, name, or id.'),
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  color: aiHexColor.optional(),
  lead: z.string().nullable().optional().describe('Name/email/id, or null to clear.'),
  startDate: aiDateField.nullable().optional(),
  targetDate: aiDateField.nullable().optional(),
});

const deleteProjectInput = z.object({
  project: z.string().describe('Project key, name, or id.'),
  confirm: z.boolean().optional().describe('Set true to actually delete after the user confirms.'),
});

const deleteProjectOutput = z.object({
  needsConfirmation: z.boolean(),
  deleted: z.boolean().optional(),
  id: z.string().optional(),
  message: z.string().optional(),
});
