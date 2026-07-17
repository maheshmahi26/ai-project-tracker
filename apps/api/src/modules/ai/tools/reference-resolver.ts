import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../../../common/errors/app-exception';
import { ProjectsRepository } from '../../projects/projects.repository';
import { TasksRepository } from '../../tasks/tasks.repository';
import { SprintsService } from '../../sprints/sprints.service';
import { MembershipsService } from '../../organizations/memberships.service';

interface Candidate {
  id: string;
  label: string;
}

const isObjectId = (value: string): boolean => Types.ObjectId.isValid(value) && value.length === 24;

/**
 * Translates the natural-language references an LLM produces (a project key like
 * "AUTH", a person's name "Mahesh", a task key "AUTH-12", a sprint name) into the
 * ObjectIds the Application services expect. Every lookup is org-scoped.
 *
 * When a reference is ambiguous the resolver throws a VALIDATION_ERROR that lists
 * the candidates, so the agent can surface the options and ask the user to pick —
 * exactly the disambiguation loop a human would go through in the UI.
 */
@Injectable()
export class ReferenceResolver {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly tasks: TasksRepository,
    private readonly sprints: SprintsService,
    private readonly members: MembershipsService,
  ) {}

  /** Resolve a project reference (ObjectId, key, or name) to its id. */
  async projectId(orgId: string, ref: string): Promise<string> {
    const value = ref.trim();
    if (isObjectId(value)) {
      const byId = await this.projects.findById(orgId, value);
      if (byId) return byId._id.toString();
    }

    const byKey = await this.projects.findByKey(orgId, value.toUpperCase());
    if (byKey) return byKey._id.toString();

    const { rows } = await this.projects.listOffset({
      orgId,
      status: 'all',
      q: value,
      skip: 0,
      limit: 10,
    });
    const candidates = rows.map((p) => ({ id: p._id.toString(), label: `${p.key} — ${p.name}` }));
    return this.pick('project', value, candidates);
  }

  /** Resolve a member reference (ObjectId, email, or name) to a userId in the org. */
  async memberId(orgId: string, ref: string): Promise<string> {
    const value = ref.trim();
    const members = await this.members.listOrgMembers(orgId);

    if (isObjectId(value)) {
      const hit = members.find((m) => m.userId === value);
      if (hit) return hit.userId;
    }

    const lower = value.toLowerCase();
    const byEmail = members.filter((m) => (m.user?.email ?? '').toLowerCase() === lower);
    if (byEmail.length === 1) return byEmail[0]!.userId;

    const exactName = members.filter((m) => (m.user?.name ?? '').toLowerCase() === lower);
    const pool = exactName.length > 0 ? exactName : members.filter((m) => (m.user?.name ?? '').toLowerCase().includes(lower));
    const candidates = pool.map((m) => ({
      id: m.userId,
      label: `${m.user?.name ?? 'Unknown'} <${m.user?.email ?? '?'}>`,
    }));
    return this.pick('member', value, candidates);
  }

  /** Resolve a task reference (ObjectId or key like "AUTH-12") to its id. */
  async taskId(orgId: string, ref: string): Promise<string> {
    const value = ref.trim();
    if (isObjectId(value)) {
      const byId = await this.tasks.findById(orgId, value);
      if (byId) return byId._id.toString();
    }
    const byKey = await this.tasks.findByKey(orgId, value.toUpperCase());
    if (byKey) return byKey._id.toString();
    throw AppException.notFound(`No task matches "${value}"`);
  }

  /** Resolve a sprint reference (ObjectId or name) within a project to its id. */
  async sprintId(orgId: string, projectId: string, ref: string): Promise<string> {
    const value = ref.trim();
    const { items } = await this.sprints.listSprints(orgId, projectId, {
      status: 'all',
      limit: 100,
    });
    if (isObjectId(value)) {
      const byId = items.find((s) => s.id === value);
      if (byId) return byId.id;
    }
    const lower = value.toLowerCase();
    const exact = items.filter((s) => s.name.toLowerCase() === lower);
    const pool = exact.length > 0 ? exact : items.filter((s) => s.name.toLowerCase().includes(lower));
    const candidates = pool.map((s) => ({ id: s.id, label: s.name }));
    return this.pick('sprint', value, candidates);
  }

  private pick(kind: string, ref: string, candidates: Candidate[]): string {
    if (candidates.length === 1) return candidates[0]!.id;
    if (candidates.length === 0) {
      throw AppException.notFound(`No ${kind} matches "${ref}"`);
    }
    throw AppException.validation(
      `Multiple ${kind}s match "${ref}". Ask the user which one they mean, then pass its id.`,
      candidates.map((c) => ({ path: c.id, issue: c.label })),
    );
  }
}
