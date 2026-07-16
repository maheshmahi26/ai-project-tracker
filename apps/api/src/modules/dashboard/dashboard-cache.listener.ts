import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DOMAIN_EVENT_CHANNEL, type DomainEvent } from '../events/domain-event';
import { DashboardCache } from './dashboard.cache';

/** Entity prefixes whose mutations change dashboard aggregates. */
const DASHBOARD_ENTITIES = ['task', 'sprint', 'project'];

/**
 * Busts the dashboard read-model cache on any write that affects its aggregates.
 * Reuses the TASK-07 domain-event bus, so mutating services stay unaware of the
 * cache. Best-effort — invalidation errors are swallowed by {@link DashboardCache}.
 */
@Injectable()
export class DashboardCacheListener {
  constructor(private readonly cache: DashboardCache) {}

  @OnEvent(DOMAIN_EVENT_CHANNEL, { promisify: true })
  async handle(event: DomainEvent): Promise<void> {
    const entity = event.name.split('.')[0];
    if (!DASHBOARD_ENTITIES.includes(entity)) return;
    await this.cache.invalidateOrg(event.orgId);
  }
}
