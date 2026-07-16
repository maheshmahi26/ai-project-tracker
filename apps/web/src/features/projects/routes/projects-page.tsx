import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, Search } from 'lucide-react';
import type { ProjectDTO } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-states/empty-state';
import { useCan } from '@/hooks/use-can';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ProjectFormDialog } from '../components/project-form-dialog';
import { ProjectRowActions } from '../components/project-row-actions';
import { ProjectStatusBadge } from '../components/project-status-badge';
import { useProjects } from '../hooks/use-projects';

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
] as const;

const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Newest' },
  { value: 'createdAt', label: 'Oldest' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'key', label: 'Key' },
] as const;

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export default function ProjectsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const canCreate = useCan('project:create');

  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [sort, setSort] = useState<string>('-createdAt');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectDTO | undefined>(undefined);

  const q = useDebouncedValue(search, 300);

  // Any filter change resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [status, sort, q]);

  const { data, isLoading, isError } = useProjects({
    status,
    q: q.trim() || undefined,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = data?.page?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];

  const openCreate = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const openEdit = (project: ProjectDTO): void => {
    setEditing(project);
    setDialogOpen(true);
  };

  const columns = useMemo<Array<Column<ProjectDTO>>>(
    () => [
      {
        key: 'key',
        header: 'Key',
        className: 'w-24',
        cell: (p) => (
          <span className="inline-flex items-center gap-2 font-mono text-xs font-medium">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.key}
          </span>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        cell: (p) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            {p.description && (
              <p className="truncate text-xs text-muted-foreground">{p.description}</p>
            )}
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'w-28',
        cell: (p) => <ProjectStatusBadge status={p.status} />,
      },
      {
        key: 'created',
        header: 'Created',
        className: 'w-32',
        cell: (p) => (
          <span className="text-xs text-muted-foreground">
            {new Date(p.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        className: 'w-12 text-right',
        cell: (p) => <ProjectRowActions project={p} onEdit={openEdit} />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Organize work into projects.</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus />
            New project
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <select
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort projects"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={items}
        getRowId={(p) => p.id}
        isLoading={isLoading}
        onRowClick={(p) => navigate(`/projects/${p.id}`)}
        emptyState={
          isError ? (
            <EmptyState
              icon={FolderKanban}
              title="Couldn't load projects"
              description="Something went wrong. Try again."
            />
          ) : (
            <EmptyState
              icon={FolderKanban}
              title={q ? 'No matching projects' : 'No projects yet'}
              description={
                q
                  ? 'Try a different search or filter.'
                  : 'Create your first project to start planning sprints and tasks.'
              }
              action={
                canCreate && !q ? (
                  <Button variant="outline" onClick={openCreate}>
                    <Plus />
                    Create project
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} project{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ProjectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editing} />
    </div>
  );
}
