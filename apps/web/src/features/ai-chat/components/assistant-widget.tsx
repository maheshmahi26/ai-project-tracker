import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Bot, ChevronDown, Loader2, Maximize2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiClientError } from '@/lib/api-client';
import { useUiStore } from '@/stores/ui-store';
import { useOrgStore } from '@/stores/org-store';
import { MessageBubble } from './message-bubble';
import { ChatComposer } from './chat-composer';
import { useChatMessages, useChatSessions, useCreateSession, useSendMessage } from '../hooks/use-chat';
import { mergeToolCalls } from '../lib/chat-stream';
import { CONFIRM_REPLY } from '../lib/confirm';

/**
 * Bottom-right floating assistant. A circular button opens a compact chat window
 * that talks to the same agent as the full /chat page, so the user can act
 * without leaving the board or task they're on. They can switch between existing
 * conversations or expand into the full-page experience.
 */
export function AssistantWidget(): React.JSX.Element | null {
  const navigate = useNavigate();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const open = useUiStore((s) => s.assistantWidgetOpen);
  const setOpen = useUiStore((s) => s.setAssistantWidgetOpen);
  const sessionId = useUiStore((s) => s.assistantWidgetSessionId);
  const setSessionId = useUiStore((s) => s.setAssistantWidgetSessionId);

  const sessions = useChatSessions();
  const createSession = useCreateSession();
  const { messages, isLoading: messagesLoading } = useChatMessages(sessionId ?? undefined);
  const { pendingUser, turn, isStreaming, send, stop } = useSendMessage(sessionId ?? undefined);

  const [autoSend, setAutoSend] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default the widget to the most recent conversation when it has none selected.
  useEffect(() => {
    if (!open || sessionId) return;
    const latest = sessions.data?.[0];
    if (!sessions.isLoading && latest) {
      setSessionId(latest.id);
    }
  }, [open, sessionId, sessions.isLoading, sessions.data, setSessionId]);

  // Send the first message once the freshly created session is bound.
  useEffect(() => {
    if (sessionId && autoSend) {
      void send(autoSend);
      setAutoSend(null);
    }
  }, [sessionId, autoSend, send]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, turn?.content, turn?.toolCalls.length, pendingUser, open]);

  if (!activeOrgId) return null;

  const activeTitle = sessions.data?.find((s) => s.id === sessionId)?.title ?? 'New chat';
  const lastAssistantIdx = [...messages].map((m) => m.role).lastIndexOf('assistant');

  const handleSend = (content: string): void => {
    if (sessionId) {
      void send(content);
      return;
    }
    createSession.mutate(
      {},
      {
        onSuccess: (session) => {
          setAutoSend(content);
          setSessionId(session.id);
        },
        onError: (err) =>
          toast.error(err instanceof ApiClientError ? err.message : 'Could not start a chat'),
      },
    );
  };

  const startNew = (): void => setSessionId(null);

  const expand = (): void => {
    setOpen(false);
    navigate(sessionId ? `/chat/${sessionId}` : '/chat');
  };

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg"
      >
        <Bot className="size-6" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[32rem] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="size-5 text-primary" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 max-w-[10rem] gap-1 px-2">
              <span className="truncate text-sm font-medium">{activeTitle}</span>
              <ChevronDown className="size-3.5 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
            <DropdownMenuItem onSelect={startNew}>
              <Plus />
              New chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Recent chats</DropdownMenuLabel>
            {(sessions.data ?? []).map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => setSessionId(s.id)}>
                <span className="truncate">{s.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Expand to full chat"
            onClick={expand}
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messagesLoading && messages.length === 0 ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : messages.length === 0 && !pendingUser && !turn ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Bot className="size-8" />
            <p>Ask me to create a task, plan a sprint, or summarize progress.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, idx) =>
              m.role === 'user' || m.role === 'assistant' ? (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  toolCalls={
                    m.role === 'assistant' ? mergeToolCalls(m.toolCalls, m.toolResults) : undefined
                  }
                  onConfirm={idx === lastAssistantIdx ? () => void send(CONFIRM_REPLY) : undefined}
                  confirmDisabled={isStreaming}
                />
              ) : null,
            )}
            {pendingUser && <MessageBubble role="user" content={pendingUser} />}
            {turn && (
              <MessageBubble
                role="assistant"
                content={turn.content}
                toolCalls={turn.toolCalls}
                streaming={turn.status === 'streaming'}
                error={turn.error}
                onConfirm={() => void send(CONFIRM_REPLY)}
                confirmDisabled={isStreaming}
              />
            )}
          </div>
        )}
      </div>

      <ChatComposer
        onSend={handleSend}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={createSession.isPending}
        placeholder="Message the assistant…"
      />
    </div>
  );
}
