/**
 * Centralized TanStack Query keys for predictable caching + invalidation.
 * Feature keys are added here as features land (projects, tasks, dashboard…).
 * Convention: `[domain, scope, ...params]`.
 */
export const queryKeys = {
  health: {
    ping: ['health', 'ping'] as const,
  },
  projects: {
    all: ['projects'] as const,
    list: (filters?: Record<string, unknown>) => ['projects', 'list', filters ?? {}] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    list: (filters?: Record<string, unknown>) => ['tasks', 'list', filters ?? {}] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
  },
} as const;
