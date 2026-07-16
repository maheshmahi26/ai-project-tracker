import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DOMAIN_EVENT_CHANNEL, type DomainEvent } from './domain-event';

/**
 * Thin wrapper over EventEmitter2. `publish` awaits all listeners (`emitAsync`),
 * so audit + activity rows are durably written before the mutation returns —
 * deterministic for tests and safe because those listeners never throw.
 */
@Injectable()
export class DomainEventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.emitter.emitAsync(DOMAIN_EVENT_CHANNEL, event);
  }
}
