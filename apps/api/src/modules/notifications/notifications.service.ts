import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { ListNotificationsQuery, NotificationDTO, NotificationType } from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import { UsersRepository } from '../users/users.repository';
import { MailService } from '../mail/mail.service';
import { NotificationsRepository } from './notifications.repository';
import { toNotificationDTO } from './notifications.mapper';

export interface FanOutInput {
  orgId: string;
  recipientIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  entity?: { type: string; id: string } | null;
  /** Never notify the actor about their own action. */
  excludeUserId?: string | null;
  /** Also enqueue a transactional email per recipient (default true). */
  email?: boolean;
}

/**
 * Notification fan-out + inbox reads. `fanOut` creates one durable notification
 * per (deduplicated) recipient and enqueues an email job for each — the actual
 * send happens in the worker with retry/backoff. This is the single entry point
 * used by comment mentions and (via a domain-event listener) task assignments.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly users: UsersRepository,
    private readonly mail: MailService,
  ) {}

  async fanOut(input: FanOutInput): Promise<NotificationDTO[]> {
    const recipients = [...new Set(input.recipientIds)]
      .filter((id) => Types.ObjectId.isValid(id))
      .filter((id) => id !== input.excludeUserId);
    if (recipients.length === 0) return [];

    const created = await this.repo.createMany(
      recipients.map((userId) => ({
        orgId: new Types.ObjectId(input.orgId),
        userId: new Types.ObjectId(userId),
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entity: input.entity ?? null,
      })),
    );

    if (input.email !== false) {
      await this.enqueueEmails(recipients, input.title, input.body ?? input.title);
    }
    return created.map(toNotificationDTO);
  }

  async list(
    orgId: string,
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<PaginatedResult<NotificationDTO>> {
    const rows = await this.repo.listByUser({
      orgId,
      userId,
      unreadOnly: query.unreadOnly === 'true',
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    const page = buildCursorPage(rows.map(toNotificationDTO), query.limit, (n) => n.id);
    const total = await this.repo.countUnread(orgId, userId);
    return new PaginatedResult(page.items, { ...page.page, total });
  }

  async markRead(orgId: string, userId: string, id: string): Promise<void> {
    const ok = await this.repo.markRead(orgId, userId, id);
    if (!ok) throw AppException.notFound('Notification not found');
  }

  async markAllRead(orgId: string, userId: string): Promise<{ updated: number }> {
    const updated = await this.repo.markAllRead(orgId, userId);
    return { updated };
  }

  private async enqueueEmails(
    recipientIds: string[],
    subject: string,
    text: string,
  ): Promise<void> {
    try {
      const users = await this.users.findByIds(recipientIds);
      await Promise.all(users.map((u) => this.mail.sendNotification(u.email, subject, text)));
    } catch (err) {
      // Email is a side effect; a queue hiccup must not fail the mutation.
      this.logger.warn(`Failed to enqueue notification emails: ${(err as Error).message}`);
    }
  }
}
