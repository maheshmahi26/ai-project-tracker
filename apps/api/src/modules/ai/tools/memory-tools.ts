import { z } from 'zod';
import { recallTimeframeSchema } from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { MemoryResolver } from '../memory/memory-resolver.service';
import type { AiTool } from './ai-tool';

/**
 * Temporal recall tool. Turns "the tasks we discussed yesterday" into the exact
 * task keys the agent referenced earlier in THIS session, so it can then act on
 * them (e.g. addTasksToSprint) instead of guessing. Session- and org-scoped.
 */
export function createMemoryTools(resolver: MemoryResolver): AiTool[] {
  const recallTasks: AiTool<z.infer<typeof recallInput>, z.infer<typeof recallOutput>> = {
    name: 'recallTasks',
    description:
      'Resolve tasks referenced earlier in this conversation within a timeframe (e.g. "yesterday"). ' +
      'Use this before acting on things "we discussed" — it returns concrete task keys to pass to other tools.',
    requiredPermission: 'read',
    inputSchema: recallInput,
    outputSchema: recallOutput,
    handler: async (input, ctx) => {
      if (!ctx.sessionId) {
        throw AppException.validation('Recall is only available inside a chat session.');
      }
      const timeframe = input.timeframe ?? 'recent';
      const { window, tasks } = await resolver.recallTasks(ctx.principal.orgId, ctx.sessionId, timeframe);
      return {
        timeframe,
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        tasks,
      };
    },
  };

  return [recallTasks] as unknown as AiTool[];
}

const recallInput = z.object({
  timeframe: recallTimeframeSchema
    .optional()
    .describe('today | yesterday | this_week | last_week | recent (default recent).'),
});

const recallOutput = z.object({
  timeframe: recallTimeframeSchema,
  from: z.string(),
  to: z.string(),
  tasks: z.array(z.object({ id: z.string(), key: z.string(), title: z.string() })),
});
