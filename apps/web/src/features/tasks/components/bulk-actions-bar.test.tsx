import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionsBar } from './bulk-actions-bar';

const bulkUpdateMutate = vi.fn().mockResolvedValue({ updated: 0 });
const bulkDeleteMutate = vi.fn().mockResolvedValue({ deleted: 0 });

vi.mock('../hooks/use-tasks', () => ({
  useBulkUpdateTasks: () => ({ mutateAsync: bulkUpdateMutate, isPending: false }),
  useBulkDeleteTasks: () => ({ mutateAsync: bulkDeleteMutate, isPending: false }),
}));
vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], byId: () => undefined, isLoading: false }),
  initials: (n: string) => n.slice(0, 2).toUpperCase(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('BulkActionsBar', () => {
  beforeEach(() => {
    bulkUpdateMutate.mockClear();
    bulkDeleteMutate.mockClear();
  });

  it('renders nothing when no tasks are selected', () => {
    const { container } = render(<BulkActionsBar selectedIds={[]} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selection count', () => {
    render(<BulkActionsBar selectedIds={['t1', 't2', 't3']} onClear={vi.fn()} />);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('bulk-deletes the selected ids and clears the selection', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<BulkActionsBar selectedIds={['t1', 't2']} onClear={onClear} />);

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(bulkDeleteMutate).toHaveBeenCalledWith(['t1', 't2']);
    expect(onClear).toHaveBeenCalled();
  });

  it('clears the selection via the close button', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<BulkActionsBar selectedIds={['t1']} onClear={onClear} />);

    await user.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
