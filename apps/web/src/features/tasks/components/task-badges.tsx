import type { TaskPriority, TaskStatus } from '@ai-projectos/shared';
import { cn } from '@/lib/utils';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

export const STATUS_ORDER: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  high: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  urgent: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

export function PriorityBadge({ priority }: { priority: TaskPriority }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
        PRIORITY_STYLES[priority],
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }): React.JSX.Element {
  return (
    <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {STATUS_LABELS[status]}
    </span>
  );
}
