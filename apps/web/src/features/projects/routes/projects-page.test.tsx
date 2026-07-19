import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDTO } from '@ai-projectos/shared';
import ProjectsPage from './projects-page';

const useProjectsMock = vi.fn();

vi.mock('../hooks/use-projects', () => ({
  useProjects: () => useProjectsMock(),
  useCreateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-can', () => ({ useCan: () => true }));
vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], isLoading: false }),
}));
vi.mock('../components/project-row-actions', () => ({
  ProjectRowActions: () => null,
}));

function project(overrides: Partial<ProjectDTO> = {}): ProjectDTO {
  return {
    id: 'p1',
    orgId: 'o1',
    key: 'MOB',
    name: 'Mobile App',
    description: 'iOS + Android',
    status: 'active',
    color: '#4f46e5',
    counters: { taskSeq: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>,
  );
}

describe('ProjectsPage', () => {
  it('renders project rows from the query', () => {
    useProjectsMock.mockReturnValue({
      data: { items: [project(), project({ id: 'p2', key: 'WEB', name: 'Web App' })], page: { total: 2 } },
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getByText('Mobile App')).toBeInTheDocument();
    expect(screen.getByText('Web App')).toBeInTheDocument();
    expect(screen.getByText(/2 projects/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no projects', () => {
    useProjectsMock.mockReturnValue({
      data: { items: [], page: { total: 0 } },
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });
});
