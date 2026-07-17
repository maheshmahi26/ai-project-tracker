import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import {
  type CreateSprintInput,
  type ListSprintsQuery,
  type SprintDTO,
  type UpdateSprintInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { runInTransaction } from '../../common/db/transaction';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import type { RequestMeta } from '../auth/auth.service';
import { DomainEventBus } from '../events/domain-event-bus';
import type { DomainEventName } from '../events/domain-event';
import { ProjectsRepository } from '../projects/projects.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { SprintsRepository, type SprintLean } from './sprints.repository';
import { toSprintDTO } from './sprints.mapper';

@Injectable()
export class SprintsService {
  constructor(
    private readonly repo: SprintsRepository,
    private readonly tasks: TasksRepository,
    private readonly projects: ProjectsRepository,
    private readonly events: DomainEventBus,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async createSprint(
    orgId: string,
    actorId: string,
    projectId: string,
    input: CreateSprintInput,
    meta: RequestMeta,
  ): Promise<SprintDTO> {
    await this.requireProject(orgId, projectId);

    const sprint = await this.repo.create({
      orgId: new Types.ObjectId(orgId),
      projectId: new Types.ObjectId(projectId),
      name: input.name,
      goal: input.goal ?? null,
      status: 'planned',
      startDate: toDate(input.startDate),
      endDate: toDate(input.endDate),
      capacityPoints: input.capacityPoints ?? null,
      committedPoints: 0,
      completedPoints: 0,
    });

    await this.emit('sprint.created', sprint, actorId, meta, {
      verb: 'created',
      after: snapshot(sprint),
    });
    return toSprintDTO(sprint);
  }

  async getSprint(orgId: string, id: string): Promise<SprintDTO> {
    return toSprintDTO(await this.requireSprint(orgId, id));
  }

  async listSprints(
    orgId: string,
    projectId: string,
    query: ListSprintsQuery,
  ): Promise<PaginatedResult<SprintDTO>> {
    const rows = await this.repo.listCursor({
      orgId,
      projectId,
      status: query.status,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toSprintDTO), query.limit, (item) => item.id);
  }

  async updateSprint(
    orgId: string,
    actorId: string,
    id: string,
    input: UpdateSprintInput,
    meta: RequestMeta,
  ): Promise<SprintDTO> {
    const current = await this.requireSprint(orgId, id);

    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.goal !== undefined) set.goal = input.goal;
    if (input.startDate !== undefined) set.startDate = toDate(input.startDate);
    if (input.endDate !== undefined) set.endDate = toDate(input.endDate);
    if (input.capacityPoints !== undefined) set.capacityPoints = input.capacityPoints;

    if (Object.keys(set).length === 0) return toSprintDTO(current);

    const updated = await this.repo.updateById(orgId, id, { $set: set });
    if (!updated) throw AppException.notFound('Sprint not found');

    const { before, after } = diff(snapshot(current), snapshot(updated), Object.keys(set));
    await this.emit('sprint.updated', updated, actorId, meta, { verb: 'updated', before, after });
    return toSprintDTO(updated);
  }

  async startSprint(orgId: string, actorId: string, id: string, meta: RequestMeta): Promise<SprintDTO> {
    const current = await this.requireSprint(orgId, id);
    if (current.status === 'active') throw AppException.businessRule('Sprint is already active');
    if (current.status === 'completed') throw AppException.businessRule('Sprint is completed');

    const set: Record<string, unknown> = { status: 'active' };
    if (!current.startDate) set.startDate = new Date();
    const updated = await this.repo.updateById(orgId, id, { $set: set });
    if (!updated) throw AppException.notFound('Sprint not found');

    await this.emit('sprint.started', updated, actorId, meta, {
      verb: 'started',
      before: { status: current.status },
      after: { status: 'active' },
    });
    return toSprintDTO(updated);
  }

  async completeSprint(
    orgId: string,
    actorId: string,
    id: string,
    meta: RequestMeta,
  ): Promise<SprintDTO> {
    const current = await this.requireSprint(orgId, id);
    if (current.status === 'completed') throw AppException.businessRule('Sprint is already completed');

    const totals = await this.tasks.sumPointsBySprint(orgId, id);
    const set: Record<string, unknown> = {
      status: 'completed',
      committedPoints: totals.committed,
      completedPoints: totals.completed,
    };
    if (!current.endDate) set.endDate = new Date();
    const updated = await this.repo.updateById(orgId, id, { $set: set });
    if (!updated) throw AppException.notFound('Sprint not found');

    await this.emit('sprint.completed', updated, actorId, meta, {
      verb: 'completed',
      before: { status: current.status },
      after: { status: 'completed', completedPoints: totals.completed },
    });
    return toSprintDTO(updated);
  }

  async deleteSprint(orgId: string, actorId: string, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.requireSprint(orgId, id);

    // Soft-delete the sprint and detach its tasks atomically (on a replica set).
    await runInTransaction(this.connection, async (session) => {
      const deleted = await this.repo.updateById(
        orgId,
        id,
        { $set: { isDeleted: true, deletedAt: new Date() } },
        session,
      );
      if (!deleted) throw AppException.notFound('Sprint not found');
      await this.tasks.detachSprint(orgId, id, session);
    });

    await this.emit('sprint.deleted', current, actorId, meta, { verb: 'deleted' });
  }

  /**
   * Recompute committed/completed points for a sprint from its tasks. Called by
   * TasksService after any change that affects sprint membership, points, or
   * status. Threads the session so it commits atomically with the task write.
   */
  async recomputePoints(orgId: string, sprintId: string, session?: ClientSession): Promise<void> {
    const totals = await this.tasks.sumPointsBySprint(orgId, sprintId, session);
    await this.repo.updateById(
      orgId,
      sprintId,
      { $set: { committedPoints: totals.committed, completedPoints: totals.completed } },
      session,
    );
  }

  /** Validate a sprint belongs to the org + project (used by TasksService). */
  async assertSprintInProject(orgId: string, projectId: string, sprintId: string): Promise<void> {
    const sprint = await this.repo.findById(orgId, sprintId);
    if (!sprint || sprint.projectId.toString() !== projectId) {
      throw AppException.businessRule('Sprint does not belong to this project');
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async requireSprint(orgId: string, id: string): Promise<SprintLean> {
    const sprint = await this.repo.findById(orgId, id);
    if (!sprint) throw AppException.notFound('Sprint not found');
    return sprint;
  }

  private async requireProject(orgId: string, projectId: string): Promise<void> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw AppException.notFound('Project not found');
  }

  private async emit(
    name: DomainEventName,
    sprint: SprintLean,
    actorId: string,
    meta: RequestMeta,
    extra: {
      verb: string;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const id = sprint._id.toString();
    await this.events.publish({
      name,
      orgId: sprint.orgId.toString(),
      actorId,
      source: meta.source ?? 'ui',
      actorType: meta.actorType ?? 'user',
      entity: { type: 'sprint', id },
      before: extra.before ?? null,
      after: extra.after ?? null,
      verb: extra.verb,
      object: { type: 'sprint', id, label: sprint.name },
      projectId: sprint.projectId.toString(),
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

function snapshot(sprint: SprintLean): Record<string, unknown> {
  return {
    name: sprint.name,
    goal: sprint.goal ?? null,
    status: sprint.status,
    startDate: sprint.startDate ? sprint.startDate.toISOString() : null,
    endDate: sprint.endDate ? sprint.endDate.toISOString() : null,
    capacityPoints: sprint.capacityPoints ?? null,
  };
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
