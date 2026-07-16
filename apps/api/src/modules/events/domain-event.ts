/**
 * Domain event bus contract.
 *
 * Services emit a single, self-describing {@link DomainEvent} on one channel;
 * cross-cutting listeners (audit, activity, and later: notifications, search
 * indexing, cache busting) subscribe without the emitter knowing about them.
 * This keeps write use-cases free of audit/activity plumbing.
 */
export const DOMAIN_EVENT_CHANNEL = 'domain.event';

/** Canonical event names. Format: `<entity>.<pastTenseVerb>`. */
export type DomainEventName =
  | 'project.created'
  | 'project.updated'
  | 'project.archived'
  | 'project.restored'
  | 'project.deleted'
  | 'project.undeleted'
  | 'sprint.created'
  | 'sprint.updated'
  | 'sprint.started'
  | 'sprint.completed'
  | 'sprint.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.moved'
  | 'task.assigned'
  | 'task.deleted'
  | 'task.undeleted';

export interface DomainEvent {
  /** Machine name, also used as the AuditLog `action`. */
  name: DomainEventName;
  orgId: string;
  actorId: string;
  actorType?: 'user' | 'ai' | 'system';
  source?: 'ui' | 'ai' | 'system';

  /** The entity this event concerns (for audit + entity-scoped queries). */
  entity: { type: string; id: string };

  /** Compliance diff (AuditLog). Optional for pure lifecycle events. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;

  /** Human-friendly timeline projection (ActivityLog). */
  verb: string;
  object: { type: string; id: string; label: string };
  projectId?: string | null;

  /** Request correlation, propagated to AuditLog. */
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}
