import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Initializes Sentry only when SENTRY_DSN is configured. Safe no-op locally.
 * Call once, as early as possible, before the Nest app is created.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  initialized = true;
}

/** Reports an exception to Sentry when initialized; otherwise a no-op. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}
