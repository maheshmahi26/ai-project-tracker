import { Injectable } from '@nestjs/common';
import type { RecallTimeframe } from '@ai-projectos/shared';
import { TasksRepository } from '../../tasks/tasks.repository';
import { ChatMessagesRepository } from '../repositories/chat-messages.repository';
import { Clock } from './clock';

export interface ResolvedTaskRef {
  id: string;
  key: string;
  title: string;
}

export interface TimeWindow {
  from: Date;
  to: Date;
}

const TASK_KEY_RE = /\b[A-Z][A-Z0-9]*-\d+\b/g;
const TASK_URL_ID_RE = /\/tasks\/([a-f0-9]{24})\b/g;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic temporal/entity recall (specs/06 Part B). Resolves fuzzy phrases
 * like "the tasks we discussed yesterday" by querying the session's ChatMessages
 * within a concrete time window and extracting the entities the agent actually
 * referenced (task keys + `/tasks/:id` deep links it emitted), then re-resolving
 * them to live task records. Never relies on the model "remembering" — always
 * org- and session-scoped, so there is no cross-tenant/user leakage.
 */
@Injectable()
export class MemoryResolver {
  constructor(
    private readonly messages: ChatMessagesRepository,
    private readonly tasks: TasksRepository,
    private readonly clock: Clock,
  ) {}

  /** Map a natural timeframe to a concrete [from, to) window (UTC day boundaries). */
  resolveTimeframe(timeframe: RecallTimeframe): TimeWindow {
    const now = this.clock.now();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    switch (timeframe) {
      case 'today':
        return { from: startOfDay, to: new Date(startOfDay.getTime() + DAY_MS) };
      case 'yesterday':
        return { from: new Date(startOfDay.getTime() - DAY_MS), to: startOfDay };
      case 'this_week': {
        const from = startOfWeek(startOfDay);
        return { from, to: new Date(from.getTime() + 7 * DAY_MS) };
      }
      case 'last_week': {
        const thisWeek = startOfWeek(startOfDay);
        return { from: new Date(thisWeek.getTime() - 7 * DAY_MS), to: thisWeek };
      }
      case 'recent':
      default:
        return { from: new Date(now.getTime() - DAY_MS), to: new Date(now.getTime() + 1000) };
    }
  }

  /**
   * Distinct tasks the agent referenced in this session during the window,
   * resolved to concrete records (dropping any since-deleted / cross-scope ids).
   */
  async recallTasks(
    orgId: string,
    sessionId: string,
    timeframe: RecallTimeframe,
  ): Promise<{ window: TimeWindow; tasks: ResolvedTaskRef[] }> {
    const window = this.resolveTimeframe(timeframe);
    const rows = await this.messages.listBetween(orgId, sessionId, window.from, window.to);

    const keys = new Set<string>();
    const ids = new Set<string>();
    for (const row of rows) {
      const blob = JSON.stringify({ c: row.toolCalls ?? null, r: row.toolResults ?? null });
      for (const m of blob.matchAll(TASK_KEY_RE)) keys.add(m[0]);
      for (const m of blob.matchAll(TASK_URL_ID_RE)) ids.add(m[1]!);
    }

    const resolved = new Map<string, ResolvedTaskRef>();
    for (const key of keys) {
      const task = await this.tasks.findByKey(orgId, key.toUpperCase());
      if (task) resolved.set(task._id.toString(), refOf(task));
    }
    for (const id of ids) {
      if (resolved.has(id)) continue;
      const task = await this.tasks.findById(orgId, id);
      if (task) resolved.set(task._id.toString(), refOf(task));
    }
    return { window, tasks: [...resolved.values()] };
  }
}

function refOf(task: { _id: { toString(): string }; key: string; title: string }): ResolvedTaskRef {
  return { id: task._id.toString(), key: task.key, title: task.title };
}

/** Monday-based start of week in UTC. */
function startOfWeek(startOfDay: Date): Date {
  const dow = startOfDay.getUTCDay(); // 0=Sun
  const diff = (dow + 6) % 7; // days since Monday
  return new Date(startOfDay.getTime() - diff * DAY_MS);
}
