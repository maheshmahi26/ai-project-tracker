import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { TaskDTO } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-can';
import { cn } from '@/lib/utils';
import { useCreateSubtask, useSubtasks, useUpdateTask } from '../hooks/use-tasks';

export function SubtasksSection({ parent }: { parent: TaskDTO }): React.JSX.Element {
  const navigate = useNavigate();
  const canUpdate = useCan('task:update');
  const canCreate = useCan('task:create');
  const { data: subtasks, isLoading } = useSubtasks(parent.id);
  const create = useCreateSubtask(parent.id);
  const update = useUpdateTask();
  const [title, setTitle] = useState('');

  const items = subtasks ?? [];
  const done = items.filter((t) => t.status === 'done').length;

  const add = async (): Promise<void> => {
    if (!title.trim()) return;
    await create.mutateAsync({ title: title.trim() });
    setTitle('');
  };

  const toggle = (task: TaskDTO): void => {
    update.mutate({
      id: task.id,
      input: { status: task.status === 'done' ? 'todo' : 'done' },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Subtasks{' '}
          {items.length > 0 && (
            <span className="font-normal text-muted-foreground">
              ({done}/{items.length})
            </span>
          )}
        </h3>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="size-4 cursor-pointer"
                checked={task.status === 'done'}
                disabled={!canUpdate}
                onChange={() => toggle(task)}
                aria-label={`Mark ${task.key} done`}
              />
              <button
                type="button"
                onClick={() => navigate(`/tasks/${task.id}`)}
                className={cn(
                  'flex-1 truncate text-left text-sm hover:underline',
                  task.status === 'done' && 'text-muted-foreground line-through',
                )}
              >
                <span className="mr-2 font-mono text-xs text-muted-foreground">{task.key}</span>
                {task.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
            placeholder="Add a subtask…"
            className="h-8"
          />
          <Button size="sm" onClick={() => void add()} disabled={!title.trim() || create.isPending}>
            <Plus />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
