import { Suspense, lazy, useState } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import type { TaskDTO } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-can';
import { useUpdateTask } from '../hooks/use-tasks';

const RichTextEditor = lazy(() => import('./rich-text-editor'));

function isEmptyHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<[^>]*>/g, '').trim().length === 0;
}

export function TaskDescription({ task }: { task: TaskDTO }): React.JSX.Element {
  const canUpdate = useCan('task:update');
  const update = useUpdateTask();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description ?? '');

  const startEdit = (): void => {
    setDraft(task.description ?? '');
    setEditing(true);
  };

  const save = async (): Promise<void> => {
    await update.mutateAsync({
      id: task.id,
      input: { description: isEmptyHtml(draft) ? null : draft },
    });
    toast.success('Description saved');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <RichTextEditor value={draft} onChange={setDraft} placeholder="Describe this task…" />
        </Suspense>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Description</h3>
        {canUpdate && (
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={startEdit}
          >
            <Pencil />
            Edit
          </Button>
        )}
      </div>
      {isEmptyHtml(task.description) ? (
        <button
          type="button"
          onClick={canUpdate ? startEdit : undefined}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {canUpdate ? 'Add a description…' : 'No description.'}
        </button>
      ) : (
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <RichTextEditor value={task.description ?? ''} editable={false} />
        </Suspense>
      )}
    </div>
  );
}
