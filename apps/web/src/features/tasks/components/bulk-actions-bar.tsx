import { toast } from 'sonner';
import { Trash2, X } from 'lucide-react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials, useMembers } from '@/hooks/use-members';
import { STATUS_LABELS } from './task-badges';
import { useBulkDeleteTasks, useBulkUpdateTasks } from '../hooks/use-tasks';

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function BulkActionsBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}): React.JSX.Element | null {
  const bulkUpdate = useBulkUpdateTasks();
  const bulkDelete = useBulkDeleteTasks();
  const { members } = useMembers();
  const count = selectedIds.length;

  if (count === 0) return null;

  const pending = bulkUpdate.isPending || bulkDelete.isPending;

  const applyStatus = async (status: TaskStatus): Promise<void> => {
    await bulkUpdate.mutateAsync({ ids: selectedIds, patch: { status } });
    toast.success(`Moved ${count} task${count > 1 ? 's' : ''} to ${STATUS_LABELS[status]}`);
    onClear();
  };

  const applyPriority = async (priority: TaskPriority): Promise<void> => {
    await bulkUpdate.mutateAsync({ ids: selectedIds, patch: { priority } });
    toast.success(`Updated priority for ${count} task${count > 1 ? 's' : ''}`);
    onClear();
  };

  const applyAssignee = async (assigneeId: string | null): Promise<void> => {
    await bulkUpdate.mutateAsync({ ids: selectedIds, patch: { assigneeId } });
    toast.success(`Reassigned ${count} task${count > 1 ? 's' : ''}`);
    onClear();
  };

  const applyDelete = async (): Promise<void> => {
    await bulkDelete.mutateAsync(selectedIds);
    toast.success(`Deleted ${count} task${count > 1 ? 's' : ''}`);
    onClear();
  };

  return (
    <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <span className="px-1 text-sm font-medium">{count} selected</span>
      <div className="h-5 w-px bg-border" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TASK_STATUSES.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => void applyStatus(s)}>
              {STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            Priority
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TASK_PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onSelect={() => void applyPriority(p)}>
              {PRIORITY_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending}>
            Assignee
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72 w-56 overflow-y-auto">
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void applyAssignee(null)}>Unassigned</DropdownMenuItem>
          {members.map((m) => (
            <DropdownMenuItem key={m.userId} onSelect={() => void applyAssignee(m.userId)}>
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px]">
                {initials(m.name)}
              </span>
              <span className="truncate">{m.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={() => void applyDelete()}
      >
        <Trash2 />
        Delete
      </Button>

      <div className="h-5 w-px bg-border" />
      <Button variant="ghost" size="icon" className="size-7" onClick={onClear} aria-label="Clear selection">
        <X />
      </Button>
    </div>
  );
}
