import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckSquare, Plus, Search } from 'lucide-react';
import type { TaskDTO, TaskStatus } from '@ai-projectos/shared';
import { TASK_PRIORITIES, TASK_STATUSES } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-states/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useProjects } from '@/features/projects/hooks/use-projects';
import { KanbanBoard } from '../components/kanban-board';
import { TaskTable } from '../components/task-table';
import { TaskFormDialog } from '../components/task-form-dialog';
import { STATUS_LABELS } from '../components/task-badges';

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Newest' },
  { value: 'createdAt', label: 'Oldest' },
  { value: '-priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
] as const;

export default function TasksPage(): React.JSX.Element {
  const navigate = useNavigate();
  const canCreate = useCan('task:create');
  const [searchParams, setSearchParams] = useSearchParams();

  const view = searchParams.get('view') === 'table' ? 'table' : 'board';
  const projectParam = searchParams.get('project') ?? '';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDTO | undefined>(undefined);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus | undefined>(undefined);

  const q = useDebouncedValue(search, 300);

  const { data: projectsPage, isLoading: projectsLoading } = useProjects({
    status: 'active',
    page: 1,
    pageSize: 100,
  });
  const projects = useMemo(() => projectsPage?.items ?? [], [projectsPage]);

  const projectId = projectParam || projects[0]?.id || '';

  // Seed the ?project= param once projects load so deep links are shareable.
  useEffect(() => {
    if (!projectParam && projects[0]) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('project', projects[0]!.id);
          return next;
        },
        { replace: true },
      );
    }
  }, [projectParam, projects, setSearchParams]);

  const setParam = (key: string, value: string): void =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    });

  const openCreate = (initialStatus?: TaskStatus): void => {
    setEditing(undefined);
    setDefaultStatus(initialStatus);
    setDialogOpen(true);
  };
  const openEdit = (task: TaskDTO): void => {
    setEditing(task);
    setDefaultStatus(undefined);
    setDialogOpen(true);
  };

  const tableParams = {
    projectId,
    q: q.trim() || undefined,
    status: status || undefined,
    priority: priority || undefined,
    sort,
    limit: 30,
  };

  if (projectsLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={CheckSquare}
          title="No projects yet"
          description="Create a project first, then start adding tasks."
          action={
            <Button variant="outline" onClick={() => navigate('/projects')}>
              Go to projects
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Plan and track work on the board or table.</p>
        </div>
        {canCreate && projectId && (
          <Button onClick={() => openCreate()}>
            <Plus />
            New task
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className={selectClass}
          value={projectId}
          onChange={(e) => setParam('project', e.target.value)}
          aria-label="Select project"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <Tabs value={view} onValueChange={(v) => setParam('view', v)}>
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
        </Tabs>

        {view === 'table' && (
          <>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="pl-9"
                aria-label="Search tasks"
              />
            </div>
            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Filter by priority"
            >
              <option value="">All priorities</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort tasks"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {view === 'board' ? (
          <KanbanBoard
            projectId={projectId}
            onOpenTask={(id) => navigate(`/tasks/${id}`)}
            onQuickAdd={(s) => openCreate(s)}
          />
        ) : (
          <TaskTable
            params={tableParams}
            onOpenTask={(id) => navigate(`/tasks/${id}`)}
            onEditTask={openEdit}
          />
        )}
      </div>

      {projectId && (
        <TaskFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          task={editing}
          defaultStatus={defaultStatus}
        />
      )}
    </div>
  );
}
