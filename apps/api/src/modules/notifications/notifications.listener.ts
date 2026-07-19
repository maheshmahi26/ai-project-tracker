import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DOMAIN_EVENT_CHANNEL, type DomainEvent } from '../events/domain-event';
import { ProjectsRepository } from '../projects/projects.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { NotificationsService } from './notifications.service';

/**
 * Turns domain events into user notifications without coupling the emitting
 * services (TasksService) to the notifications module. Reacts to task
 * assignments and to a task moving into "In Progress" (notifying the assignee
 * and the project manager). Comment notifications are fanned out directly by
 * CommentsService (it already knows the mention list + task/project context).
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly tasks: TasksRepository,
    private readonly projects: ProjectsRepository,
  ) {}

  @OnEvent(DOMAIN_EVENT_CHANNEL, { promisify: true })
  async handle(event: DomainEvent): Promise<void> {
    if (event.name === 'task.assigned') return this.onAssigned(event);
    if (event.name === 'task.moved') return this.onMoved(event);
  }

  private async onAssigned(event: DomainEvent): Promise<void> {
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

  /**
   * When a task enters "In Progress", notify its assignee and the project
   * manager (project lead) so they know work has started.
   */
  private async onMoved(event: DomainEvent): Promise<void> {
    const before = event.before as { status?: string } | null;
    const after = event.after as { status?: string } | null;
    if (after?.status !== 'in_progress' || before?.status === 'in_progress') return;

    try {
      const task = await this.tasks.findById(event.orgId, event.entity.id);
      const recipients: string[] = [];
      if (task?.assigneeId) recipients.push(task.assigneeId.toString());

      const projectId = event.projectId ?? task?.projectId?.toString() ?? null;
      if (projectId) {
        const project = await this.projects.findById(event.orgId, projectId);
        if (project?.leadId) recipients.push(project.leadId.toString());
      }
      if (recipients.length === 0) return;

      await this.notifications.fanOut({
        orgId: event.orgId,
        recipientIds: recipients,
        type: 'system',
        title: `${event.object.label} moved to In Progress`,
        body: null,
        entity: event.entity,
        excludeUserId: event.actorId,
      });
    } catch (err) {
      this.logger.warn(`Move notification failed: ${(err as Error).message}`);
    }
  }
}
