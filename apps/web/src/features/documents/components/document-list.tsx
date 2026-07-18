import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { DocumentDTO, DocumentStatus, DocumentTaskPlan } from '@ai-projectos/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCan } from '@/hooks/use-can';
import { useDeleteDocument, useGenerateDocTasks } from '../hooks/use-documents';

const STATUS: Record<DocumentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  uploaded: { label: 'Queued', variant: 'secondary' },
  processing: { label: 'Indexing…', variant: 'secondary' },
  indexed: { label: 'Indexed', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents }: { documents: DocumentDTO[] }): React.JSX.Element {
  const canDelete = useCan('document:delete');
  const remove = useDeleteDocument();
  const generate = useGenerateDocTasks();
  const [plan, setPlan] = useState<DocumentTaskPlan | null>(null);

  const handleGenerate = (doc: DocumentDTO): void => {
    generate.mutate(
      { id: doc.id },
      {
        onSuccess: setPlan,
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Could not generate tasks'),
      },
    );
  };

  const handleDelete = (doc: DocumentDTO): void => {
    remove.mutate(doc.id, {
      onSuccess: () => toast.success(`Deleted "${doc.title}"`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
    });
  };

  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No documents yet. Upload a PRD, spec, or meeting notes to make it searchable by the assistant.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-lg border">
        {documents.map((doc) => {
          const status = STATUS[doc.status];
          return (
            <li key={doc.id} className="flex items-center gap-3 p-3">
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {doc.sourceType.toUpperCase()} · {formatBytes(doc.sizeBytes)}
                  {doc.status === 'indexed' && ` · ${doc.chunkCount} chunks`}
                  {doc.status === 'failed' && doc.error && ` · ${doc.error}`}
                </p>
              </div>
              <Badge variant={status.variant}>{status.label}</Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={doc.status !== 'indexed' || generate.isPending}
                onClick={() => handleGenerate(doc)}
              >
                {generate.isPending && generate.variables?.id === doc.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                <span className="hidden sm:inline">Generate tasks</span>
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${doc.title}`}
                  onClick={() => handleDelete(doc)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={plan !== null} onOpenChange={(open) => !open && setPlan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Proposed tasks</DialogTitle>
            <DialogDescription>
              Grounded in “{plan?.documentTitle}”. Ask the assistant to “create these tasks” to commit them.
            </DialogDescription>
          </DialogHeader>
          <ol className="max-h-[60vh] space-y-3 overflow-y-auto">
            {plan?.tasks.map((task, i) => (
              <li key={i} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{task.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{task.priority}</Badge>
                    {task.storyPoints != null && <Badge variant="secondary">{task.storyPoints} pts</Badge>}
                  </div>
                </div>
                {task.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
                )}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
