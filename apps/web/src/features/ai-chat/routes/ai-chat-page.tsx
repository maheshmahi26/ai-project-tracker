import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiClientError } from '@/lib/api-client';
import { MessageBubble } from '../components/message-bubble';
import { ChatComposer } from '../components/chat-composer';
import { SessionSidebar } from '../components/session-sidebar';
import { SuggestedPrompts } from '../components/suggested-prompts';
import {
  useChatMessages,
  useChatSessions,
  useCreateSession,
  useDeleteSession,
  useRenameSession,
  useSendMessage,
} from '../hooks/use-chat';
import { mergeToolCalls } from '../lib/chat-stream';
import { CONFIRM_REPLY } from '../lib/confirm';
import type { ChatSessionDTO } from '@ai-projectos/shared';

export default function AiChatPage(): React.JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const sessions = useChatSessions();
  const createSession = useCreateSession();
  const renameSession = useRenameSession();
  const deleteSession = useDeleteSession();

  const { messages, isLoading: messagesLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useChatMessages(sessionId);
  const { pendingUser, turn, isStreaming, send, stop } = useSendMessage(sessionId);

  const [autoSend, setAutoSend] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatSessionDTO | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Open the most recent session when landing on /chat without an id, so the tab
  // resumes the last conversation instead of always showing a blank chat. Runs
  // once per mount so the explicit "New chat" action isn't bounced back.
  const didAutoResume = useRef(false);

  useEffect(() => {
    if (didAutoResume.current) return;
    if (sessionId) {
      didAutoResume.current = true;
      return;
    }
    const latest = sessions.data?.[0];
    if (!sessions.isLoading && latest) {
      didAutoResume.current = true;
      navigate(`/chat/${latest.id}`, { replace: true });
    }
  }, [sessionId, sessions.isLoading, sessions.data, navigate]);

  // After creating a session for the very first message, send it once we've
  // navigated to the new session route (the send hook rebinds to the new id).
  useEffect(() => {
    if (sessionId && autoSend) {
      void send(autoSend);
      setAutoSend(null);
    }
  }, [sessionId, autoSend, send]);

  // Keep the newest message in view as tokens stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, turn?.content, turn?.toolCalls.length, pendingUser]);

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
          navigate(`/chat/${session.id}`);
        },
        onError: (err) =>
          toast.error(err instanceof ApiClientError ? err.message : 'Could not start a chat'),
      },
    );
  };

  const handleNew = (): void => {
    navigate('/chat');
  };

  const handleDelete = (session: ChatSessionDTO): void => {
    deleteSession.mutate(session.id, {
      onSuccess: () => {
        toast.success('Chat deleted');
        if (session.id === sessionId) navigate('/chat');
      },
      onError: () => toast.error('Could not delete chat'),
    });
  };

  const openRename = (session: ChatSessionDTO): void => {
    setRenameTarget(session);
    setRenameValue(session.title);
  };

  const submitRename = (): void => {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) return;
    renameSession.mutate(
      { id: renameTarget.id, title },
      {
        onSuccess: () => setRenameTarget(null),
        onError: () => toast.error('Could not rename chat'),
      },
    );
  };

  const showEmpty = !sessionId || (messages.length === 0 && !pendingUser && !turn && !messagesLoading);
  const lastAssistantIdx = [...messages].map((m) => m.role).lastIndexOf('assistant');

  return (
    <div className="flex h-full min-h-0">
      <SessionSidebar
        sessions={sessions.data ?? []}
        activeId={sessionId}
        isLoading={sessions.isLoading}
        onNew={handleNew}
        onSelect={(id) => navigate(`/chat/${id}`)}
        onRename={openRename}
        onDelete={handleDelete}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {showEmpty ? (
            <div className="px-4">
              <SuggestedPrompts onPick={handleSend} disabled={createSession.isPending} />
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
              {hasNextPage && (
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      'Load earlier messages'
                    )}
                  </Button>
                </div>
              )}

              {messagesLoading && messages.length === 0 && (
                <div className="flex justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              )}

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
        />
      </div>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
            aria-label="Chat title"
            maxLength={200}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={renameSession.isPending || !renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
