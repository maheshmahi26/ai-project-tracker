import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  CommentDTO,
  CreateCommentInput,
  ListCommentsQuery,
  UpdateCommentInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import type { RequestMeta } from '../auth/auth.service';
import { DomainEventBus } from '../events/domain-event-bus';
import type { DomainEventName } from '../events/domain-event';
import { MembershipsRepository } from '../organizations/memberships.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksRepository, type TaskLean } from '../tasks/tasks.repository';
import { CommentsRepository, type CommentLean } from './comments.repository';
import { toCommentDTO } from './comments.mapper';

@Injectable()
export class CommentsService {
  constructor(
    private readonly repo: CommentsRepository,
    private readonly tasks: TasksRepository,
    private readonly memberships: MembershipsRepository,
    private readonly notifications: NotificationsService,
    private readonly events: DomainEventBus,
  ) {}

  async create(
    orgId: string,
    actorId: string,
    taskId: string,
    input: CreateCommentInput,
    meta: RequestMeta,
  ): Promise<CommentDTO> {
    const task = await this.requireTask(orgId, taskId);
    const mentions = await this.resolveMentions(orgId, input.mentions);

    const comment = await this.repo.create({
      orgId: new Types.ObjectId(orgId),
      taskId: new Types.ObjectId(taskId),
      authorId: new Types.ObjectId(actorId),
      body: input.body,
      mentions: mentions.map((m) => new Types.ObjectId(m)),
    });
    await this.tasks.updateById(orgId, taskId, { $inc: { commentsCount: 1 } });

    if (mentions.length > 0) {
      await this.notifications.fanOut({
        orgId,
        recipientIds: mentions,
        type: 'mention',
        title: `You were mentioned on ${task.key} ${task.title}`.trim(),
        body: null,
        entity: { type: 'comment', id: comment._id.toString() },
        excludeUserId: actorId,
      });
    }

    await this.emit('comment.created', comment, task, actorId, meta, { verb: 'commented on' });
    return toCommentDTO(comment);
  }

  async list(
    orgId: string,
    taskId: string,
    query: ListCommentsQuery,
  ): Promise<PaginatedResult<CommentDTO>> {
    await this.requireTask(orgId, taskId);
    const rows = await this.repo.listByTask({
      orgId,
      taskId,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toCommentDTO), query.limit, (c) => c.id);
  }

  async update(
    orgId: string,
    actorId: string,
    taskId: string,
    id: string,
    input: UpdateCommentInput,
    meta: RequestMeta,
  ): Promise<CommentDTO> {
    const current = await this.requireComment(orgId, taskId, id);
    if (current.authorId.toString() !== actorId) {
      throw AppException.forbidden('You can only edit your own comments');
    }

    const set: Record<string, unknown> = { editedAt: new Date() };
    if (input.body !== undefined) set.body = input.body;

    let mentions = (current.mentions ?? []).map((m) => m.toString());
    if (input.mentions !== undefined) {
      mentions = await this.resolveMentions(orgId, input.mentions);
      set.mentions = mentions.map((m) => new Types.ObjectId(m));
    }

    const updated = await this.repo.updateById(orgId, id, { $set: set });
    if (!updated) throw AppException.notFound('Comment not found');

    const task = await this.requireTask(orgId, taskId);
    await this.emit('comment.updated', updated, task, actorId, meta, { verb: 'edited a comment on' });
    return toCommentDTO(updated);
  }

  async remove(
    orgId: string,
    actorId: string,
    taskId: string,
    id: string,
    meta: RequestMeta,
  ): Promise<void> {
    const current = await this.requireComment(orgId, taskId, id);
    if (current.authorId.toString() !== actorId) {
      throw AppException.forbidden('You can only delete your own comments');
    }
    const ok = await this.repo.softDelete(orgId, id);
    if (!ok) throw AppException.notFound('Comment not found');
    await this.tasks.updateById(orgId, taskId, { $inc: { commentsCount: -1 } });

    const task = await this.tasks.findById(orgId, taskId);
    if (task) {
      await this.emit('comment.deleted', current, task, actorId, meta, {
        verb: 'deleted a comment on',
      });
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async requireTask(orgId: string, taskId: string): Promise<TaskLean> {
    const task = await this.tasks.findById(orgId, taskId);
    if (!task) throw AppException.notFound('Task not found');
    return task;
  }

  private async requireComment(orgId: string, taskId: string, id: string): Promise<CommentLean> {
    const comment = await this.repo.findById(orgId, id);
    if (!comment || comment.taskId.toString() !== taskId) {
      throw AppException.notFound('Comment not found');
    }
    return comment;
  }

  /** Keep only mentions that are active members of the org (drops the rest). */
  private async resolveMentions(orgId: string, mentions?: string[]): Promise<string[]> {
    if (!mentions || mentions.length === 0) return [];
    const members = await this.memberships.listByOrg(orgId);
    const active = new Set(
      members.filter((m) => m.status === 'active').map((m) => m.userId.toString()),
    );
    return [...new Set(mentions)].filter((id) => active.has(id));
  }

  private async emit(
    name: DomainEventName,
    comment: CommentLean,
    task: TaskLean,
    actorId: string,
    meta: RequestMeta,
    extra: { verb: string },
  ): Promise<void> {
    await this.events.publish({
      name,
      orgId: comment.orgId.toString(),
      actorId,
      source: meta.source ?? 'ui',
      actorType: meta.actorType ?? 'user',
      entity: { type: 'comment', id: comment._id.toString() },
      verb: extra.verb,
      object: { type: 'task', id: task._id.toString(), label: `${task.key} ${task.title}`.trim() },
      projectId: task.projectId.toString(),
      requestId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
