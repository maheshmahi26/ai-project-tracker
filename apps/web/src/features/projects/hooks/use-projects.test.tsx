import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectDTO } from '@ai-projectos/shared';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectsPage } from '../api/projects-api';
import { useArchiveProject, useDeleteProject } from './use-projects';

const remove = vi.fn();
const archive = vi.fn();

vi.mock('../api/projects-api', () => ({
  projectsApi: {
    remove: (id: string) => remove(id),
    archive: (id: string) => archive(id),
  },
}));

function project(overrides: Partial<ProjectDTO> = {}): ProjectDTO {
  return {
    id: 'p1',
    orgId: 'o1',
    key: 'MOB',
    name: 'Mobile App',
    status: 'active',
    color: '#4f46e5',
    counters: { taskSeq: 0 },
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const listKey = queryKeys.projects.list('o1', { status: 'active' });
  client.setQueryData<ProjectsPage>(listKey, {
    items: [project(), project({ id: 'p2', key: 'WEB', name: 'Web' })],
    page: { total: 2, hasMore: false },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const read = () => client.getQueryData<ProjectsPage>(listKey);
  return { client, wrapper, read };
}

describe('project mutations (optimistic)', () => {
  beforeEach(() => {
    remove.mockReset();
    archive.mockReset();
  });

  it('rolls back the delete when the request fails', async () => {
    remove.mockRejectedValue(new Error('boom'));
    const { wrapper, read } = setup();
    const { result } = renderHook(() => useDeleteProject(), { wrapper });

    result.current.mutate('p1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(read()?.items.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('rolls back the archive status when the request fails', async () => {
    archive.mockRejectedValue(new Error('boom'));
    const { wrapper, read } = setup();
    const { result } = renderHook(() => useArchiveProject(), { wrapper });

    result.current.mutate('p1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(read()?.items.find((p) => p.id === 'p1')?.status).toBe('active');
  });
});
