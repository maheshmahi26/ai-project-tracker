import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Code2,
  FolderKanban,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import type { Role } from '@ai-projectos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartFrame } from '@/components/charts/chart-frame';
import { useMembers } from '@/hooks/use-members';
import {
  useBurndown,
  useOverview,
  usePriorityDistribution,
  useProjectProgress,
  useTasksPerUser,
  useUsersByRole,
  useVelocity,
} from '../hooks/use-dashboard';
import { useSprints } from '@/features/sprints/hooks/use-sprints';
import { WidgetState } from './widget-state';
import {
  BurndownChart,
  CompletionChart,
  PriorityDistributionChart,
  ProjectProgressChart,
  TasksPerUserChart,
  VelocityChart,
} from './charts/lazy';

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface ScopeProps {
  projectId?: string;
}

export function OverviewStats({ projectId }: ScopeProps): React.JSX.Element {
  const { data, isLoading } = useOverview({ projectId });

  const stats = [
    { label: 'Active projects', value: data?.projects.active, icon: FolderKanban },
    { label: 'Open tasks', value: data?.tasks.open, icon: Clock },
    { label: 'Completed', value: data?.tasks.done, icon: CheckCircle2 },
    { label: 'Overdue', value: data?.tasks.overdue, icon: AlertTriangle },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </CardTitle>
            <stat.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold">{stat.value ?? 0}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CompletionWidget({ projectId }: ScopeProps): React.JSX.Element {
  const { data, isLoading, isError } = useOverview({ projectId });
  const empty = !data || data.tasks.total === 0;
  return (
    <ChartFrame title="Completed vs pending">
      <WidgetState isLoading={isLoading} isError={isError} isEmpty={empty} emptyLabel="No tasks yet.">
        {data && <CompletionChart done={data.tasks.done} open={data.tasks.open} />}
      </WidgetState>
    </ChartFrame>
  );
}

export function PriorityWidget({ projectId }: ScopeProps): React.JSX.Element {
  const { data, isLoading, isError } = usePriorityDistribution({ projectId });
  const empty = !data || data.every((d) => d.count === 0);
  return (
    <ChartFrame title="Priority distribution">
      <WidgetState isLoading={isLoading} isError={isError} isEmpty={empty} emptyLabel="No tasks yet.">
        {data && <PriorityDistributionChart data={data} />}
      </WidgetState>
    </ChartFrame>
  );
}

export function VelocityWidget({ projectId }: ScopeProps): React.JSX.Element {
  const { data, isLoading, isError } = useVelocity({ projectId });
  const empty = !data || data.length === 0;
  return (
    <ChartFrame title="Velocity (points per sprint)">
      <WidgetState
        isLoading={isLoading}
        isError={isError}
        isEmpty={empty}
        emptyLabel="No sprints yet."
      >
        {data && <VelocityChart data={data} />}
      </WidgetState>
    </ChartFrame>
  );
}

export function TasksPerUserWidget({ projectId }: ScopeProps): React.JSX.Element {
  const { data, isLoading, isError } = useTasksPerUser({ projectId });
  const { byId } = useMembers();

  const rows = useMemo(
    () =>
      (data ?? []).map((r) => ({
        name: r.assigneeId ? (byId(r.assigneeId)?.name ?? 'Unknown') : 'Unassigned',
        Done: r.done,
        Open: r.open,
      })),
    [data, byId],
  );
  const empty = rows.length === 0;

  return (
    <ChartFrame title="Tasks per user">
      <WidgetState isLoading={isLoading} isError={isError} isEmpty={empty} emptyLabel="No tasks yet.">
        <TasksPerUserChart data={rows} />
      </WidgetState>
    </ChartFrame>
  );
}

export function ProjectProgressWidget(): React.JSX.Element {
  const { data, isLoading, isError } = useProjectProgress();
  const empty = !data || data.length === 0;
  return (
    <ChartFrame title="Project progress">
      <WidgetState
        isLoading={isLoading}
        isError={isError}
        isEmpty={empty}
        emptyLabel="No projects yet."
      >
        {data && <ProjectProgressChart data={data} />}
      </WidgetState>
    </ChartFrame>
  );
}

const ROLE_META: Record<Role, { label: string; icon: typeof Users; className: string }> = {
  admin: { label: 'Admins', icon: ShieldCheck, className: 'text-purple-600 dark:text-purple-400' },
  manager: { label: 'Managers', icon: UserCog, className: 'text-amber-600 dark:text-amber-400' },
  developer: { label: 'Developers', icon: Code2, className: 'text-blue-600 dark:text-blue-400' },
  tester: { label: 'Testers', icon: Bug, className: 'text-emerald-600 dark:text-emerald-400' },
};

const TEAM_ROLE_ORDER: Role[] = ['manager', 'developer', 'tester', 'admin'];

export function TeamByRoleWidget(): React.JSX.Element {
  const { data, isLoading, isError } = useUsersByRole();
  const empty = !data || data.total === 0;

  return (
    <ChartFrame title="Team by role">
      <WidgetState
        isLoading={isLoading}
        isError={isError}
        isEmpty={empty}
        emptyLabel="No members yet."
      >
        {data && (
          <div className="grid grid-cols-2 gap-3">
            {TEAM_ROLE_ORDER.map((role) => {
              const meta = ROLE_META[role];
              const Icon = meta.icon;
              return (
                <div
                  key={role}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <Icon className={`size-4 ${meta.className}`} />
                  </span>
                  <div>
                    <div className="text-lg font-semibold leading-none">
                      {data.byRole[role] ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">{meta.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </WidgetState>
    </ChartFrame>
  );
}

export function BurndownWidget({ projectId }: ScopeProps): React.JSX.Element {
  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectId);
  const [selected, setSelected] = useState<string>('');

  const sprintId =
    selected || sprints?.find((s) => s.status === 'active')?.id || sprints?.[0]?.id || '';

  const { data, isLoading, isError } = useBurndown(sprintId || undefined);

  const selector =
    sprints && sprints.length > 0 ? (
      <select
        className={selectClass}
        value={sprintId}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Select sprint"
      >
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    ) : null;

  const noSprints = !sprintsLoading && (!sprints || sprints.length === 0);
  const emptyLabel = !projectId
    ? 'Select a project to view its burndown.'
    : 'No sprints to burn down yet.';

  return (
    <ChartFrame title="Sprint burndown" action={selector}>
      <WidgetState
        isLoading={Boolean(projectId) && (sprintsLoading || (Boolean(sprintId) && isLoading))}
        isError={isError}
        isEmpty={noSprints || !data}
        emptyLabel={emptyLabel}
      >
        {data && <BurndownChart data={data} />}
      </WidgetState>
    </ChartFrame>
  );
}
