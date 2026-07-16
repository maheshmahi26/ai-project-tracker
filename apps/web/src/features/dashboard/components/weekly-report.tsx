import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useMembers } from '@/hooks/use-members';
import { useWeeklyReport } from '../hooks/use-dashboard';

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function WeeklyReport({ projectId }: { projectId?: string }): React.JSX.Element {
  const { data, isLoading, isError } = useWeeklyReport({ projectId });
  const { byId } = useMembers();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weekly report</CardTitle>
        <CardDescription>
          {data ? `${fmt(data.rangeStart)} – ${fmt(data.rangeEnd)}` : 'Last 7 days'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-40 w-full" />}
        {isError && <p className="text-sm text-destructive">Couldn&apos;t load the weekly report.</p>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Created" value={data.createdCount} />
              <Stat label="Completed" value={data.completedCount} />
              <Stat label="Active sprints" value={data.activeSprints} />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Created by priority</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.createdByPriority).map(([priority, count]) => (
                  <Badge key={priority} variant="secondary" className="capitalize">
                    {priority}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Top contributors</p>
              {data.topContributors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed work this week.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.topContributors.map((c) => (
                    <li key={c.assigneeId} className="flex items-center justify-between text-sm">
                      <span>{byId(c.assigneeId)?.name ?? 'Unknown user'}</span>
                      <span className="font-medium">{c.done} done</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
