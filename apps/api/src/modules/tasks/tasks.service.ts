import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, SortOrder, Types } from 'mongoose';
import {
  TASK_SORT_FIELDS,
  type AssignTaskInput,
  type BulkDeleteTasksInput,
  type BulkUpdateTasksInput,
  type CreateTaskInput,
  type ListTasksQuery,
  type MoveTaskInput,
  type TaskDTO,
  type UpdateTaskInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { runInTransaction } from '../../common/db/transaction';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import type { RequestMeta } from '../auth/auth.service';
import { DomainEventBus } from '../events/domain-event-bus';
import type { DomainEventName } from '../events/domain-event';
import { ProjectsService } from '../projects/projects.service';
import { SprintsService } from '../sprints/sprints.service';
import { TasksRepository, type TaskLean } from './tasks.repository';
import { toTaskDTO } from './tasks.mapper';

const ORDER_GAP = 1000;

@Injectable()
export class TasksService {
  constructor(
    private readonly repo: TasksRepository,
    private readonly projects: ProjectsService,
    @Inject(forwardRef(() => SprintsService))
    private readonly sprints: SprintsService,
    private readonly events: DomainEventBus,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async createTask(
    orgId: string,
    actorId: string,
    input: CreateTaskInput,
    meta: RequestMeta,
  ): Promise<TaskDTO> {
    let projectId = input.projectId;
    let parentId: Types.ObjectId | null = null;

    if (input.parentId) {
      const parent = await this.requireTask(orgId, input.parentId);
      if (parent.parentId) {
        throw AppException.businessRule('Subtasks cannot have their own subtasks (max depth 1)');
      }
      projectId = parent.projectId.toString();
      parentId = parent._id;
    } else {
      // Throws NOT_FOUND if the project is missing (also enforces tenancy).
      await this.projects.getProject(orgId, projectId);
    }

    if (input.sprintId) {
      await this.sprints.assertSprintInProject(orgId, projectId, input.sprintId);
    }

    const { key } = await this.projects.allocateTaskNumber(orgId, projectId);
    const status = input.status ?? 'backlog';
    const order = (await this.repo.maxOrder(orgId, projectId, status)) + ORDER_GAP;

    const task = await runInTransaction(this.connection, async (session) => {
      const created = await this.repo.create(
        {
          orgId: new Types.ObjectId(orgId),
          projectId: new Types.ObjectId(projectId),
          sprintId: input.sprintId ? new Types.ObjectId(input.sprintId) : null,
          key,
          parentId,
          title: input.title,
          description: input.description ?? null,
          status,
          priority: input.priority ?? 'medium',
          assigneeId: input.assigneeId ? new Types.ObjectId(input.assigneeId) : null,
          reporterId: new Types.ObjectId(actorId),
          labelIds: (input.labelIds ?? []).map((id) => new Types.ObjectId(id)),
          storyPoints: input.storyPoints ?? null,
          dueDate: toDate(input.dueDate),
          order,
        },
        session,
      );
      if (created.sprintId) {
        await this.sprints.recomputePoints(orgId, created.sprintId.toString(), session);
      }
      return created;
    });

    await this.emit('task.created', task, actorId, meta, { verb: 'created', after: snapshot(task) });
    return toTaskDTO(task);
  }

  async getTask(orgId: string, id: string): Promise<TaskDTO> {
    return toTaskDTO(await this.requireTask(orgId, id));
  }

  async listTasks(orgId: string, query: ListTasksQuery): Promise<PaginatedResult<TaskDTO>> {
    const parentId = query.parentId === 'none' ? null : query.parentId;

    if (query.q) {
      // Ranked full-text search: single ranked page (no _id cursor).
      const rows = await this.repo.listCursor({
        orgId,
        projectId: query.projectId,
        sprintId: query.sprintId,
        status: splitCsv(query.status),
        priority: splitCsv(query.priority),
        assigneeId: query.assigneeId,
        parentId,
        q: query.q,
        limit: query.limit,
      });
      const hasMore = rows.length > query.limit;
      const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toTaskDTO);
      return new PaginatedResult(items, { hasMore, nextCursor: null });
    }

    const rows = await this.repo.listCursor({
      orgId,
      projectId: query.projectId,
      sprintId: query.sprintId,
      status: splitCsv(query.status),
      priority: splitCsv(query.priority),
      assigneeId: query.assigneeId,
      parentId,
      sort: parseSort(query.sort),
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toTaskDTO), query.limit, (item) => item.id);
  }

  async listSubtasks(orgId: string, parentId: string, limit = 100): Promise<PaginatedResult<TaskDTO>> {
    await this.requireTask(orgId, parentId);
    const rows = await this.repo.listCursor({ orgId, parentId, limit });
    return buildCursorPage(rows.map(toTaskDTO), limit, (item) => item.id);
  }

  async updateTask(
    orgId: string,
    actorId: string,
    id: string,
    input: UpdateTaskInput,
    meta: RequestMeta,
  ): Promise<TaskDTO> {
    const current = await this.requireTask(orgId, id);

    const set: Record<string, unknown> = {};
    if (input.title !== undefined) set.title = input.title;
    if (input.description !== undefined) set.description = input.description;
    if (input.status !== undefined) set.status = input.status;
    if (input.priority !== undefined) set.priority = input.priority;
    if (input.assigneeId !== undefined) {
      set.assigneeId = input.assigneeId ? new Types.ObjectId(input.assigneeId) : null;
    }
    if (input.sprintId !== undefined) {
      if (input.sprintId) {
        await this.sprints.assertSprintInProject(orgId, current.projectId.toString(), input.sprintId);
      }
      set.sprintId = input.sprintId ? new Types.ObjectId(input.sprintId) : null;
    }
    if (input.labelIds !== undefined) {
      set.labelIds = input.labelIds.map((lid) => new Types.ObjectId(lid));
    }
    if (input.storyPoints !== undefined) set.storyPoints = input.storyPoints;
    if (input.dueDate !== undefined) set.dueDate = toDate(input.dueDate);

    if (Object.keys(set).length === 0) return toTaskDTO(current);

    const affects = affectsPoints(input);
    const updated = await runInTransaction(this.connection, async (session) => {
      const next = await this.repo.updateById(orgId, id, { $set: set }, session);
      if (!next) throw AppException.notFound('Task not found');
      if (affects) {
        await this.recomputeSprints(orgId, [current.sprintId, next.sprintId], session);
      }
      return next;
    });

    const { before, after } = diff(snapshot(current), snapshot(updated), Object.keys(set));
    await this.emit('task.updated', updated, actorId, meta, { verb: 'updated', before, after });
    return toTaskDTO(updated);
  }

  async assignTask(
    orgId: string,
    actorId: string,
    id: string,
    input: AssignTaskInput,
    meta: RequestMeta,
  ): Promise<TaskDTO> {
    const current = await this.requireTask(orgId, id);
    const assigneeId = input.assigneeId ? new Types.ObjectId(input.assigneeId) : null;
    const updated = await this.repo.updateById(orgId, id, { $set: { assigneeId } });
    if (!updated) throw AppException.notFound('Task not found');

    await this.emit('task.assigned', updated, actorId, meta, {
      verb: 'assigned',
      before: { assigneeId: current.assigneeId ? current.assigneeId.toString() : null },
      after: { assigneeId: input.assigneeId ?? null },
    });
    return toTaskDTO(updated);
  }

  async moveTask(
    orgId: string,
    actorId: string,
    id: string,
    input: MoveTaskInput,
    meta: RequestMeta,
  ): Promise<TaskDTO> {
    const current = await this.requireTask(orgId, id);

    const set: Record<string, unknown> = {};
    if (input.sprintId !== undefined) {
      if (input.sprintId) {
        await this.sprints.assertSprintInProject(orgId, current.projectId.toString(), input.sprintId);
      }
      set.sprintId = input.sprintId ? new Types.ObjectId(input.sprintId) : null;
    }
    const targetStatus = input.status ?? current.status;
    if (input.status !== undefined) set.status = input.status;
    if (input.order !== undefined) {
      set.order = input.order;
    } else if (input.status !== undefined && input.status !== current.status) {
      // Moving to a new column with no explicit order → append to the end.
      set.order = (await this.repo.maxOrder(orgId, current.projectId.toString(), targetStatus)) + ORDER_GAP;
    }

    const updated = await runInTransaction(this.connection, async (session) => {
      const next = await this.repo.updateById(orgId, id, { $set: set }, session);
      if (!next) throw AppException.notFound('Task not found');
      // Sprint membership and/or done-status may have changed → refresh totals.
      await this.recomputeSprints(orgId, [current.sprintId, next.sprintId], session);
      return next;
    });

    await this.emit('task.moved', updated, actorId, meta, {
      verb: 'moved',
      before: {
        sprintId: current.sprintId ? current.sprintId.toString() : null,
        status: current.status,
        order: current.order,
      },
      after: {
        sprintId: updated.sprintId ? updated.sprintId.toString() : null,
        status: updated.status,
        order: updated.order,
      },
    });
    return toTaskDTO(updated);
  }

  async deleteTask(orgId: string, actorId: string, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.requireTask(orgId, id);
    await runInTransaction(this.connection, async (session) => {
      const ok = await this.repo.softDelete(orgId, id, session);
      if (!ok) throw AppException.notFound('Task not found');
      if (current.sprintId) {
        await this.sprints.recomputePoints(orgId, current.sprintId.toString(), session);
      }
    });
    await this.emit('task.deleted', current, actorId, meta, { verb: 'deleted' });
  }

  async undoDelete(orgId: string, actorId: string, id: string, meta: RequestMeta): Promise<TaskDTO> {
    const ok = await this.repo.restoreDeleted(orgId, id);
    if (!ok) throw AppException.notFound('Deleted task not found');
    const restored = await this.requireTask(orgId, id);
    if (restored.sprintId) {
      await this.sprints.recomputePoints(orgId, restored.sprintId.toString());
    }
    await this.emit('task.undeleted', restored, actorId, meta, { verb: 'restored' });
    return toTaskDTO(restored);
  }

  async bulkUpdate(
    orgId: string,
    actorId: string,
    input: BulkUpdateTasksInput,
    meta: RequestMeta,
  ): Promise<{ updated: number }> {
    const tasks = await this.repo.findByIds(orgId, input.ids);
    if (tasks.length === 0) return { updated: 0 };

    const set: Record<string, unknown> = {};
    const p = input.patch;
    if (p.status !== undefined) set.status = p.status;
    if (p.priority !== undefined) set.priority = p.priority;
    if (p.assigneeId !== undefined) set.assigneeId = p.assigneeId ? new Types.ObjectId(p.assigneeId) : null;
    if (p.sprintId !== undefined) set.sprintId = p.sprintId ? new Types.ObjectId(p.sprintId) : null;
    if (p.labelIds !== undefined) set.labelIds = p.labelIds.map((lid) => new Types.ObjectId(lid));
    if (p.storyPoints !== undefined) set.storyPoints = p.storyPoints;
    if (p.dueDate !== undefined) set.dueDate = toDate(p.dueDate);

    if (p.sprintId) {
      for (const task of tasks) {
        await this.sprints.assertSprintInProject(orgId, task.projectId.toString(), p.sprintId);
      }
    }

    const affects = affectsPoints(p);
    const affectedSprints = new Set<string>();
    if (affects) {
      for (const task of tasks) if (task.sprintId) affectedSprints.add(task.sprintId.toString());
      if (p.sprintId) affectedSprints.add(p.sprintId);
    }

    const ids = tasks.map((t) => t._id.toString());
    const count = await runInTransaction(this.connection, async (session) => {
      const modified = await this.repo.updateMany(orgId, ids, { $set: set }, session);
      for (const sprintId of affectedSprints) {
        await this.sprints.recomputePoints(orgId, sprintId, session);
      }
      return modified;
    });

    for (const task of tasks) {
      await this.emit('task.updated', task, actorId, meta, {
        verb: 'updated',
        before: pick(snapshot(task), Object.keys(set)),
        after: set,
      });
    }
    return { updated: count };
  }

  async bulkDelete(
    orgId: string,
    actorId: string,
    input: BulkDeleteTasksInput,
    meta: RequestMeta,
  ): Promise<{ deleted: number }> {
    const tasks = await this.repo.findByIds(orgId, input.ids);
    if (tasks.length === 0) return { deleted: 0 };

    const affectedSprints = new Set<string>();
    for (const task of tasks) if (task.sprintId) affectedSprints.add(task.sprintId.toString());

    const ids = tasks.map((t) => t._id.toString());
    const count = await runInTransaction(this.connection, async (session) => {
      const modified = await this.repo.updateMany(
        orgId,
        ids,
        { $set: { isDeleted: true, deletedAt: new Date() } },
        session,
      );
      for (const sprintId of affectedSprints) {
        await this.sprints.recomputePoints(orgId, sprintId, session);
      }
      return modified;
    });

    for (const task of tasks) {
      await this.emit('task.deleted', task, actorId, meta, { verb: 'deleted' });
    }
    return { deleted: count };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async recomputeSprints(
    orgId: string,
    sprintIds: Array<Types.ObjectId | null | undefined>,
    session?: ClientSession,
  ): Promise<void> {
    const unique = new Set(sprintIds.filter(Boolean).map((s) => s!.toString()));
    for (const sprintId of unique) {
      await this.sprints.recomputePoints(orgId, sprintId, session);
    }
  }

  private async requireTask(orgId: string, id: string): Promise<TaskLean> {
    const task = await this.repo.findById(orgId, id);
    if (!task) throw AppException.notFound('Task not found');
    return task;
  }

  private async emit(
    name: DomainEventName,
    task: TaskLean,
    actorId: string,
    meta: RequestMeta,
    extra: {
      verb: string;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const id = task._id.toString();
    await this.events.publish({
      name,
      orgId: task.orgId.toString(),
      actorId,
      source: 'ui',
      entity: { type: 'task', id },
      before: extra.before ?? null,
      after: extra.after ?? null,
      verb: extra.verb,
      object: { type: 'task', id, label: `${task.key} ${task.title}`.trim() },
      projectId: task.projectId.toString(),
      requestId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

function toDate(value?: string | null): Date | null {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A change affects sprint point totals if it touches membership, points, or done-ness. */
function affectsPoints(patch: {
  sprintId?: unknown;
  status?: unknown;
  storyPoints?: unknown;
}): boolean {
  return patch.sprintId !== undefined || patch.status !== undefined || patch.storyPoints !== undefined;
}

function snapshot(task: TaskLean): Record<string, unknown> {
  return {
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ? task.assigneeId.toString() : null,
    sprintId: task.sprintId ? task.sprintId.toString() : null,
    storyPoints: task.storyPoints ?? null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    labelIds: (task.labelIds ?? []).map((lid) => lid.toString()),
    order: task.order,
  };
}

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (key in obj) out[key] = obj[key] ?? null;
  return out;
}

function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key] ?? null;
      a[key] = after[key] ?? null;
    }
  }
  return { before: b, after: a };
}

function splitCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseSort(sort?: string): Record<string, SortOrder> | undefined {
  if (!sort) return undefined;
  const parsed: Record<string, SortOrder> = {};
  for (const raw of sort.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const desc = token.startsWith('-');
    const field = token.replace(/^[-+]/, '');
    if ((TASK_SORT_FIELDS as readonly string[]).includes(field)) {
      parsed[field] = desc ? -1 : 1;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}
