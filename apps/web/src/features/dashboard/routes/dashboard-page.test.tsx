import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './dashboard-page';

const canMock = vi.fn();
const exportMutate = vi.fn();

vi.mock('@/hooks/use-can', () => ({ useCan: () => canMock() }));

vi.mock('@/features/projects/hooks/use-projects', () => ({
  useProjects: () => ({
    data: {
      items: [
        { id: 'p1', name: 'Alpha' },
        { id: 'p2', name: 'Beta' },
      ],
    },
  }),
}));

vi.mock('../hooks/use-dashboard', () => ({
  useExportTasks: () => ({ mutate: exportMutate, isPending: false }),
}));

// Stub the heavy chart widgets so Recharts never mounts in jsdom; echo the scope.
vi.mock('../components/dashboard-widgets', () => ({
  OverviewStats: ({ projectId }: { projectId?: string }) => (
    <div>overview:{projectId ?? 'all'}</div>
  ),
  CompletionWidget: () => <div>completion</div>,
  PriorityWidget: () => <div>priority</div>,
  VelocityWidget: () => <div>velocity</div>,
  BurndownWidget: () => <div>burndown</div>,
  TasksPerUserWidget: () => <div>tasks-per-user</div>,
  ProjectProgressWidget: () => <div>project-progress</div>,
}));
vi.mock('../components/weekly-report', () => ({ WeeklyReport: () => <div>weekly</div> }));
vi.mock('@/features/activity/components/activity-feed', () => ({
  ActivityFeed: () => <div>activity</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    canMock.mockReset();
    exportMutate.mockReset();
  });

  it('renders all widgets scoped org-wide by default', () => {
    canMock.mockReturnValue(false);
    renderPage();
    expect(screen.getByText('overview:all')).toBeInTheDocument();
    expect(screen.getByText('velocity')).toBeInTheDocument();
    expect(screen.getByText('burndown')).toBeInTheDocument();
    expect(screen.getByText('weekly')).toBeInTheDocument();
  });

  it('hides the export button without the export permission', () => {
    canMock.mockReturnValue(false);
    renderPage();
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
  });

  it('shows and fires the export button for privileged roles', async () => {
    canMock.mockReturnValue(true);
    renderPage();
    const btn = screen.getByRole('button', { name: /export csv/i });
    await userEvent.click(btn);
    expect(exportMutate).toHaveBeenCalledTimes(1);
  });

  it('re-scopes widgets when the project filter changes (URL state)', async () => {
    canMock.mockReturnValue(false);
    renderPage();
    expect(screen.getByText('overview:all')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/filter by project/i), 'p2');
    expect(screen.getByText('overview:p2')).toBeInTheDocument();
  });
});
