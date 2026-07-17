import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToolCallCard } from './tool-call-card';
import type { StreamToolCall } from '../lib/chat-stream';

function renderCard(call: StreamToolCall, props: Partial<{ onConfirm: () => void; confirmDisabled: boolean }> = {}) {
  return render(
    <MemoryRouter>
      <ToolCallCard call={call} {...props} />
    </MemoryRouter>,
  );
}

describe('ToolCallCard', () => {
  it('shows a running spinner and the tool name', () => {
    renderCard({ callId: 'c1', name: 'createTask', args: { title: 'x' }, status: 'running' });
    expect(screen.getByText('createTask')).toBeInTheDocument();
    expect(screen.getByLabelText('Running')).toBeInTheDocument();
  });

  it('reveals arguments as pretty JSON when expanded', async () => {
    const user = userEvent.setup();
    renderCard({ callId: 'c1', name: 'createTask', args: { title: 'Hello' }, status: 'ok', data: {} });
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/"title": "Hello"/)).toBeInTheDocument();
  });

  it('renders a clickable deep link from the result', () => {
    renderCard({
      callId: 'c1',
      name: 'createTask',
      args: {},
      status: 'ok',
      data: { key: 'AUTH-124', url: '/tasks/abc' },
    });
    const link = screen.getByRole('link', { name: 'AUTH-124' });
    expect(link).toHaveAttribute('href', '/tasks/abc');
  });

  it('shows an error payload for a failed tool call', () => {
    renderCard({
      callId: 'c1',
      name: 'deleteTask',
      args: {},
      status: 'error',
      error: { code: 'PERMISSION_DENIED', message: 'Not allowed' },
    });
    expect(screen.getByLabelText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Not allowed/)).toBeInTheDocument();
  });

  it('renders a confirm step for needsConfirmation results and fires onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderCard(
      {
        callId: 'c1',
        name: 'deleteProject',
        args: {},
        status: 'ok',
        data: { needsConfirmation: true, message: 'Delete project Website?' },
      },
      { onConfirm },
    );
    expect(screen.getByText('Delete project Website?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables the confirm button while a turn is streaming', () => {
    renderCard(
      {
        callId: 'c1',
        name: 'deleteProject',
        args: {},
        status: 'ok',
        data: { needsConfirmation: true, message: 'Confirm?' },
      },
      { onConfirm: vi.fn(), confirmDisabled: true },
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
