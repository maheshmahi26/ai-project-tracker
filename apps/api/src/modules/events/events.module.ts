import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';
import { AuditActivityListener } from './audit-activity.listener';

/**
 * Domain event infrastructure. `DomainEventBus` is exported for services to
 * publish; the listener is instantiated so its `@OnEvent` binding registers.
 * Relies on `EventEmitterModule.forRoot()` (wired in AppModule), plus the
 * global Audit + Activity modules for the fan-out targets.
 */
@Global()
@Module({
  providers: [DomainEventBus, AuditActivityListener],
  exports: [DomainEventBus],
})
export class EventsModule {}
