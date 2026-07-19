import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectFormDialog } from './project-form-dialog';

const createMutate = vi.fn().mockResolvedValue({ id: 'p1', key: 'MOB', name: 'Mobile' });
const updateMutate = vi.fn().mockResolvedValue({ id: 'p1', key: 'MOB', name: 'Mobile' });

vi.mock('../hooks/use-projects', () => ({
  useCreateProject: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateProject: () => ({ mutateAsync: updateMutate, isPending: false }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], isLoading: false }),
}));

describe('ProjectFormDialog', () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
  });

  it('blocks submit and shows validation for an empty name', async () => {
    const user = userEvent.setup();
    render(<ProjectFormDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('rejects an invalid project key', async () => {
    const user = userEvent.setup();
    render(<ProjectFormDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText(/name/i), 'Mobile App');
    await user.type(screen.getByLabelText(/key/i), '1');
    await user.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText(/start with a letter/i)).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('submits a valid new project', async () => {
    const user = userEvent.setup();
    render(<ProjectFormDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText(/name/i), 'Mobile App');
    await user.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mobile App' }),
      ),
    );
  });
});
