import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Clock, FolderKanban, Wifi, WifiOff } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartFrame } from '@/components/charts/chart-frame';
import { EmptyState } from '@/components/empty-states/empty-state';
import { ErrorBoundary } from '@/components/error-boundary/error-boundary';

interface Ping {
  name: string;
  env: string;
  message: string;
}

const STATS = [
  { label: 'Active projects', value: '—', icon: FolderKanban },
  { label: 'Open tasks', value: '—', icon: Clock },
  { label: 'Completed', value: '—', icon: CheckCircle2 },
  { label: 'Activity today', value: '—', icon: Activity },
];

/** Live demo: fetch GET /api/v1/ping through the typed apiClient (envelope unwrapped). */
function ApiStatusCard(): React.JSX.Element {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.health.ping,
    queryFn: () => apiClient.get<Ping>('/ping'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">API connectivity</CardTitle>
        {isError ? (
          <Badge variant="destructive" className="gap-1">
            <WifiOff className="size-3" /> Offline
          </Badge>
        ) : (
          !isLoading && (
            <Badge className="gap-1">
              <Wifi className="size-3" /> Connected
            </Badge>
          )
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-5 w-40" />}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Backend not reachable. Start it with <code>pnpm --filter @ai-projectos/api dev</code>.
          </p>
        )}
        {data && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{data.name}</span> replied{' '}
            <span className="font-mono">{data.message}</span> in{' '}
            <span className="font-mono">{data.env}</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BrokenWidget(): React.JSX.Element {
  throw new Error('This widget crashed on purpose — the error boundary caught it.');
}

/** Demonstrates a widget-level error boundary isolating a crash. */
function ErrorBoundaryDemo(): React.JSX.Element {
  const [crash, setCrash] = useState(false);
  return (
    <ErrorBoundary>
      {crash ? (
        <BrokenWidget />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Resilience demo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Crash this widget to see the error boundary contain the failure without
              taking down the page.
            </p>
            <Button variant="outline" size="sm" onClick={() => setCrash(true)}>
              Crash this widget
            </Button>
          </CardContent>
        </Card>
      )}
    </ErrorBoundary>
  );
}

export default function DashboardPage(): React.JSX.Element {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back. Real metrics arrive with the dashboard feature (TASK-13).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ApiStatusCard />
        <ErrorBoundaryDemo />
      </div>

      <ChartFrame title="Velocity (last 6 sprints)">
        <EmptyState title="No chart data yet" description="Charts are wired up in TASK-13." />
      </ChartFrame>
    </div>
  );
}
