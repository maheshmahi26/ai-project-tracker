import { forwardRef } from 'react';
import type { TaskDTO } from '@ai-projectos/shared';
import { GitBranch, MessageSquare, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DueDateBadge, PriorityBadge, TaskTypeIcon } from './task-badges';
import { AssigneeAvatar } from './assignee-picker';

interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  task: TaskDTO;
  dragging?: boolean;
  overlay?: boolean;
}

/** Presentational card. `overlay` renders the floating clone during a drag. */
export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(
  ({ task, dragging, overlay, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'group flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-sm transition-all',
        'hover:border-primary/40 hover:shadow-md',
        dragging && 'opacity-40',
        overlay && 'rotate-2 cursor-grabbing shadow-lg',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <TaskTypeIcon type={task.type} />
          <span className="font-mono text-xs text-muted-foreground">{task.key}</span>
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      {task.parentKey ? (
        <span
          className="inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          title={`Subtask of ${task.parentKey}`}
        >
          <GitBranch className="size-3" />
          {task.parentKey}
        </span>
      ) : null}

      <p className="line-clamp-3 text-sm font-medium">{task.title}</p>

      <div className="flex flex-wrap items-center gap-2">
        <DueDateBadge dueDate={task.dueDate} status={task.status} />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {task.commentsCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" />
              {task.commentsCount}
            </span>
          )}
          {task.attachmentsCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" />
              {task.attachmentsCount}
            </span>
          )}
          {task.storyPoints != null && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{task.storyPoints}</span>
          )}
        </div>
        <AssigneeAvatar assigneeId={task.assigneeId} size="xs" />
      </div>
    </div>
  ),
);
TaskCard.displayName = 'TaskCard';
