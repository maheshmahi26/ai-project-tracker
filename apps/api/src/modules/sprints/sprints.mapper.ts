import type { SprintDTO } from '@ai-projectos/shared';
import type { SprintLean } from './sprints.repository';

export function toSprintDTO(sprint: SprintLean): SprintDTO {
  return {
    id: sprint._id.toString(),
    orgId: sprint.orgId.toString(),
    projectId: sprint.projectId.toString(),
    name: sprint.name,
    goal: sprint.goal ?? null,
    status: sprint.status,
    startDate: sprint.startDate ? sprint.startDate.toISOString() : null,
    endDate: sprint.endDate ? sprint.endDate.toISOString() : null,
    capacityPoints: sprint.capacityPoints ?? null,
    committedPoints: sprint.committedPoints ?? 0,
    completedPoints: sprint.completedPoints ?? 0,
    createdAt: sprint.createdAt.toISOString(),
    updatedAt: sprint.updatedAt.toISOString(),
  };
}
