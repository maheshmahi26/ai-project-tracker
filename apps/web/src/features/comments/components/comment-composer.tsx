import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { initials, useMembers, type MemberOption } from '@/hooks/use-members';
import { cn } from '@/lib/utils';
import { textToBody } from '../lib/comment-body';
import { useCreateComment } from '../hooks/use-comments';

interface MentionQuery {
  /** Index of the triggering "@" within the text. */
  start: number;
  /** Text typed after the "@" up to the caret. */
  value: string;
}

/** Find an in-progress "@mention" ending at the caret, if any. */
function detectMention(text: string, caret: number): MentionQuery | null {
  const upto = text.slice(0, caret);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(upto);
  if (!match) return null;
  const value = match[1] ?? '';
  return { start: caret - value.length - 1, value };
}

export function CommentComposer({ taskId }: { taskId: string }): React.JSX.Element {
  const { members } = useMembers();
  const create = useCreateComment(taskId);
  const [text, setText] = useState('');
  // Ids the user picked via "@"; the final list is reconciled against the text.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo<MemberOption[]>(() => {
    if (!query) return [];
    const q = query.value.toLowerCase();
    return members
      .filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, members]);

  const syncQuery = (el: HTMLTextAreaElement): void => {
    const q = detectMention(el.value, el.selectionStart ?? el.value.length);
    setQuery(q);
    setActiveIndex(0);
  };

  const insertMention = (member: MemberOption): void => {
    if (!query) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, query.start);
    const after = text.slice(caret);
    const token = `@${member.name} `;
    const next = `${before}${token}${after}`;
    setText(next);
    setPicked((prev) => new Set(prev).add(member.userId));
    setQuery(null);
    // Restore the caret just after the inserted token.
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const submit = async (): Promise<void> => {
    if (!text.trim()) return;
    // Keep only mentions whose "@Name" token is still present in the text.
    const mentions = [...picked].filter((id) => {
      const m = members.find((x) => x.userId === id);
      return m ? text.includes(`@${m.name}`) : false;
    });
    await create.mutateAsync({
      body: textToBody(text),
      mentions: mentions.length ? mentions : undefined,
    });
    setText('');
    setPicked(new Set());
    setQuery(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (query && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = suggestions[activeIndex];
        if (picked) insertMention(picked);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            syncQuery(e.target);
          }}
          onClick={(e) => syncQuery(e.currentTarget)}
          onKeyUp={(e) => syncQuery(e.currentTarget)}
          onKeyDown={onKeyDown}
          placeholder="Write a comment… use @ to mention someone"
          rows={3}
        />
        {query && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-60 w-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {suggestions.map((m, idx) => (
              <li key={m.userId}>
                <button
                  type="button"
                  // Use onMouseDown so the textarea doesn't lose focus first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(m);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                    idx === activeIndex && 'bg-accent',
                  )}
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px]">
                    {initials(m.name)}
                  </span>
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={!text.trim() || create.isPending}>
          {create.isPending ? 'Posting…' : 'Comment'}
        </Button>
      </div>
    </div>
  );
}
