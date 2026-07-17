import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { StreamToolCall } from '../lib/chat-stream';
import { extractDeepLinks } from '../lib/deep-links';
import { pendingConfirmation } from '../lib/confirm';

interface ToolCallCardProps {
  call: StreamToolCall;
  /** Sends the canned approval reply; omitted/disabled when a turn is streaming. */
  onConfirm?: () => void;
  confirmDisabled?: boolean;
}

function StatusIcon({ status }: { status: StreamToolCall['status'] }): React.JSX.Element {
  if (status === 'running')
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Running" />;
  if (status === 'ok')
    return <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Succeeded" />;
  return <X className="size-3.5 text-destructive" aria-label="Failed" />;
}

export function ToolCallCard({
  call,
  onConfirm,
  confirmDisabled,
}: ToolCallCardProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const links = call.status === 'ok' ? extractDeepLinks(call.data) : [];
  const confirm = call.status === 'ok' ? pendingConfirmation(call.data) : null;

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-card text-card-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium">{call.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <StatusIcon status={call.status} />
        </span>
      </button>

      {call.status === 'error' && call.error && (
        <div className="border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="font-mono font-medium">{call.error.code}</span>: {call.error.message}
        </div>
      )}

      {open && (
        <div className="border-t px-3 py-2 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">Arguments</div>
          <pre className="overflow-x-auto rounded bg-muted p-2 font-mono">
            {JSON.stringify(call.args, null, 2)}
          </pre>

          {call.status === 'ok' && call.data !== undefined && !confirm && (
            <>
              <div className="mb-1 mt-2 font-medium text-muted-foreground">Result</div>
              <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono">
                {JSON.stringify(call.data, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t bg-muted/30 px-3 py-2">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 font-mono text-xs font-medium text-primary hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}

      {confirm && (
        <div
          className={cn(
            'flex flex-col gap-2 border-t px-3 py-2 sm:flex-row sm:items-center',
            'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
          )}
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1 text-xs">{confirm.message}</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className="h-7"
          >
            Confirm
          </Button>
        </div>
      )}
    </div>
  );
}
