import { useState } from 'react';
import { toast } from 'sonner';
import { MessageSquare, Pencil, Trash2, X } from 'lucide-react';
import type { CommentDTO } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-states/empty-state';
import { initials, useMembers } from '@/hooks/use-members';
import { useAuthStore } from '@/stores/auth-store';
import { bodyToText, textToBody } from '../lib/comment-body';
import { CommentComposer } from './comment-composer';
import { useComments, useDeleteComment, useUpdateComment } from '../hooks/use-comments';

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function CommentItem({
  taskId,
  comment,
}: {
  taskId: string;
  comment: CommentDTO;
}): React.JSX.Element {
  const { byId } = useMembers();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const update = useUpdateComment(taskId);
  const del = useDeleteComment(taskId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => bodyToText(comment.body));

  const author = byId(comment.authorId);
  const isAuthor = comment.authorId === currentUserId;
  const mentioned = comment.mentions.map((id) => byId(id)?.name).filter(Boolean) as string[];

  const saveEdit = async (): Promise<void> => {
    await update.mutateAsync({ id: comment.id, input: { body: textToBody(draft) } });
    setEditing(false);
  };

  const remove = (): void => {
    del.mutate(comment.id, { onSuccess: () => toast.success('Comment deleted') });
  };

  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {initials(author?.name ?? 'U')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{author?.name ?? 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">{relativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span className="text-xs text-muted-foreground">(edited)</span>}
          {isAuthor && !editing && (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Edit comment"
                onClick={() => {
                  setDraft(bodyToText(comment.body));
                  setEditing(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-destructive hover:text-destructive"
                aria-label="Delete comment"
                onClick={remove}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void saveEdit()} disabled={update.isPending}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm">{bodyToText(comment.body)}</p>
        )}

        {mentioned.length > 0 && !editing && (
          <div className="mt-1 flex flex-wrap gap-1">
            {mentioned.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
              >
                @{name}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function CommentThread({ taskId }: { taskId: string }): React.JSX.Element {
  const { data: comments, isLoading, isError } = useComments(taskId);

  return (
    <div className="space-y-4">
      <CommentComposer taskId={taskId} />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState title="Couldn't load comments" description="Try again in a moment." />
      ) : (comments?.length ?? 0) === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No comments yet"
          description="Start the conversation."
        />
      ) : (
        <ul className="space-y-5">
          {comments?.map((c) => (
            <CommentItem key={c.id} taskId={taskId} comment={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
