import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityFeed } from '@/features/activity/components/activity-feed';
import { useProjects } from '@/features/projects/hooks/use-projects';
import { useCan } from '@/hooks/use-can';
import {
  BurndownWidget,
  CompletionWidget,
  OverviewStats,
  PriorityWidget,
  ProjectProgressWidget,
  TasksPerUserWidget,
  VelocityWidget,
} from '../components/dashboard-widgets';
import { WeeklyReport } from '../components/weekly-report';
import { useExportTasks } from '../hooks/use-dashboard';

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export default function DashboardPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectParam = searchParams.get('project') ?? '';

  const canExport = useCan('export');
  const exportTasks = useExportTasks();

  const { data: projectsPage } = useProjects({ status: 'active', page: 1, pageSize: 100 });
  const projects = useMemo(() => projectsPage?.items ?? [], [projectsPage]);

  // Empty string = all projects (org-wide). Only pass a real id downstream.
  const scope = { projectId: projectParam || undefined };

  const setProject = (value: string): void =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('project', value);
        else next.delete('project');
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Delivery analytics{projectParam ? ' for the selected project.' : ' across your organization.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className={selectClass}
            value={projectParam}
            onChange={(e) => setProject(e.target.value)}
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {canExport && (
            <Button
              variant="outline"
              onClick={() => exportTasks.mutate(scope)}
              disabled={exportTasks.isPending}
            >
              {exportTasks.isPending ? <Loader2 className="animate-spin" /> : <Download />}
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <OverviewStats projectId={scope.projectId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CompletionWidget projectId={scope.projectId} />
        <PriorityWidget projectId={scope.projectId} />
        <VelocityWidget projectId={scope.projectId} />
        <BurndownWidget projectId={scope.projectId} />
        <TasksPerUserWidget projectId={scope.projectId} />
        <ProjectProgressWidget />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeeklyReport projectId={scope.projectId} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed {...(scope.projectId ? { projectId: scope.projectId } : {})} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
