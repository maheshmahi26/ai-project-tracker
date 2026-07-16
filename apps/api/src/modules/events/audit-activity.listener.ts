import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from '../audit/audit.service';
import { ActivityService } from '../activity/activity.service';
import { DOMAIN_EVENT_CHANNEL, type DomainEvent } from './domain-event';

/**
 * Fans every domain event out to the two write-models:
 *  - AuditLog  — immutable, compliance-grade, with before/after diff.
 *  - ActivityLog — denormalized timeline feed (verb + labeled object).
 *
 * Both writes are best-effort (the services swallow errors) so auditing can
 * never fail a business mutation.
 */
@Injectable()
export class AuditActivityListener {
  constructor(
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  @OnEvent(DOMAIN_EVENT_CHANNEL, { promisify: true })
  async handle(event: DomainEvent): Promise<void> {
    await Promise.all([
      this.audit.record({
        action: event.name,
        actorId: event.actorId,
        actorType: event.actorType ?? 'user',
        orgId: event.orgId,
        entity: event.entity,
        before: event.before ?? null,
        after: event.after ?? null,
        source: event.source ?? 'ui',
        requestId: event.requestId,
        ip: event.ip,
        userAgent: event.userAgent,
      }),
      this.activity.record({
        orgId: event.orgId,
        actorId: event.actorId,
        verb: event.verb,
        object: event.object,
        projectId: event.projectId,
      }),
    ]);
  }
}
