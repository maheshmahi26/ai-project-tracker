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

// ───────────────────────────────────────────────────────────────────────────
// RBAC — permissions matrix (single source of truth for API, AI tools, and UI)
// See specs/07-security-rbac.md.
// ───────────────────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  'read',
  'task:create',
  'task:update',
  'task:delete',
  'task:assign',
  'project:create',
  'project:update',
  'project:archive',
  'project:delete',
  'sprint:manage',
  'export',
  'manage:users',
  'manage:org',
] as const;

export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

/**
 * Role → permissions. Developers get `task:delete` at the matrix level, but a
 * resource-level policy (ownership) further restricts it (TASK-09).
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [...PERMISSIONS],
  manager: [
    'read',
    'task:create',
    'task:update',
    'task:delete',
    'task:assign',
    'project:create',
    'project:update',
    'project:archive',
    'project:delete',
    'sprint:manage',
    'export',
  ],
  developer: ['read', 'task:create', 'task:update', 'task:delete', 'task:assign'],
  viewer: ['read'],
};

/** True if `role` grants `permission`. */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ───────────────────────────────────────────────────────────────────────────
// Auth DTOs (request contracts shared with the frontend + validated server-side)
// ───────────────────────────────────────────────────────────────────────────

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Organization / membership DTOs
// ───────────────────────────────────────────────────────────────────────────

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(50)
    .regex(slugRegex, 'Slug may contain lowercase letters, numbers and hyphens')
    .optional(),
  timezone: z.string().default('UTC'),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    logoUrl: z.string().url(),
    timezone: z.string(),
  })
  .partial();
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const changeRoleSchema = z.object({ role: roleSchema });
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Public response DTOs (never include passwordHash / token hashes)
// ───────────────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  provider: 'local' | 'google';
  status: 'active' | 'invited' | 'disabled';
  defaultOrgId?: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Also set as an httpOnly cookie; included here for non-browser clients. */
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface OrganizationDTO {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  ownerId: string;
  plan: 'free' | 'pro';
  settings: { timezone: string; features: Record<string, boolean> };
  role?: Role;
  createdAt: string;
}

export interface MembershipDTO {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  status: 'active' | 'invited';
  user?: PublicUser;
  joinedAt?: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// Projects
// ───────────────────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = ['active', 'archived'] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** Human project key, e.g. `AUTH`. Uppercase, starts with a letter. */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Key must be 2–10 chars, start with a letter (A–Z, 0–9)');

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a hex value like #4f46e5');

const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: projectKeySchema.optional(),
  description: z.string().trim().max(2000).optional(),
  leadId: objectIdSchema.optional(),
  color: hexColorSchema.optional(),
  startDate: isoDateSchema.optional(),
  targetDate: isoDateSchema.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable(),
    leadId: objectIdSchema.nullable(),
    color: hexColorSchema,
    startDate: isoDateSchema.nullable(),
    targetDate: isoDateSchema.nullable(),
  })
  .partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** List query: filter by status, full-text `q`, sort, cursor OR offset pagination. */
export const PROJECT_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'key'] as const;
export const listProjectsQuerySchema = z.object({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  q: z.string().trim().max(200).optional(),
  sort: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export interface ProjectDTO {
  id: string;
  orgId: string;
  key: string;
  name: string;
  description?: string | null;
  leadId?: string | null;
  status: ProjectStatus;
  color: string;
  startDate?: string | null;
  targetDate?: string | null;
  counters: { taskSeq: number };
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Activity & Audit (read models)
// ───────────────────────────────────────────────────────────────────────────

export const listActivityQuerySchema = z.object({
  projectId: objectIdSchema.optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;

export const listAuditQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export interface ActivityLogDTO {
  id: string;
  orgId: string;
  actorId?: string | null;
  verb: string;
  object: { type: string; id: string; label: string };
  projectId?: string | null;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  orgId?: string | null;
  actorId?: string | null;
  actorType: 'user' | 'ai' | 'system';
  action: string;
  entity?: { type: string; id: string } | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  source: 'ui' | 'ai' | 'system';
  createdAt: string;
}
