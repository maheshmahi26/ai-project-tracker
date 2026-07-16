import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type CreateTaskInput,
  type TaskDTO,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskInput,
} from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { STATUS_LABELS } from './task-badges';
import { AssigneePicker } from './assignee-picker';
import { useCreateTask, useUpdateTask } from '../hooks/use-tasks';

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface FormValues {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  storyPoints: string;
  dueDate: string;
}

function toFormValues(task: TaskDTO | undefined, defaultStatus?: TaskStatus): FormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? defaultStatus ?? 'todo',
    priority: task?.priority ?? 'medium',
    assigneeId: task?.assigneeId ?? null,
    storyPoints: task?.storyPoints != null ? String(task.storyPoints) : '',
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
  };
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  task?: TaskDTO;
  defaultStatus?: TaskStatus;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  projectId,
  task,
  defaultStatus,
}: TaskFormDialogProps): React.JSX.Element {
  const isEdit = Boolean(task);
  const create = useCreateTask();
  const update = useUpdateTask();
  const pending = create.isPending || update.isPending;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: toFormValues(task, defaultStatus) });

  useEffect(() => {
    if (open) reset(toFormValues(task, defaultStatus));
  }, [open, task, defaultStatus, reset]);

  const assigneeId = watch('assigneeId');

  const parsePoints = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const onSubmit = handleSubmit(async (values) => {
    const points = parsePoints(values.storyPoints);
    if (isEdit && task) {
      const input: UpdateTaskInput = {
        title: values.title.trim(),
        description: values.description.trim() ? values.description : null,
        status: values.status,
        priority: values.priority,
        assigneeId: values.assigneeId,
        storyPoints: points,
        dueDate: values.dueDate || null,
      };
      await update.mutateAsync({ id: task.id, input });
      toast.success('Task updated');
    } else {
      const input: CreateTaskInput = {
        projectId,
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        status: values.status,
        priority: values.priority,
        assigneeId: values.assigneeId ?? undefined,
        storyPoints: points ?? undefined,
        dueDate: values.dueDate || undefined,
      };
      const created = await create.mutateAsync(input);
      toast.success(`Task ${created.key} created`);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the task details.' : 'Add a task to this project.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="Implement login form"
              aria-invalid={Boolean(errors.title)}
              {...register('title', {
                validate: (v) => v.trim().length >= 1 || 'Title is required',
              })}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" rows={3} {...register('description')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-status">Status</Label>
              <select id="task-status" className={selectClass} {...register('status')}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <select id="task-priority" className={selectClass} {...register('priority')}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assignee</Label>
              <AssigneePicker
                value={assigneeId}
                onChange={(id) => setValue('assigneeId', id)}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-points">Story points</Label>
              <Input
                id="task-points"
                type="number"
                min={0}
                max={100}
                placeholder="—"
                {...register('storyPoints')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-due">Due date</Label>
            <Input id="task-due" type="date" {...register('dueDate')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
