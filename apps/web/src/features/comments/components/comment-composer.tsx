import { useState } from 'react';
import { AtSign, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { initials, useMembers } from '@/hooks/use-members';
import { cn } from '@/lib/utils';
import { textToBody } from '../lib/comment-body';
import { useCreateComment } from '../hooks/use-comments';

export function CommentComposer({ taskId }: { taskId: string }): React.JSX.Element {
  const { members } = useMembers();
  const create = useCreateComment(taskId);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Set<string>>(new Set());

  const toggleMention = (userId: string): void =>
    setMentions((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const submit = async (): Promise<void> => {
    if (!text.trim()) return;
    await create.mutateAsync({
      body: textToBody(text),
      mentions: mentions.size ? [...mentions] : undefined,
    });
    setText('');
    setMentions(new Set());
  };

  const mentioned = members.filter((m) => mentions.has(m.userId));

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment…"
        rows={3}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <AtSign />
                Mention
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-72 w-56 overflow-y-auto p-1">
              {members.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No members</p>
              ) : (
                members.map((m) => {
                  const on = mentions.has(m.userId);
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleMention(m.userId)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                        on && 'bg-accent',
                      )}
                    >
                      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px]">
                        {initials(m.name)}
                      </span>
                      <span className="flex-1 truncate">{m.name}</span>
                      {on && <Check className="size-4" />}
                    </button>
                  );
                })
              )}
            </PopoverContent>
          </Popover>
          {mentioned.map((m) => (
            <span
              key={m.userId}
              className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
            >
              @{m.name}
            </span>
          ))}
        </div>
        <Button size="sm" onClick={() => void submit()} disabled={!text.trim() || create.isPending}>
          {create.isPending ? 'Posting…' : 'Comment'}
        </Button>
      </div>
    </div>
  );
}
