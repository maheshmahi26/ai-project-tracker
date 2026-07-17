/**
 * Destructive / propose→confirm tools return `{ needsConfirmation: true, message }`
 * on the first call instead of committing. The chat surfaces this as an in-line
 * confirm step: clicking "Confirm" sends a follow-up message the agent interprets
 * as approval to re-run the tool with `confirm: true`.
 */
export interface PendingConfirmation {
  message: string;
}

export function pendingConfirmation(data: unknown): PendingConfirmation | null {
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec.needsConfirmation !== true) return null;
  const message =
    typeof rec.message === 'string' && rec.message.length > 0
      ? rec.message
      : 'This action needs your confirmation.';
  return { message };
}

/** Canned approval the user sends back to the agent to commit the pending action. */
export const CONFIRM_REPLY = 'Yes, confirm and proceed.';
