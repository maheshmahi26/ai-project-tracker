import * as Sentry from '@sentry/react';

/**
 * Frontend Sentry init. A guarded no-op unless VITE_SENTRY_DSN is set, so local
 * dev never ships events. Release matches the backend build tag for correlation.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  });
}
