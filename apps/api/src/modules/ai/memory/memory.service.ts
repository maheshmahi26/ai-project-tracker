import { Injectable, Logger } from '@nestjs/common';
import type { Content } from '@google/genai';
import { MEMORY_SUMMARY_SYSTEM_PROMPT, memorySummarySchema } from '@ai-projectos/shared';
import { GeminiClient } from '../../../infra/ai/gemini.client';
import {
  ChatMessagesRepository,
  type ChatMessageLean,
} from '../repositories/chat-messages.repository';
import { ChatSessionsRepository } from '../repositories/chat-sessions.repository';

const CHARS_PER_TOKEN = 4;
/** Turns kept verbatim at the tail; older turns get folded into the rolling summary. */
const KEEP_RECENT = 12;
/** Only start summarizing once a session is meaningfully long. */
const SUMMARIZE_AFTER = 20;
const MAX_LOAD = 100;
const HISTORY_TOKEN_BUDGET = 4000;
const SUMMARY_SOURCE_CHAR_CAP = 8000;

/**
 * Conversation memory (specs/06 Part B). Two layers:
 *  1. **Short-term** — recent turns assembled into the prompt within a token budget.
 *  2. **Rolling summary** — once a session grows long, older turns are compacted
 *     into `session.summary` so salient facts survive the context window.
 * Both are org- and user-scoped; the summary step is best-effort (never blocks a turn).
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly messages: ChatMessagesRepository,
    private readonly sessions: ChatSessionsRepository,
    private readonly gemini: GeminiClient,
  ) {}

  /**
   * Chronological history for the prompt, newest-first-budgeted then reversed.
   * Assumes the new user turn has not been persisted yet (agent adds it separately).
   */
  async buildHistory(orgId: string, sessionId: string, budgetTokens = HISTORY_TOKEN_BUDGET): Promise<Content[]> {
    const rows = await this.messages.recentForContext(orgId, sessionId, MAX_LOAD);
    const budgetChars = budgetTokens * CHARS_PER_TOKEN;

    const picked: ChatMessageLean[] = [];
    let used = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]!;
      if (!row.content) continue;
      const cost = row.content.length;
      if (used + cost > budgetChars && picked.length > 0) break;
      picked.push(row);
      used += cost;
    }
    picked.reverse();
    return toContents(picked);
  }

  /**
   * Fold older turns into the session's rolling summary once it grows past the
   * threshold. Best-effort: any failure is logged and swallowed so a chat turn
   * is never blocked by summarization.
   */
  async maybeSummarize(
    orgId: string,
    userId: string,
    sessionId: string,
    priorSummary: string,
  ): Promise<void> {
    try {
      const rows = await this.messages.recentForContext(orgId, sessionId, MAX_LOAD);
      if (rows.length <= SUMMARIZE_AFTER) return;

      const older = rows.slice(0, rows.length - KEEP_RECENT).filter((r) => r.content);
      if (older.length === 0) return;

      const transcript = older
        .map((r) => `${r.role}: ${r.content}`)
        .join('\n')
        .slice(0, SUMMARY_SOURCE_CHAR_CAP);

      const res = await this.gemini.generateJson({
        systemInstruction: MEMORY_SUMMARY_SYSTEM_PROMPT,
        prompt: `Prior summary:\n${priorSummary || '(none)'}\n\nNew turns to fold in:\n${transcript}`,
      });
      const parsed = memorySummarySchema.safeParse(res.json);
      const summary = parsed.success ? parsed.data.summary : readString(res.json, 'summary');
      if (summary) {
        await this.sessions.update(orgId, userId, sessionId, { summary });
      }
    } catch (err) {
      this.logger.warn(`Rolling summary failed for session ${sessionId}: ${String(err)}`);
    }
  }
}

function toContents(rows: ChatMessageLean[]): Content[] {
  const contents: Content[] = [];
  for (const row of rows) {
    if (!row.content) continue;
    if (row.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: row.content }] });
    } else if (row.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: row.content }] });
    }
  }
  return contents;
}

function readString(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}
