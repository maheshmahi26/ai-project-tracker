import { z } from 'zod';
import {
  bulkCreateMembersSchema,
  createMemberSchema,
  roleSchema,
  type CreateMemberInput,
  type MembershipDTO,
} from '@ai-projectos/shared';
import type { OrganizationsService } from '../../organizations/organizations.service';
import type { AiTool } from './ai-tool';
import type { ReferenceResolver } from './reference-resolver';
import { aiMeta } from './tool-support';

/**
 * Admin-only user-management tools. Each wraps the same {@link OrganizationsService}
 * use cases the admin UI calls, so validation, RBAC (`manage:users`), and auditing
 * are shared. Only admins hold `manage:users`, so these tools are never even
 * offered to other roles by the registry. Removal tools are confirm-gated.
 */
export function createUserTools(
  orgs: OrganizationsService,
  resolver: ReferenceResolver,
): AiTool[] {
  const userSummary = (m: MembershipDTO): z.infer<typeof userSummarySchema> => ({
    userId: m.userId,
    email: m.user?.email ?? '',
    name: m.user?.name ?? '',
    role: m.role,
  });

  const createUser: AiTool<CreateMemberInput, z.infer<typeof userSummarySchema>> = {
    name: 'createUser',
    description:
      'Create (provision) a new member in the current organization with a temporary password. ' +
      'Role must be one of manager, developer, or tester (admins cannot be created here). ' +
      'Requires admin privileges.',
    requiredPermission: 'manage:users',
    inputSchema: createMemberSchema,
    outputSchema: userSummarySchema,
    handler: async (input, ctx) => {
      const membership = await orgs.createMember(
        ctx.principal.orgId,
        ctx.principal.userId,
        input,
        aiMeta(ctx),
      );
      return userSummary(membership);
    },
  };

  const bulkCreateUsers: AiTool<
    z.infer<typeof bulkCreateMembersSchema>,
    z.infer<typeof bulkCreateOutput>
  > = {
    name: 'bulkCreateUsers',
    description:
      'Create several members at once (each with name, email, password, and a non-admin role). ' +
      'Requires admin privileges.',
    requiredPermission: 'manage:users',
    inputSchema: bulkCreateMembersSchema,
    outputSchema: bulkCreateOutput,
    handler: async (input, ctx) => {
      const created: z.infer<typeof userSummarySchema>[] = [];
      for (const member of input.members) {
        const membership = await orgs.createMember(
          ctx.principal.orgId,
          ctx.principal.userId,
          member,
          aiMeta(ctx),
        );
        created.push(userSummary(membership));
      }
      return { created: created.length, users: created };
    },
  };

  const removeUser: AiTool<z.infer<typeof removeUserInput>, z.infer<typeof removeUserOutput>> = {
    name: 'removeUser',
    description:
      'Remove a member from the current organization. Reference the user by name, email, or id. ' +
      'Destructive: the first call returns a confirmation prompt; re-call with confirm=true to ' +
      'commit. Requires admin privileges.',
    requiredPermission: 'manage:users',
    destructive: true,
    inputSchema: removeUserInput,
    outputSchema: removeUserOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const userId = await resolver.memberId(orgId, input.user);
      if (input.confirm !== true) {
        return {
          needsConfirmation: true,
          id: userId,
          message: `This will remove the member ${input.user}. Re-call with confirm=true to proceed.`,
        };
      }
      await orgs.removeMember(orgId, ctx.principal.userId, userId, aiMeta(ctx));
      return { needsConfirmation: false, removed: true, id: userId };
    },
  };

  const bulkRemoveUsers: AiTool<
    z.infer<typeof bulkRemoveInput>,
    z.infer<typeof bulkRemoveOutput>
  > = {
    name: 'bulkRemoveUsers',
    description:
      'Remove several members at once. Reference each user by name, email, or id. Destructive: ' +
      'the first call returns a confirmation prompt; re-call with confirm=true to commit. ' +
      'Requires admin privileges.',
    requiredPermission: 'manage:users',
    destructive: true,
    inputSchema: bulkRemoveInput,
    outputSchema: bulkRemoveOutput,
    handler: async (input, ctx) => {
      const orgId = ctx.principal.orgId;
      const ids = await Promise.all(input.users.map((ref) => resolver.memberId(orgId, ref)));
      if (input.confirm !== true) {
        return {
          needsConfirmation: true,
          count: ids.length,
          message: `This will remove ${ids.length} member(s). Re-call with confirm=true to proceed.`,
        };
      }
      let removed = 0;
      for (const id of ids) {
        await orgs.removeMember(orgId, ctx.principal.userId, id, aiMeta(ctx));
        removed += 1;
      }
      return { needsConfirmation: false, removed };
    },
  };

  return [createUser, bulkCreateUsers, removeUser, bulkRemoveUsers] as unknown as AiTool[];
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const userSummarySchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
});

const bulkCreateOutput = z.object({
  created: z.number(),
  users: z.array(userSummarySchema),
});

const removeUserInput = z.object({
  user: z.string().describe('Member name, email, or id.'),
  confirm: z.boolean().optional().describe('Set true to actually remove after the user confirms.'),
});

const removeUserOutput = z.object({
  needsConfirmation: z.boolean(),
  removed: z.boolean().optional(),
  id: z.string().optional(),
  message: z.string().optional(),
});

const bulkRemoveInput = z.object({
  users: z.array(z.string()).min(1).max(50).describe('Member names, emails, or ids.'),
  confirm: z.boolean().optional().describe('Set true to actually remove after the user confirms.'),
});

const bulkRemoveOutput = z.object({
  needsConfirmation: z.boolean(),
  removed: z.number().optional(),
  count: z.number().optional(),
  message: z.string().optional(),
});
