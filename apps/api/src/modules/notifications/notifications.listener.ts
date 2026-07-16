import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DOMAIN_EVENT_CHANNEL, type DomainEvent } from '../events/domain-event';
import { NotificationsService } from './notifications.service';

/**
 * Turns domain events into user notifications without coupling the emitting
 * services (TasksService) to the notifications module. Currently reacts to task
 * assignments; comment mentions are fanned out directly by CommentsService
 * (it already knows the mention list).
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DOMAIN_EVENT_CHANNEL, { promisify: true })
  async handle(event: DomainEvent): Promise<void> {
    if (event.name !== 'task.assigned') return;
    const assigneeId = (event.after as { assigneeId?: string | null } | null)?.assigneeId ?? null;
    if (!assigneeId || assigneeId === event.actorId) return;

    try {
      await this.notifications.fanOut({
        orgId: event.orgId,
        recipientIds: [assigneeId],
        type: 'assignment',
        title: `You were assigned ${event.object.label}`,
        body: null,
        entity: event.entity,
        excludeUserId: event.actorId,
      });
    } catch (err) {
      // Notifications are a side effect; never fail the mutation that triggered us.
      this.logger.warn(`Assignment notification failed: ${(err as Error).message}`);
    }
  }
}
