import type { TaskDTO } from '@ai-projectos/shared';
import type { TaskLean } from './tasks.repository';

export function toTaskDTO(task: TaskLean, parentKey?: string | null): TaskDTO {
  return {
    id: task._id.toString(),
    orgId: task.orgId.toString(),
    projectId: task.projectId.toString(),
    sprintId: task.sprintId ? task.sprintId.toString() : null,
    key: task.key,
    parentId: task.parentId ? task.parentId.toString() : null,
    parentKey: parentKey ?? null,
    title: task.title,
    description: task.description ?? null,
    type: task.type ?? 'task',
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ? task.assigneeId.toString() : null,
    reporterId: task.reporterId.toString(),
    labelIds: (task.labelIds ?? []).map((id) => id.toString()),
    storyPoints: task.storyPoints ?? null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    order: task.order ?? 0,
    attachmentsCount: task.attachmentsCount ?? 0,
    commentsCount: task.commentsCount ?? 0,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
