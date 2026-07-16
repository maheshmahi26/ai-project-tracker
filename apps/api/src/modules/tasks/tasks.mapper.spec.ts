import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { toTaskDTO } from './tasks.mapper';
import type { TaskLean } from './tasks.repository';

function lean(overrides: Partial<TaskLean> = {}): TaskLean {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: new Types.ObjectId(),
    orgId: new Types.ObjectId(),
    projectId: new Types.ObjectId(),
    sprintId: null,
    key: 'AUTH-1',
    parentId: null,
    title: 'Do the thing',
    description: null,
    status: 'backlog',
    priority: 'medium',
    assigneeId: null,
    reporterId: new Types.ObjectId(),
    labelIds: [],
    storyPoints: null,
    dueDate: null,
    order: 1000,
    attachmentsCount: 0,
    commentsCount: 0,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as TaskLean;
}

describe('toTaskDTO', () => {
  it('serializes ids and dates to strings', () => {
    const sprintId = new Types.ObjectId();
    const assigneeId = new Types.ObjectId();
    const dto = toTaskDTO(lean({ sprintId, assigneeId, storyPoints: 5, status: 'done' }));

    expect(dto.key).toBe('AUTH-1');
    expect(dto.sprintId).toBe(sprintId.toString());
    expect(dto.assigneeId).toBe(assigneeId.toString());
    expect(dto.storyPoints).toBe(5);
    expect(dto.status).toBe('done');
    expect(typeof dto.createdAt).toBe('string');
  });

  it('defaults nullable fields', () => {
    const dto = toTaskDTO(lean());
    expect(dto.sprintId).toBeNull();
    expect(dto.assigneeId).toBeNull();
    expect(dto.parentId).toBeNull();
    expect(dto.labelIds).toEqual([]);
    expect(dto.order).toBe(1000);
  });
});
