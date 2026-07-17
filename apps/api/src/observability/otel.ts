import { Logger } from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;

/**
 * OpenTelemetry bootstrap. Starts a NodeSDK with OTLP/HTTP trace export and
 * auto-instrumentation for HTTP, Express, Mongo (Mongoose) and Redis — giving
 * distributed traces HTTP → service → Mongo/Redis correlated by `requestId`.
 *
 * A guarded no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset, so local dev and
 * tests don't ship any traces or pull the SDK into the hot path.
 *
 * Must run before the Nest app is created (see main.ts) so instrumentation can
 * patch modules early.
 */
export function initOtel(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || sdk) return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'ai-projectos-api',
      [ATTR_SERVICE_VERSION]: process.env.SENTRY_RELEASE ?? 'dev',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are noisy and rarely actionable.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  Logger.log(`OpenTelemetry tracing started → ${endpoint}`, 'Observability');

  const shutdown = (): void => {
    void sdk?.shutdown().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
