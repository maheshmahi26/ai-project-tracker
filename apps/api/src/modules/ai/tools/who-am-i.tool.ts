import { z } from 'zod';
import { roleSchema } from '@ai-projectos/shared';
import type { UsersService } from '../../users/users.service';
import type { AiTool } from './ai-tool';

const inputSchema = z
  .object({})
  .describe('No arguments. Returns the identity and role of the current user.');

const outputSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  orgId: z.string(),
  role: roleSchema,
});

export type WhoAmIOutput = z.infer<typeof outputSchema>;

/**
 * Trivial read-only tool that proves the agent loop end-to-end: the model calls
 * it, the registry validates + authorizes it, and it wraps a real use case
 * (`UsersService`) exactly like the UI would. Everyone can read, so it requires
 * only the base `read` permission.
 */
export function createWhoAmITool(users: UsersService): AiTool<Record<string, never>, WhoAmIOutput> {
  return {
    name: 'whoAmI',
    description:
      'Return the current user (name, email) and their role in the active organization. ' +
      'Use when the user asks who they are, what their role is, or what they can do.',
    requiredPermission: 'read',
    inputSchema: inputSchema as unknown as z.ZodType<Record<string, never>>,
    outputSchema,
    handler: async (_input, ctx) => {
      const user = await users.getPublicByIdOrThrow(ctx.principal.userId);
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        orgId: ctx.principal.orgId,
        role: ctx.principal.role,
      };
    },
  };
}
