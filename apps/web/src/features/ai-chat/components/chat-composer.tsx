import { useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_LEN = 4000;

export function ChatComposer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask the assistant to create a task, plan a sprint, summarize progress…',
}: ChatComposerProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const submit = (): void => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={ref}
          value={value}
          disabled={disabled}
          rows={1}
          maxLength={MAX_LEN}
          placeholder={placeholder}
          aria-label="Message the assistant"
          onChange={(e) => {
            setValue(e.target.value);
            grow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={onStop}
            aria-label="Stop generating"
            className="size-9 shrink-0 rounded-full"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="Send message"
            className={cn('size-9 shrink-0 rounded-full')}
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl px-2 text-center text-xs text-muted-foreground">
        The assistant uses the same tools and permissions as the UI. Actions are audited.
      </p>
    </div>
  );
}
