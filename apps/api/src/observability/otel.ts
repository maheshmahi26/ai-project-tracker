import { Logger } from '@nestjs/common';

/**
 * OpenTelemetry bootstrap. Kept as a guarded no-op for now: full tracing wiring
 * (NodeSDK + OTLP exporter + auto-instrumentations) is completed in TASK-15,
 * where the collector endpoint and instrumentation deps are provisioned.
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set we log intent so the wiring is obvious;
 * we do not start an SDK yet to avoid shipping heavy deps before they're used.
 */
export function initOtel(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  Logger.log(
    `OTLP endpoint configured (${endpoint}); tracing SDK wiring is completed in TASK-15.`,
    'Observability',
  );
}
