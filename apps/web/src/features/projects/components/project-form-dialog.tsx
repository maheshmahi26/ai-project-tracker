import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  projectKeySchema,
  type CreateProjectInput,
  type ProjectDTO,
  type UpdateProjectInput,
} from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateProject, useUpdateProject } from '../hooks/use-projects';

interface FormValues {
  name: string;
  key: string;
  description: string;
  color: string;
  startDate: string;
  targetDate: string;
}

function toFormValues(project?: ProjectDTO): FormValues {
  return {
    name: project?.name ?? '',
    key: project?.key ?? '',
    description: project?.description ?? '',
    color: project?.color ?? '#4f46e5',
    startDate: project?.startDate ? project.startDate.slice(0, 10) : '',
    targetDate: project?.targetDate ? project.targetDate.slice(0, 10) : '',
  };
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectDTO;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: ProjectFormDialogProps): React.JSX.Element {
  const isEdit = Boolean(project);
  const create = useCreateProject();
  const update = useUpdateProject();
  const pending = create.isPending || update.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: toFormValues(project) });

  // Re-seed the form whenever the target project (or open state) changes.
  useEffect(() => {
    if (open) reset(toFormValues(project));
  }, [open, project, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (isEdit && project) {
      const input: UpdateProjectInput = {
        name: values.name.trim(),
        description: values.description.trim() ? values.description.trim() : null,
        color: values.color,
        startDate: values.startDate || null,
        targetDate: values.targetDate || null,
      };
      await update.mutateAsync({ id: project.id, input });
      toast.success('Project updated');
    } else {
      const input: CreateProjectInput = {
        name: values.name.trim(),
        key: values.key.trim() ? values.key.trim().toUpperCase() : undefined,
        description: values.description.trim() || undefined,
        color: values.color || undefined,
        startDate: values.startDate || undefined,
        targetDate: values.targetDate || undefined,
      };
      const created = await create.mutateAsync(input);
      toast.success(`Project ${created.key} created`);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the project details.'
              : 'Create a project to group sprints and tasks.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="Mobile App"
              aria-invalid={Boolean(errors.name)}
              {...register('name', {
                validate: (v) =>
                  v.trim().length >= 2 || 'Name must be at least 2 characters',
              })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="project-key">
                Key <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="project-key"
                placeholder="MOB"
                className="uppercase"
                aria-invalid={Boolean(errors.key)}
                {...register('key', {
                  validate: (v) =>
                    !v.trim() ||
                    projectKeySchema.safeParse(v).success ||
                    '2–10 chars, start with a letter (A–Z, 0–9)',
                })}
              />
              {errors.key ? (
                <p className="text-xs text-destructive">{errors.key.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Used for task ids like <code>MOB-123</code>. Auto-generated if blank.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <textarea
              id="project-description"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="What is this project about?"
              {...register('description', {
                validate: (v) => v.length <= 2000 || 'Description is too long',
              })}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="project-color">Color</Label>
              <Input id="project-color" type="color" className="h-9 p-1" {...register('color')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-start">Start date</Label>
              <Input id="project-start" type="date" {...register('startDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-target">Target date</Label>
              <Input id="project-target" type="date" {...register('targetDate')} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
