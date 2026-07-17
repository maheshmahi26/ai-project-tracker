import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import { ToolCallCard } from './tool-call-card';
import type { StreamToolCall } from '../lib/chat-stream';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: StreamToolCall[];
  /** Assistant turn still streaming — shows a blinking caret. */
  streaming?: boolean;
  error?: { code: string; message: string };
  onConfirm?: () => void;
  confirmDisabled?: boolean;
}

export function MessageBubble({
  role,
  content,
  toolCalls = [],
  streaming = false,
  error,
  onConfirm,
  confirmDisabled,
}: MessageBubbleProps): React.JSX.Element {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
        aria-hidden
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div className={cn('min-w-0 max-w-[85%]', isUser && 'flex flex-col items-end')}>
        {toolCalls.length > 0 && (
          <div className="w-full">
            {toolCalls.map((call) => (
              <ToolCallCard
                key={call.callId}
                call={call}
                onConfirm={onConfirm}
                confirmDisabled={confirmDisabled}
              />
            ))}
          </div>
        )}

        {(content || (!isUser && streaming)) && (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-foreground',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</p>
            ) : (
              <>
                <Markdown content={content} />
                {streaming && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground align-text-bottom" />
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mt-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </div>
        )}
      </div>
    </div>
  );
}
