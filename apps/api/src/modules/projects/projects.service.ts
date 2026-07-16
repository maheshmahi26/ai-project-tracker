import { Injectable } from '@nestjs/common';
import { SortOrder, Types } from 'mongoose';
import {
  PROJECT_SORT_FIELDS,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectDTO,
  type UpdateProjectInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import {
  buildCursorPage,
  decodeCursor,
  PaginatedResult,
} from '../../common/pagination/pagination';
import type { RequestMeta } from '../auth/auth.service';
import { DomainEventBus } from '../events/domain-event-bus';
import type { DomainEventName } from '../events/domain-event';
import { ProjectsRepository, type ProjectLean } from './projects.repository';
import { deriveKeyBase, toProjectDTO } from './projects.mapper';

const MAX_KEY_ATTEMPTS = 50;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly repo: ProjectsRepository,
    private readonly events: DomainEventBus,
  ) {}

  async createProject(
    orgId: string,
    actorId: string,
    input: CreateProjectInput,
    meta: RequestMeta,
  ): Promise<ProjectDTO> {
    const key = input.key
      ? await this.ensureKeyAvailable(orgId, input.key)
      : await this.generateKey(orgId, input.name);

    let project: ProjectLean;
    try {
      project = await this.repo.create({
        orgId: new Types.ObjectId(orgId),
        key,
        name: input.name,
        description: input.description ?? null,
        leadId: input.leadId ? new Types.ObjectId(input.leadId) : null,
        status: 'active',
        color: input.color ?? '#4f46e5',
        startDate: toDate(input.startDate),
        targetDate: toDate(input.targetDate),
        counters: { taskSeq: 0 },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppException.conflict(`A project with key "${key}" already exists`);
      }
      throw error;
    }

    await this.emit('project.created', project, actorId, meta, {
      verb: 'created',
      after: snapshot(project),
    });
    return toProjectDTO(project);
  }

  async getProject(orgId: string, id: string): Promise<ProjectDTO> {
    const project = await this.repo.findById(orgId, id);
    if (!project) throw AppException.notFound('Project not found');
    return toProjectDTO(project);
  }

  async listProjects(
    orgId: string,
    query: ListProjectsQuery,
  ): Promise<PaginatedResult<ProjectDTO>> {
    const useOffset =
      query.page !== undefined ||
      query.pageSize !== undefined ||
      Boolean(query.sort) ||
      Boolean(query.q);

    if (useOffset) {
      const limit = query.pageSize ?? query.limit;
      const page = query.page ?? 1;
      const skip = (page - 1) * limit;
      const { rows, total } = await this.repo.listOffset({
        orgId,
        status: query.status,
        q: query.q,
        sort: parseSort(query.sort),
        skip,
        limit,
      });
      return new PaginatedResult(
        rows.map(toProjectDTO),
        { hasMore: skip + rows.length < total, nextCursor: null, total },
      );
    }

    const rows = await this.repo.listCursor({
      orgId,
      status: query.status,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toProjectDTO), query.limit, (item) => item.id);
  }

  async updateProject(
    orgId: string,
    actorId: string,
    id: string,
    input: UpdateProjectInput,
    meta: RequestMeta,
  ): Promise<ProjectDTO> {
    const current = await this.repo.findById(orgId, id);
    if (!current) throw AppException.notFound('Project not found');

    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.description !== undefined) set.description = input.description;
    if (input.color !== undefined) set.color = input.color;
    if (input.leadId !== undefined) {
      set.leadId = input.leadId ? new Types.ObjectId(input.leadId) : null;
    }
    if (input.startDate !== undefined) set.startDate = toDate(input.startDate);
    if (input.targetDate !== undefined) set.targetDate = toDate(input.targetDate);

    if (Object.keys(set).length === 0) return toProjectDTO(current);

    const updated = await this.repo.updateById(orgId, id, { $set: set });
    if (!updated) throw AppException.notFound('Project not found');

    const { before, after } = diffSnapshots(snapshot(current), snapshot(updated), Object.keys(set));
    await this.emit('project.updated', updated, actorId, meta, {
      verb: 'updated',
      before,
      after,
    });
    return toProjectDTO(updated);
  }

  async archiveProject(
    orgId: string,
    actorId: string,
    id: string,
    meta: RequestMeta,
  ): Promise<ProjectDTO> {
    const current = await this.repo.findById(orgId, id);
    if (!current) throw AppException.notFound('Project not found');
    if (current.status === 'archived') {
      throw AppException.businessRule('Project is already archived');
    }
    const updated = await this.repo.updateById(orgId, id, { $set: { status: 'archived' } });
    if (!updated) throw AppException.notFound('Project not found');

    await this.emit('project.archived', updated, actorId, meta, {
      verb: 'archived',
      before: { status: 'active' },
      after: { status: 'archived' },
    });
    return toProjectDTO(updated);
  }

  async restoreProject(
    orgId: string,
    actorId: string,
    id: string,
    meta: RequestMeta,
  ): Promise<ProjectDTO> {
    const current = await this.repo.findById(orgId, id);
    if (!current) throw AppException.notFound('Project not found');
    if (current.status === 'active') {
      throw AppException.businessRule('Project is not archived');
    }
    const updated = await this.repo.updateById(orgId, id, { $set: { status: 'active' } });
    if (!updated) throw AppException.notFound('Project not found');

    await this.emit('project.restored', updated, actorId, meta, {
      verb: 'restored',
      before: { status: 'archived' },
      after: { status: 'active' },
    });
    return toProjectDTO(updated);
  }

  async deleteProject(orgId: string, actorId: string, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.repo.findById(orgId, id);
    if (!current) throw AppException.notFound('Project not found');
    const ok = await this.repo.softDelete(orgId, id);
    if (!ok) throw AppException.notFound('Project not found');

    await this.emit('project.deleted', current, actorId, meta, { verb: 'deleted' });
  }

  async undoDelete(
    orgId: string,
    actorId: string,
    id: string,
    meta: RequestMeta,
  ): Promise<ProjectDTO> {
    const ok = await this.repo.restoreDeleted(orgId, id);
    if (!ok) throw AppException.notFound('Deleted project not found');
    const restored = await this.repo.findById(orgId, id);
    if (!restored) throw AppException.notFound('Project not found');

    await this.emit('project.undeleted', restored, actorId, meta, { verb: 'restored' });
    return toProjectDTO(restored);
  }

  /**
   * Atomically allocate the next task number for `KEY-<n>` (used by Tasks in
   * TASK-09). Kept here because the counter lives on the project document.
   */
  async allocateTaskNumber(orgId: string, projectId: string): Promise<{ key: string; seq: number }> {
    const project = await this.repo.findById(orgId, projectId);
    if (!project) throw AppException.notFound('Project not found');
    const seq = await this.repo.nextTaskSeq(orgId, projectId);
    if (seq === null) throw AppException.notFound('Project not found');
    return { key: `${project.key}-${seq}`, seq };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async ensureKeyAvailable(orgId: string, key: string): Promise<string> {
    const normalized = key.toUpperCase();
    const existing = await this.repo.findByKey(orgId, normalized);
    if (existing) throw AppException.conflict(`A project with key "${normalized}" already exists`);
    return normalized;
  }

  private async generateKey(orgId: string, name: string): Promise<string> {
    const base = deriveKeyBase(name);
    for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${attempt + 1}`.slice(0, 10);
      const existing = await this.repo.findByKey(orgId, candidate);
      if (!existing) return candidate;
    }
    throw AppException.conflict('Could not allocate a unique project key');
  }

  private async emit(
    name: DomainEventName,
    project: ProjectLean,
    actorId: string,
    meta: RequestMeta,
    extra: {
      verb: string;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const id = project._id.toString();
    await this.events.publish({
      name,
      orgId: project.orgId.toString(),
      actorId,
      source: 'ui',
      entity: { type: 'project', id },
      before: extra.before ?? null,
      after: extra.after ?? null,
      verb: extra.verb,
      object: { type: 'project', id, label: project.name },
      projectId: id,
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

function snapshot(project: ProjectLean): Record<string, unknown> {
  return {
    name: project.name,
    description: project.description ?? null,
    status: project.status,
    color: project.color,
    leadId: project.leadId ? project.leadId.toString() : null,
    startDate: project.startDate ? project.startDate.toISOString() : null,
    targetDate: project.targetDate ? project.targetDate.toISOString() : null,
  };
}

/** Reduce two snapshots to only the fields that changed among `keys`. */
function diffSnapshots(
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

function parseSort(sort?: string): Record<string, SortOrder> {
  if (!sort) return { createdAt: -1, _id: -1 };
  const parsed: Record<string, SortOrder> = {};
  for (const raw of sort.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const desc = token.startsWith('-');
    const field = token.replace(/^[-+]/, '');
    if ((PROJECT_SORT_FIELDS as readonly string[]).includes(field)) {
      parsed[field] = desc ? -1 : 1;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : { createdAt: -1, _id: -1 };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
