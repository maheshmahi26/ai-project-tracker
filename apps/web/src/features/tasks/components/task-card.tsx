import { forwardRef } from 'react';
import type { TaskDTO } from '@ai-projectos/shared';
import { MessageSquare, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PriorityBadge } from './task-badges';
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
        'group rounded-md border bg-card p-3 text-left shadow-sm transition-colors',
        'hover:border-primary/40',
        dragging && 'opacity-40',
        overlay && 'rotate-2 cursor-grabbing shadow-lg',
        className,
      )}
      {...props}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{task.key}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      <p className="line-clamp-3 text-sm font-medium">{task.title}</p>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
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
