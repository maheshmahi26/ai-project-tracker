import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  CreateLabelInput,
  LabelDTO,
  ListLabelsQuery,
  UpdateLabelInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import type { RequestMeta } from '../auth/auth.service';
import { DomainEventBus } from '../events/domain-event-bus';
import type { DomainEventName } from '../events/domain-event';
import { ProjectsRepository } from '../projects/projects.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { LabelsRepository, type LabelLean } from './labels.repository';
import { toLabelDTO } from './labels.mapper';

@Injectable()
export class LabelsService {
  constructor(
    private readonly repo: LabelsRepository,
    private readonly projects: ProjectsRepository,
    private readonly tasks: TasksRepository,
    private readonly events: DomainEventBus,
  ) {}

  async create(
    orgId: string,
    actorId: string,
    input: CreateLabelInput,
    meta: RequestMeta,
  ): Promise<LabelDTO> {
    if (input.projectId) await this.requireProject(orgId, input.projectId);

    let label: LabelLean;
    try {
      label = await this.repo.create({
        orgId: new Types.ObjectId(orgId),
        projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
        name: input.name,
        color: input.color,
      });
    } catch (err) {
      throw duplicateOr(err, 'A label with this name already exists in this scope');
    }

    await this.emit('label.created', label, actorId, meta, { verb: 'created label' });
    return toLabelDTO(label);
  }

  async list(orgId: string, query: ListLabelsQuery): Promise<PaginatedResult<LabelDTO>> {
    const rows = await this.repo.list({
      orgId,
      projectId: query.projectId,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toLabelDTO), query.limit, (l) => l.id);
  }

  async update(
    orgId: string,
    actorId: string,
    id: string,
    input: UpdateLabelInput,
    meta: RequestMeta,
  ): Promise<LabelDTO> {
    await this.requireLabel(orgId, id);
    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.color !== undefined) set.color = input.color;

    let updated: LabelLean | null;
    try {
      updated = await this.repo.updateById(orgId, id, { $set: set });
    } catch (err) {
      throw duplicateOr(err, 'A label with this name already exists in this scope');
    }
    if (!updated) throw AppException.notFound('Label not found');

    await this.emit('label.updated', updated, actorId, meta, { verb: 'updated label' });
    return toLabelDTO(updated);
  }

  async remove(orgId: string, actorId: string, id: string, meta: RequestMeta): Promise<void> {
    const label = await this.requireLabel(orgId, id);
    const ok = await this.repo.deleteById(orgId, id);
    if (!ok) throw AppException.notFound('Label not found');
    // Detach from every task that referenced it so no dangling ids remain.
    await this.tasks.pullLabel(orgId, id);
    await this.emit('label.deleted', label, actorId, meta, { verb: 'deleted label' });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async requireLabel(orgId: string, id: string): Promise<LabelLean> {
    const label = await this.repo.findById(orgId, id);
    if (!label) throw AppException.notFound('Label not found');
    return label;
  }

  private async requireProject(orgId: string, projectId: string): Promise<void> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw AppException.notFound('Project not found');
  }

  private async emit(
    name: DomainEventName,
    label: LabelLean,
    actorId: string,
    meta: RequestMeta,
    extra: { verb: string },
  ): Promise<void> {
    const id = label._id.toString();
    await this.events.publish({
      name,
      orgId: label.orgId.toString(),
      actorId,
      source: 'ui',
      entity: { type: 'label', id },
      verb: extra.verb,
      object: { type: 'label', id, label: label.name },
      projectId: label.projectId ? label.projectId.toString() : null,
      requestId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

function duplicateOr(err: unknown, message: string): AppException {
  if ((err as { code?: number }).code === 11000) return AppException.conflict(message);
  return err instanceof AppException ? err : AppException.businessRule('Failed to save label');
}
