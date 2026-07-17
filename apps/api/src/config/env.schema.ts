import { z } from 'zod';

/**
 * Environment contract. Validated once at boot; the app fails fast with a clear
 * message if anything required is missing or malformed. See specs/09-devops-deployment.md.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // Global rate limiting (Redis-backed). Stricter per-route limits layer on top.
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // MongoDB (single-node replica set locally so transactions work)
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // Redis (cache + BullMQ)
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Dashboard read-model cache: short TTL + explicit invalidation on writes
  DASHBOARD_CACHE_TTL_SEC: z.coerce.number().int().positive().default(30),

  // Qdrant (vector DB for RAG)
  QDRANT_URL: z.string().url().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),

  // Object storage (MinIO in dev — S3-compatible; Cloudflare R2 in prod)
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().default('ai-projectos'),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // App URLs (used for password-reset links and OAuth success redirects)
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),

  // Auth / JWT
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be >= 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be >= 16 chars'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  REFRESH_COOKIE_NAME: z.string().default('apos_rt'),
  RESET_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(30),

  // Google OAuth (optional — routes return a clear error if unset)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3001/api/v1/auth/google/callback'),

  // Email (console transport in dev)
  MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  MAIL_FROM: z.string().default('no-reply@ai-projectos.local'),
  SMTP_URL: z.string().optional(),

  // AI (added in the AI phase; optional until then)
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // Observability (optional locally)
  SENTRY_DSN: z.string().optional(),
  // Release identifier used by Sentry + as an app version tag (usually the git SHA).
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  // OpenTelemetry OTLP/HTTP traces endpoint (e.g. http://collector:4318).
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('ai-projectos-api'),
  // Better Stack (Logtail) log ingestion — Pino ships structured logs when set.
  BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
  BETTER_STACK_INGEST_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Nest ConfigModule `validate` hook. Throws (aborting boot) on invalid env.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
