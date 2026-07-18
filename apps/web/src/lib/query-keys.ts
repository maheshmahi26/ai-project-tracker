/**
 * Centralized TanStack Query keys for predictable caching + invalidation.
 * Feature keys are added here as features land (projects, tasks, dashboard…).
 * Convention: `[domain, scope, ...params]`.
 */
export const queryKeys = {
  health: {
    ping: ['health', 'ping'] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
  },
  orgs: {
    all: ['orgs'] as const,
    list: ['orgs', 'list'] as const,
    detail: (id: string) => ['orgs', 'detail', id] as const,
    members: (id: string) => ['orgs', id, 'members'] as const,
    membersPage: (id: string, page: number, pageSize: number) =>
      ['orgs', id, 'members', 'page', page, pageSize] as const,
  },
  projects: {
    all: ['projects'] as const,
    lists: ['projects', 'list'] as const,
    list: (orgId: string | null, filters?: Record<string, unknown>) =>
      ['projects', 'list', orgId, filters ?? {}] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
  },
  activity: {
    all: ['activity'] as const,
    list: (orgId: string | null, filters?: Record<string, unknown>) =>
      ['activity', 'list', orgId, filters ?? {}] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    lists: ['tasks', 'list'] as const,
    list: (orgId: string | null, filters?: Record<string, unknown>) =>
      ['tasks', 'list', orgId, filters ?? {}] as const,
    boards: ['tasks', 'board'] as const,
    board: (orgId: string | null, projectId: string) =>
      ['tasks', 'board', orgId, projectId] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    subtasks: (parentId: string) => ['tasks', 'subtasks', parentId] as const,
  },
  comments: {
    all: ['comments'] as const,
    list: (taskId: string) => ['comments', 'list', taskId] as const,
  },
  files: {
    all: ['files'] as const,
    list: (scopeType: string, scopeId: string) => ['files', 'list', scopeType, scopeId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    lists: ['notifications', 'list'] as const,
    list: (orgId: string | null, filters?: Record<string, unknown>) =>
      ['notifications', 'list', orgId, filters ?? {}] as const,
    unreadCount: (orgId: string | null) => ['notifications', 'unread-count', orgId] as const,
  },
  sprints: {
    all: ['sprints'] as const,
    list: (orgId: string | null, projectId: string) =>
      ['sprints', 'list', orgId, projectId] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    widget: (orgId: string | null, widget: string, filters?: Record<string, unknown>) =>
      ['dashboard', widget, orgId, filters ?? {}] as const,
  },
  aiChat: {
    all: ['ai-chat'] as const,
    sessions: (orgId: string | null) => ['ai-chat', 'sessions', orgId] as const,
    messages: (orgId: string | null, sessionId: string) =>
      ['ai-chat', 'messages', orgId, sessionId] as const,
    tools: (orgId: string | null) => ['ai-chat', 'tools', orgId] as const,
  },
  documents: {
    all: ['documents'] as const,
    lists: ['documents', 'list'] as const,
    list: (orgId: string | null, filters?: Record<string, unknown>) =>
      ['documents', 'list', orgId, filters ?? {}] as const,
  },
} as const;
