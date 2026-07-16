import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TaskDTO } from '@ai-projectos/shared';
import { TaskTable } from './task-table';

const useInfiniteTasksMock = vi.fn();

vi.mock('../hooks/use-tasks', () => ({
  useInfiniteTasks: () => useInfiniteTasksMock(),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useUndoDeleteTask: () => ({ mutate: vi.fn() }),
  useBulkUpdateTasks: () => ({ mutateAsync: vi.fn().mockResolvedValue({ updated: 0 }), isPending: false }),
  useBulkDeleteTasks: () => ({ mutateAsync: vi.fn().mockResolvedValue({ deleted: 0 }), isPending: false }),
}));
vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], byId: () => undefined, isLoading: false }),
  initials: (n: string) => n.slice(0, 2).toUpperCase(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function task(overrides: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id: 't1',
    orgId: 'o1',
    projectId: 'p1',
    key: 'MOB-1',
    title: 'Build login',
    status: 'todo',
    priority: 'medium',
    reporterId: 'u1',
    labelIds: [],
    order: 0,
    attachmentsCount: 0,
    commentsCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const params = { projectId: 'p1' };

describe('TaskTable', () => {
  it('renders task rows', () => {
    useInfiniteTasksMock.mockReturnValue({
      data: { pages: [{ items: [task(), task({ id: 't2', key: 'MOB-2', title: 'Add logout' })] }] },
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    render(<TaskTable params={params} onOpenTask={vi.fn()} onEditTask={vi.fn()} />);

    expect(screen.getByText('Build login')).toBeInTheDocument();
    expect(screen.getByText('Add logout')).toBeInTheDocument();
  });

  it('reveals the bulk actions bar when a row is selected', async () => {
    const user = userEvent.setup();
    useInfiniteTasksMock.mockReturnValue({
      data: { pages: [{ items: [task()] }] },
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    render(<TaskTable params={params} onOpenTask={vi.fn()} onEditTask={vi.fn()} />);

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /select mob-1/i }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});
