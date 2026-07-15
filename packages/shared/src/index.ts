import { z } from 'zod';

/**
 * Shared contracts (Zod schemas + inferred types) used by the API, the web app,
 * and (later) the AI tool registry. This is the single source of truth so the
 * three consumers never drift. Feature schemas are added here in later tasks.
 */

export const APP_NAME = 'AI ProjectOS';

/** Organization roles (per-membership). See specs/07-security-rbac.md. */
export const ROLES = ['admin', 'manager', 'developer', 'viewer'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Standard success/error envelopes. See specs/04-api-design.md. */
export interface ApiMeta {
  requestId: string;
  page?: {
    nextCursor?: string | null;
    hasMore: boolean;
    total?: number;
  };
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ path?: string; issue: string }>;
    requestId: string;
  };
}

/** Common pagination query (cursor-based by default). */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Health status returned by /health. */
export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  uptimeSeconds: z.number(),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;
