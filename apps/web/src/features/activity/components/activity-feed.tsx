import { Activity as ActivityIcon } from 'lucide-react';
import type { ActivityLogDTO } from '@ai-projectos/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-states/empty-state';
import { useActivity } from '../hooks/use-activity';

function formatVerb(entry: ActivityLogDTO): string {
  const verb = entry.verb.replace(/[._]/g, ' ');
  return `${verb} ${entry.object.label}`.trim();
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ActivityFeed({
  projectId,
  entityType,
  entityId,
}: {
  projectId?: string;
  entityType?: string;
  entityId?: string;
}): React.JSX.Element {
  const { data, isLoading, isError } = useActivity({
    ...(projectId ? { projectId } : {}),
    ...(entityType && entityId ? { entityType, entityId } : {}),
  });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || items.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title={isError ? "Couldn't load activity" : 'No activity yet'}
        description={
          isError ? 'Try again in a moment.' : 'Changes to this project will show up here.'
        }
      />
    );
  }

  return (
    <ol className="space-y-4">
      {items.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <ActivityIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm">
              <span className="capitalize">{formatVerb(entry)}</span>
            </p>
            <p className="text-xs text-muted-foreground">{relativeTime(entry.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
