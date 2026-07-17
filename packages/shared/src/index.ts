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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

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

/** Roles an admin can assign when creating a user (admin is intentionally excluded). */
export const nonAdminRoleSchema = z.enum(['manager', 'developer', 'viewer']);
export type NonAdminRole = z.infer<typeof nonAdminRoleSchema>;

/** Admin creates a user directly with a temporary, admin-typed password. */
export const createMemberSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: passwordSchema,
  role: nonAdminRoleSchema,
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/** Page-based query for the admin members table. */
export const memberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

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
  /** True when the user must set a new password before using the app. */
  mustChangePassword: boolean;
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

export interface PaginatedMembers {
  items: MembershipDTO[];
  total: number;
  page: number;
  pageSize: number;
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
// Sprints
// ───────────────────────────────────────────────────────────────────────────

export const SPRINT_STATUSES = ['planned', 'active', 'completed'] as const;
export const sprintStatusSchema = z.enum(SPRINT_STATUSES);
export type SprintStatus = z.infer<typeof sprintStatusSchema>;

export const createSprintSchema = z.object({
  name: z.string().trim().min(2).max(120),
  goal: z.string().trim().max(2000).optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  capacityPoints: z.number().int().min(0).max(10000).optional(),
});
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const updateSprintSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    goal: z.string().trim().max(2000).nullable(),
    startDate: isoDateSchema.nullable(),
    endDate: isoDateSchema.nullable(),
    capacityPoints: z.number().int().min(0).max(10000).nullable(),
  })
  .partial();
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;

export const listSprintsQuerySchema = z.object({
  status: z.enum(['planned', 'active', 'completed', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListSprintsQuery = z.infer<typeof listSprintsQuerySchema>;

export interface SprintDTO {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  goal?: string | null;
  status: SprintStatus;
  startDate?: string | null;
  endDate?: string | null;
  capacityPoints?: number | null;
  committedPoints: number;
  completedPoints: number;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Tasks
// ───────────────────────────────────────────────────────────────────────────

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

const storyPointsSchema = z.number().int().min(0).max(100);

export const createTaskSchema = z.object({
  projectId: objectIdSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: objectIdSchema.optional(),
  sprintId: objectIdSchema.optional(),
  parentId: objectIdSchema.optional(),
  labelIds: z.array(objectIdSchema).max(50).optional(),
  storyPoints: storyPointsSchema.optional(),
  dueDate: isoDateSchema.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Body for `POST /tasks/:id/subtasks` — project + parent come from the path. */
export const createSubtaskSchema = createTaskSchema.omit({ projectId: true, parentId: true });
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(20000).nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assigneeId: objectIdSchema.nullable(),
    sprintId: objectIdSchema.nullable(),
    labelIds: z.array(objectIdSchema).max(50),
    storyPoints: storyPointsSchema.nullable(),
    dueDate: isoDateSchema.nullable(),
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const assignTaskSchema = z.object({ assigneeId: objectIdSchema.nullable() });
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

export const moveTaskSchema = z
  .object({
    sprintId: objectIdSchema.nullable().optional(),
    status: taskStatusSchema.optional(),
    order: z.number().finite().optional(),
  })
  .refine((v) => v.sprintId !== undefined || v.status !== undefined || v.order !== undefined, {
    message: 'Provide at least one of sprintId, status, or order',
  });
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

/** Patch applied to every id in a bulk-update. */
export const bulkTaskPatchSchema = z
  .object({
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assigneeId: objectIdSchema.nullable(),
    sprintId: objectIdSchema.nullable(),
    labelIds: z.array(objectIdSchema).max(50),
    storyPoints: storyPointsSchema.nullable(),
    dueDate: isoDateSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Patch must not be empty' });

export const bulkUpdateTasksSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(100),
  patch: bulkTaskPatchSchema,
});
export type BulkUpdateTasksInput = z.infer<typeof bulkUpdateTasksSchema>;

export const bulkDeleteTasksSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(100),
});
export type BulkDeleteTasksInput = z.infer<typeof bulkDeleteTasksSchema>;

export const TASK_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'order',
  'priority',
  'status',
  'dueDate',
  'storyPoints',
] as const;

export const listTasksQuerySchema = z.object({
  projectId: objectIdSchema.optional(),
  sprintId: objectIdSchema.optional(),
  /** Comma-separated list, e.g. `todo,in_progress`. */
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: objectIdSchema.optional(),
  /** `parentId=<id>` for subtasks of a task; `parentId=none` for top-level only. */
  parentId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export interface TaskDTO {
  id: string;
  orgId: string;
  projectId: string;
  sprintId?: string | null;
  key: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string | null;
  reporterId: string;
  labelIds: string[];
  storyPoints?: number | null;
  dueDate?: string | null;
  order: number;
  attachmentsCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Comments
// ───────────────────────────────────────────────────────────────────────────

/** Rich-text body stored as a JSON document (e.g. ProseMirror/TipTap). */
export const commentBodySchema = z.record(z.string(), z.unknown());

export const createCommentSchema = z.object({
  body: commentBodySchema,
  mentions: z.array(objectIdSchema).max(50).optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z
  .object({
    body: commentBodySchema,
    mentions: z.array(objectIdSchema).max(50),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const listCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

export interface CommentDTO {
  id: string;
  orgId: string;
  taskId: string;
  authorId: string;
  body: Record<string, unknown>;
  mentions: string[];
  editedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Labels
// ───────────────────────────────────────────────────────────────────────────

export const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColorSchema,
  projectId: objectIdSchema.optional(),
});
export type CreateLabelInput = z.infer<typeof createLabelSchema>;

export const updateLabelSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    color: hexColorSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;

export const listLabelsQuerySchema = z.object({
  projectId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
});
export type ListLabelsQuery = z.infer<typeof listLabelsQuerySchema>;

export interface LabelDTO {
  id: string;
  orgId: string;
  projectId?: string | null;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Files
// ───────────────────────────────────────────────────────────────────────────

export const FILE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** Allowed upload MIME types (exact match) plus the `image/*` prefix. */
export const ALLOWED_FILE_MIME_TYPES = [
  'application/pdf',
  'application/zip',
  'application/json',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export function isAllowedMimeType(mime: string): boolean {
  return mime.startsWith('image/') || (ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(mime);
}

export const FILE_SCOPE_TYPES = ['task', 'project', 'comment'] as const;
export const fileScopeSchema = z.object({
  type: z.enum(FILE_SCOPE_TYPES),
  id: objectIdSchema,
});
export type FileScope = z.infer<typeof fileScopeSchema>;

export const presignFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150).refine(isAllowedMimeType, 'Unsupported file type'),
  sizeBytes: z.number().int().positive().max(FILE_MAX_BYTES),
  scope: fileScopeSchema,
});
export type PresignFileInput = z.infer<typeof presignFileSchema>;

export const listFilesQuerySchema = z.object({
  scopeType: z.enum(FILE_SCOPE_TYPES),
  scopeId: objectIdSchema,
});
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;

export const confirmFileSchema = z.object({
  storageKey: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150).refine(isAllowedMimeType, 'Unsupported file type'),
  sizeBytes: z.number().int().positive().max(FILE_MAX_BYTES),
  scope: fileScopeSchema,
});
export type ConfirmFileInput = z.infer<typeof confirmFileSchema>;

export interface PresignFileResult {
  url: string;
  storageKey: string;
  expiresInSec: number;
}

export interface FileDTO {
  id: string;
  orgId: string;
  uploaderId: string;
  scope: FileScope;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Notifications
// ───────────────────────────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = ['mention', 'assignment', 'comment', 'system'] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export interface NotificationDTO {
  id: string;
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entity?: { type: string; id: string } | null;
  readAt?: string | null;
  createdAt: string;
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

// ───────────────────────────────────────────────────────────────────────────
// Dashboard & Reports (CQRS-lite read models — chart-ready, cached)
// ───────────────────────────────────────────────────────────────────────────

/** Optional project scoping for org-wide dashboard queries. */
export const dashboardScopeQuerySchema = z.object({
  projectId: objectIdSchema.optional(),
});
export type DashboardScopeQuery = z.infer<typeof dashboardScopeQuerySchema>;

export const burndownQuerySchema = z.object({
  sprintId: objectIdSchema,
});
export type BurndownQuery = z.infer<typeof burndownQuerySchema>;

export const weeklyReportQuerySchema = z.object({
  projectId: objectIdSchema.optional(),
  /** ISO date; the report covers the 7 days ending at `weekOf` (default: now). */
  weekOf: isoDateSchema.optional(),
});
export type WeeklyReportQuery = z.infer<typeof weeklyReportQuerySchema>;

export const exportTasksQuerySchema = z.object({
  projectId: objectIdSchema.optional(),
  sprintId: objectIdSchema.optional(),
  status: z.string().optional(),
});
export type ExportTasksQuery = z.infer<typeof exportTasksQuerySchema>;

export interface DashboardOverviewDTO {
  projects: { total: number; active: number; archived: number };
  tasks: {
    total: number;
    open: number;
    done: number;
    overdue: number;
    byStatus: Record<TaskStatus, number>;
  };
  sprints: { total: number; planned: number; active: number; completed: number };
  points: { committed: number; completed: number };
}

export interface VelocityPointDTO {
  sprintId: string;
  name: string;
  status: SprintStatus;
  committedPoints: number;
  completedPoints: number;
  endDate?: string | null;
}

export interface BurndownPointDTO {
  date: string;
  ideal: number;
  remaining: number;
}

export interface BurndownDTO {
  sprintId: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  totalPoints: number;
  points: BurndownPointDTO[];
}

export interface TasksPerUserDTO {
  assigneeId: string | null;
  total: number;
  open: number;
  done: number;
  points: number;
}

export interface PriorityDistributionDTO {
  priority: TaskPriority;
  count: number;
}

export interface ProjectProgressDTO {
  projectId: string;
  key: string;
  name: string;
  total: number;
  done: number;
  open: number;
  percentComplete: number;
  points: number;
  donePoints: number;
}

export interface WeeklyReportDTO {
  rangeStart: string;
  rangeEnd: string;
  createdCount: number;
  completedCount: number;
  createdByPriority: Record<TaskPriority, number>;
  activeSprints: number;
  topContributors: Array<{ assigneeId: string; done: number }>;
}

// ───────────────────────────────────────────────────────────────────────────
// AI — Chat sessions, messages, tool registry, agent executions, SSE events
// (see specs/05-ai-agent.md and specs/03-database-schema.md §12–16)
// ───────────────────────────────────────────────────────────────────────────

export const createChatSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  projectId: objectIdSchema.optional(),
});
export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;

export const updateChatSessionSchema = z
  .object({ title: z.string().trim().min(1).max(200) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateChatSessionInput = z.infer<typeof updateChatSessionSchema>;

export const listChatSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type ListChatSessionsQuery = z.infer<typeof listChatSessionsQuerySchema>;

export const listChatMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type ListChatMessagesQuery = z.infer<typeof listChatMessagesQuerySchema>;

/** A user turn. The agent streams the reply back over SSE. */
export const sendChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const CHAT_MESSAGE_ROLES = ['user', 'assistant', 'tool', 'system'] as const;
export type ChatMessageRole = (typeof CHAT_MESSAGE_ROLES)[number];

export interface ChatSessionDTO {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  projectId?: string | null;
  lastMessageAt?: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatToolCallDTO {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatToolResultDTO {
  callId: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string } | null;
}

export interface ChatMessageDTO {
  id: string;
  orgId: string;
  sessionId: string;
  userId: string;
  role: ChatMessageRole;
  content: string;
  toolCalls?: ChatToolCallDTO[];
  toolResults?: ChatToolResultDTO[];
  tokens?: { in: number; out: number } | null;
  createdAt: string;
}

/** Registry introspection: what the agent (and UI) can see about a tool. */
export interface AiToolInfoDTO {
  name: string;
  description: string;
  requiredPermission: Permission;
  /** JSON-schema-ish description of the accepted arguments. */
  inputSchema: Record<string, unknown>;
  /** Destructive tools require an explicit user confirmation before commit. */
  destructive: boolean;
}

export const AI_EXECUTION_STATUSES = ['success', 'partial', 'failed'] as const;
export type AiExecutionStatus = (typeof AI_EXECUTION_STATUSES)[number];

export interface AiExecutionToolCallDTO {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  error?: string | null;
}

export interface AiExecutionDTO {
  id: string;
  orgId: string;
  userId: string;
  sessionId?: string | null;
  messageId?: string | null;
  prompt: string;
  model: string;
  status: AiExecutionStatus;
  /** Summarized LangGraph node trace (e.g. "ingest→reason→act→reason→respond"). */
  graphState: string;
  toolCalls: AiExecutionToolCallDTO[];
  latencyMs: number;
  tokens: { in: number; out: number };
  iterations: number;
  createdAt: string;
}

/**
 * Server-Sent Events emitted by `POST /ai/chat/sessions/:id/messages`.
 * Discriminated union on `type`; each is sent as its own SSE `event:`/`data:`.
 */
export type ChatSseEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | {
      type: 'tool_result';
      callId: string;
      name: string;
      ok: boolean;
      data?: unknown;
      error?: { code: string; message: string } | null;
    }
  | {
      type: 'done';
      messageId: string;
      executionId: string;
      status: AiExecutionStatus;
    }
  | { type: 'error'; code: string; message: string };

// ───────────────────────────────────────────────────────────────────────────
// AI — Generative tools (structured, propose→confirm)
// Output schemas + prompt templates live here so both the API (validation) and
// the web (rendering proposals) share one source of truth. Generative tools
// NEVER assert on free prose — only on these schema-valid JSON shapes.
// See specs/05-ai-agent.md ("Generative / analytical").
// ───────────────────────────────────────────────────────────────────────────

/** System instruction shared by every generative tool: JSON-only, grounded. */
export const GENERATIVE_SYSTEM_PROMPT =
  'You are the planning assistant inside a project-management product. You return ONLY JSON that ' +
  'conforms to the provided schema — no markdown, no prose outside the JSON. Be concrete, concise, ' +
  'and grounded strictly in the context you are given; never invent ids, names, or metrics.';

// ── Proposed sprint (generateSprint → applySprintPlan) ────────────────────────
export const proposedTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  priority: taskPrioritySchema.default('medium'),
  storyPoints: z.number().int().min(0).max(100).optional(),
});
export type ProposedTask = z.infer<typeof proposedTaskSchema>;

export const sprintPlanSchema = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().max(2000).default(''),
  durationDays: z.number().int().min(1).max(60).default(14),
  tasks: z.array(proposedTaskSchema).min(1).max(50),
});
export type SprintPlan = z.infer<typeof sprintPlanSchema>;

// ── Standup ───────────────────────────────────────────────────────────────────
export const standupEntrySchema = z.object({
  name: z.string(),
  yesterday: z.array(z.string()).default([]),
  today: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
});
export const standupSchema = z.object({
  date: z.string(),
  entries: z.array(standupEntrySchema),
});
export type Standup = z.infer<typeof standupSchema>;

// ── Generic summary (summarizeSprint / summarizeProject) ──────────────────────
export const summarySchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});
export type SummaryResult = z.infer<typeof summarySchema>;

// ── Reports (project / weekly / meeting) ──────────────────────────────────────
export const reportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .default([]),
});
export type ReportResult = z.infer<typeof reportSchema>;

export const weeklyReportGenSchema = z.object({
  summary: z.string(),
  completed: z.array(z.string()).default([]),
  inProgress: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  nextWeek: z.array(z.string()).default([]),
});
export type WeeklyReportGen = z.infer<typeof weeklyReportGenSchema>;

export const meetingSummarySchema = z.object({
  summary: z.string(),
  decisions: z.array(z.string()).default([]),
  actionItems: z
    .array(z.object({ owner: z.string().optional(), task: z.string() }))
    .default([]),
});
export type MeetingSummary = z.infer<typeof meetingSummarySchema>;

// ── Backlog authoring (stories / acceptance criteria / subtasks / roadmap / notes)
export const userStorySchema = z.object({
  title: z.string(),
  asA: z.string(),
  iWant: z.string(),
  soThat: z.string(),
  acceptanceCriteria: z.array(z.string()).default([]),
  storyPoints: z.number().int().min(0).max(100).optional(),
});
export const userStoriesSchema = z.object({ stories: z.array(userStorySchema).min(1).max(30) });
export type UserStories = z.infer<typeof userStoriesSchema>;

export const acceptanceCriteriaSchema = z.object({
  criteria: z.array(z.string()).min(1).max(30),
});
export type AcceptanceCriteria = z.infer<typeof acceptanceCriteriaSchema>;

export const subtaskPlanSchema = z.object({
  subtasks: z
    .array(z.object({ title: z.string().min(1).max(300), description: z.string().max(2000).optional() }))
    .min(1)
    .max(20),
});
export type SubtaskPlan = z.infer<typeof subtaskPlanSchema>;

export const roadmapSchema = z.object({
  phases: z
    .array(
      z.object({
        name: z.string(),
        objective: z.string(),
        durationWeeks: z.number().int().min(1).max(52),
        items: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(12),
});
export type Roadmap = z.infer<typeof roadmapSchema>;

export const releaseNotesSchema = z.object({
  version: z.string().optional(),
  highlights: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  fixes: z.array(z.string()).default([]),
});
export type ReleaseNotes = z.infer<typeof releaseNotesSchema>;

// ── Analytics (deterministic; not generative) ─────────────────────────────────
export const ANALYTICS_METRICS = [
  'overview',
  'velocity',
  'tasksPerUser',
  'priorityDistribution',
  'projectProgress',
  'weeklyReport',
] as const;
export const analyticsMetricSchema = z.enum(ANALYTICS_METRICS);
export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[number];

export const analyticsResultSchema = z.object({
  metric: analyticsMetricSchema,
  note: z.string(),
  points: z.array(z.object({ label: z.string(), value: z.number() })),
});
export type AnalyticsResult = z.infer<typeof analyticsResultSchema>;

/**
 * Prompt templates for the generative tools. Each takes an already-serialized
 * context string (assembled server-side from real data) plus the user's ask,
 * and returns the user-turn prompt. Kept pure + colocated with the schemas.
 */
export const generativePrompts = {
  generateSprint: (ctx: { backlog: string; durationDays: number; ask?: string }): string =>
    `Plan the next sprint (~${ctx.durationDays} days) from this backlog. Pick a coherent, achievable ` +
    `set of items, set a clear goal, and estimate story points.\n\n${ctx.ask ? `Focus: ${ctx.ask}\n\n` : ''}Backlog:\n${ctx.backlog}`,
  generateStandup: (ctx: { activity: string; date: string }): string =>
    `Produce a standup for ${ctx.date} from this recent activity, grouped by person. ` +
    `Keep bullets terse.\n\nActivity:\n${ctx.activity}`,
  summarizeSprint: (ctx: { sprint: string; tasks: string }): string =>
    `Summarize this sprint's progress, highlights, and risks.\n\nSprint:\n${ctx.sprint}\n\nTasks:\n${ctx.tasks}`,
  summarizeProject: (ctx: { project: string; tasks: string }): string =>
    `Summarize the state of this project, key highlights, and risks.\n\nProject:\n${ctx.project}\n\nTasks:\n${ctx.tasks}`,
  generateProjectReport: (ctx: { project: string; metrics: string; tasks: string }): string =>
    `Write a stakeholder project report with a title, an executive summary, and clear sections ` +
    `(progress, risks, next steps).\n\nProject:\n${ctx.project}\n\nMetrics:\n${ctx.metrics}\n\nTasks:\n${ctx.tasks}`,
  generateWeeklyReport: (ctx: { period: string; data: string }): string =>
    `Write a weekly report for ${ctx.period}: summary, what was completed, what's in progress, risks, ` +
    `and next week's focus.\n\nData:\n${ctx.data}`,
  generateUserStories: (ctx: { feature: string; count: number }): string =>
    `Write ${ctx.count} well-formed user stories (As a / I want / So that) with acceptance criteria for:\n\n${ctx.feature}`,
  generateAcceptanceCriteria: (ctx: { item: string }): string =>
    `Write clear, testable acceptance criteria (Given/When/Then where useful) for:\n\n${ctx.item}`,
  generateSubtasks: (ctx: { task: string; count: number }): string =>
    `Break this task into ${ctx.count} concrete, independently-shippable subtasks:\n\n${ctx.task}`,
  generateRoadmap: (ctx: { goals: string }): string =>
    `Propose a phased product roadmap (name, objective, duration in weeks, key items) for these goals:\n\n${ctx.goals}`,
  generateReleaseNotes: (ctx: { changes: string }): string =>
    `Write release notes (highlights, features, fixes) from these completed items:\n\n${ctx.changes}`,
  generateMeetingSummary: (ctx: { notes: string }): string =>
    `Summarize these meeting notes into a summary, explicit decisions, and action items with owners:\n\n${ctx.notes}`,
};
