import { Sparkles } from 'lucide-react';

interface SuggestedPromptsProps {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}

/** Contextual starter prompts shown on an empty conversation. */
const SUGGESTED_PROMPTS: string[] = [
  'Create a high-priority task "Fix login redirect" in the Auth project.',
  'Plan a 2-week sprint from the top backlog items.',
  'Summarize progress on my active projects this week.',
  'What tasks are assigned to me and still in progress?',
];

export function SuggestedPrompts({ onPick, disabled }: SuggestedPromptsProps): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-6" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">How can I help?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask in plain language — I can create tasks, plan sprints, and report on progress, all
          within your permissions.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="rounded-lg border bg-card p-3 text-left text-sm text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
