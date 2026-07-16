import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { TaskDTO } from '@ai-projectos/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-states/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials, useMembers } from '@/hooks/use-members';
import { PriorityBadge, StatusBadge } from './task-badges';
import { BulkActionsBar } from './bulk-actions-bar';
import { useDeleteTask, useInfiniteTasks, useUndoDeleteTask } from '../hooks/use-tasks';
import type { TaskListParams } from '../api/tasks-api';

type Params = TaskListParams;

function RowActions({
  task,
  onEdit,
}: {
  task: TaskDTO;
  onEdit: (task: TaskDTO) => void;
}): React.JSX.Element {
  const del = useDeleteTask();
  const undo = useUndoDeleteTask();

  const handleDelete = (): void => {
    del.mutate(task.id, {
      onSuccess: () => {
        toast.success(`Deleted ${task.key}`, {
          action: { label: 'Undo', onClick: () => undo.mutate(task.id) },
        });
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Task actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onEdit(task)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={handleDelete}
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskTable({
  params,
  onOpenTask,
  onEditTask,
}: {
  params: Params;
  onOpenTask: (id: string) => void;
  onEditTask: (task: TaskDTO) => void;
}): React.JSX.Element {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteTasks(params);
  const { byId } = useMembers();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const tasks = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  // Drop selections that scrolled out of the result set (e.g. after filtering).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(tasks.map((t) => t.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  const toggleAll = (): void =>
    setSelected(allSelected ? new Set() : new Set(tasks.map((t) => t.id)));
  const toggleOne = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <EmptyState title="Couldn't load tasks" description="Try again in a moment." />;
  }

  if (tasks.length === 0) {
    return (
      <EmptyState title="No tasks found" description="Adjust filters or create a new task." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-4 cursor-pointer"
                />
              </th>
              <th className="w-24 px-3 py-2">Key</th>
              <th className="px-3 py-2">Title</th>
              <th className="w-28 px-3 py-2">Status</th>
              <th className="w-24 px-3 py-2">Priority</th>
              <th className="w-40 px-3 py-2">Assignee</th>
              <th className="w-14 px-3 py-2">Pts</th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const member = byId(task.assigneeId);
              const isSelected = selected.has(task.id);
              return (
                <tr
                  key={task.id}
                  onClick={() => onOpenTask(task.id)}
                  className={cn(
                    'cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40',
                    isSelected && 'bg-primary/5',
                  )}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${task.key}`}
                      checked={isSelected}
                      onChange={() => toggleOne(task.id)}
                      className="size-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{task.key}</td>
                  <td className="px-3 py-2 font-medium">{task.title}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-3 py-2">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {member ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px]">
                          {initials(member.name)}
                        </span>
                        <span className="truncate">{member.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{task.storyPoints ?? '—'}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActions task={task} onEdit={onEditTask} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div ref={sentinelRef} className="h-8">
        {isFetchingNextPage && (
          <p className="text-center text-xs text-muted-foreground">Loading more…</p>
        )}
      </div>

      <BulkActionsBar selectedIds={[...selected]} onClear={() => setSelected(new Set())} />
    </div>
  );
}
