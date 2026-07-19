import { Bug, BookText, CheckSquare, CalendarClock } from 'lucide-react';
import type { TaskPriority, TaskStatus, TaskType } from '@ai-projectos/shared';
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

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  story: 'Story',
  task: 'Task',
  bug: 'Bug',
};

const TASK_TYPE_META: Record<TaskType, { icon: typeof Bug; className: string }> = {
  story: { icon: BookText, className: 'text-emerald-600 dark:text-emerald-400' },
  task: { icon: CheckSquare, className: 'text-blue-600 dark:text-blue-400' },
  bug: { icon: Bug, className: 'text-red-600 dark:text-red-400' },
};

/** Colored icon indicating the work-item type (story / task / bug). */
export function TaskTypeIcon({
  type,
  className,
  withLabel = false,
}: {
  type: TaskType;
  className?: string;
  withLabel?: boolean;
}): React.JSX.Element {
  const meta = TASK_TYPE_META[type];
  const Icon = meta.icon;
  const label = TASK_TYPE_LABELS[type];
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon className={cn('size-4 shrink-0', meta.className, className)} aria-label={label} />
      {withLabel ? <span className="text-xs font-medium">{label}</span> : null}
    </span>
  );
}

/** Whole-day difference between a due date and now (positive = days remaining). */
function daysUntil(due: Date): number {
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(due) - startOfDay(new Date())) / MS_PER_DAY);
}

/**
 * Compact badge showing time to a task's due date: "Nd left", "Due today", or
 * "Overdue Nd". Done tasks and tasks without a due date render nothing.
 */
export function DueDateBadge({
  dueDate,
  status,
  className,
}: {
  dueDate?: string | null;
  status?: TaskStatus;
  className?: string;
}): React.JSX.Element | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  if (status === 'done') return null;

  const days = daysUntil(due);
  let label: string;
  let tone: string;
  if (days < 0) {
    label = `Overdue ${Math.abs(days)}d`;
    tone = 'bg-red-500/15 text-red-600 dark:text-red-400';
  } else if (days === 0) {
    label = 'Due today';
    tone = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  } else if (days <= 3) {
    label = `${days}d left`;
    tone = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  } else {
    label = `${days}d left`;
    tone = 'bg-muted text-muted-foreground';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
      title={`Due ${due.toLocaleDateString()}`}
    >
      <CalendarClock className="size-3" />
      {label}
    </span>
  );
}
