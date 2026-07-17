# TASK-19 — AI chat frontend (ChatGPT-like)

- **Status:** ✅ done — web typecheck + lint (0 errors) + full build green; **64 web tests pass (18 files)**, incl. a new 19-case AI-chat suite (SSE reducer, deep-link mapper, tool-card + confirm flow).
- **Date:** 2026-07-18
- **Agent / chat:** AI chat frontend chat
- **Branch / PR:** task/TASK-19-ai-chat-frontend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-18 (08-frontend-architecture "AI Chat interface"; 05-ai-agent tool-execution visualization; 04-api-design SSE).
- **Depends on:** TASK-17 (action tools) + TASK-18 (generative tools) for the tools the chat drives; TASK-16 for the chat/SSE endpoints.

## What was implemented

A polished, transparent **ChatGPT-like** chat experience under `features/ai-chat` that proves UI↔AI parity:
session-history sidebar + conversation panel, token-by-token **SSE streaming**, **markdown + syntax-highlighted
code**, **tool-execution cards** (args → status → result/error) with **deep links** to created entities, an
**in-chat confirm** step for destructive/propose→confirm actions, session CRUD, and suggested prompts.

### 1. SSE transport — `lib/api-client.ts` `postSse`
- `apiClient.postSse(path, body, { signal })` is an **async generator** over a `fetch` `ReadableStream`. It
  injects `Authorization` + `x-org-id` exactly like `request`, buffers the body, splits on the SSE frame
  separator (`\n\n`), and yields `{ event, data }`. Does one transparent **refresh-on-401** then retries.
- `EventSource` is intentionally avoided: it can't send an `Authorization` header, and our access token lives
  in memory (never a cookie). `aiChatApi.streamMessage` JSON-parses each frame into a `ChatSseEvent` and stops
  on `done`/`error`.

### 2. SSE reducer — `lib/chat-stream.ts` (pure, unit-tested)
State shape for the in-flight assistant turn:
```ts
interface StreamingTurn {
  content: string;                 // token deltas concatenated
  toolCalls: StreamToolCall[];     // ordered; each has status running|ok|error + data|error
  status: 'streaming' | 'done' | 'error';
  error?: { code; message };
  messageId?; executionId?; finalStatus?;  // captured from `done`
}
```
`streamReducer(state, event)` folds one event:
- `token` → append `delta` to `content`.
- `tool_call` → push a `running` `StreamToolCall` (dedupes by `callId`).
- `tool_result` → set the matching call to `ok`/`error` + attach `data`/`error`.
- `done` → `status:'done'` + capture `messageId`/`executionId`/`finalStatus`.
- `error` → `status:'error'` + `error`.

`mergeToolCalls(calls, results)` joins a **persisted** message's `toolCalls`+`toolResults` (by `callId`) into
the same `StreamToolCall` shape, so a reloaded conversation renders identical tool cards.

### 3. Deep-link mapping — `lib/deep-links.ts`
`extractDeepLinks(data)` walks a tool result and builds `{ label, to }` chips from any entity summary exposing
a `url` (`/tasks/:id`, `/projects/:id`) plus a label (`key` → `title` → `name` → "Open"). Handles single
summaries, `{ items: [...] }` list results, and raw arrays; deduped by `url` and capped (default 8). This is
what turns a `createTask` result into a clickable **`AUTH-124`** chip.

### 4. Confirm mapping — `lib/confirm.ts`
`pendingConfirmation(data)` detects `{ needsConfirmation: true, message }` (the shape TASK-17/18 destructive &
propose→confirm tools return on the first call). The tool card renders the message + a **Confirm** button;
clicking it sends the canned `CONFIRM_REPLY` ("Yes, confirm and proceed.") as the next user turn, which the
agent interprets as approval to re-run the tool with `confirm:true`.

### 5. Data hooks — `hooks/use-chat.ts`
- `useChatSessions` / `useChatTools` (TanStack Query, org-scoped keys in `lib/query-keys.ts` `aiChat.*`).
- `useChatMessages(sessionId)` — `useInfiniteQuery` over the newest-first paged endpoint; flattened +
  **reversed** to chronological order; `fetchNextPage` loads **earlier** history.
- `useCreateSession` / `useRenameSession` / `useDeleteSession` mutations (optimistic list removal on delete).
- **`useSendMessage(sessionId)`** — owns one streaming turn: pushes the user message optimistically
  (`pendingUser`), folds SSE events through `streamReducer` into `turn`, and on completion **invalidates**
  messages + sessions **and** `tasks`/`projects` (an AI write may have changed the board). Exposes `send`,
  `stop` (AbortController), `isStreaming`.

### 6. Components — `components/*`
- `markdown.tsx` — `react-markdown` + `remark-gfm` + `rehype-highlight` (highlight.js `github-dark` theme),
  styled element overrides, external links `target=_blank`. Whole chat route is lazy so these libs stay out of
  the main bundle.
- `tool-call-card.tsx` — collapsible card: name + status icon (spinner/check/x), pretty-JSON args + result,
  always-visible error line, deep-link chips, and the confirm affordance.
- `message-bubble.tsx` — user/assistant bubbles; assistant renders tool cards + markdown + a streaming caret.
- `chat-composer.tsx` — auto-growing textarea, Enter-to-send / Shift+Enter newline, send↔stop toggle.
- `suggested-prompts.tsx` — empty-state starter chips.
- `session-sidebar.tsx` — new chat, history list with active highlight, rename/delete menu, skeleton/empty.

### 7. Page + routing — `routes/ai-chat-page.tsx`
Two-pane layout (sidebar + conversation). Routes `chat` and `chat/:sessionId` nest **inside `AppShell`** →
under `RequireAuth` → `RequirePasswordCurrent` → `RequireOrg`, so a temp-password user must change it before
reaching chat (DoD). First message on `/chat` creates a session, navigates to `/chat/:id`, then auto-sends
(the send hook rebinds to the new id). Added an **"Assistant"** nav item (Bot icon) to the sidebar.

## Design decisions
- **`fetch` streaming, not `EventSource`** — needed the bearer token + org header; also gives us `AbortController`
  stop and a clean async-generator seam.
- **Pure reducer** — all stream→state logic is side-effect-free and unit-tested; React just renders it.
- **Persisted messages re-hydrate identical tool cards** via `mergeToolCalls`, so refresh/reload looks the same
  as the live stream (the transparency requirement).
- **Route-level lazy chunk** — `react-markdown`/`highlight.js` load only when the chat opens (see bundle note).
- **Invalidate board/lists after a turn** — because the assistant uses the same audited services as the UI, a
  chat action must reflect on the Kanban/tables immediately (the parity demo).
- **Shared types end-to-end** — `ChatSseEvent`, `ChatMessageDTO`, tool summaries come from `packages/shared`;
  no client/server drift.

## Testing strategy
- `lib/chat-stream.test.ts` (8) — reducer: token accumulation, tool_call→tool_result ok/error, dedupe, done ids,
  error transition; `mergeToolCalls` join + default.
- `lib/deep-links.test.ts` (5) — label fallback, list extraction + dedupe, cap, and no-url → no links.
- `components/tool-call-card.test.tsx` (6) — running spinner, expand→args JSON, deep-link href, error payload,
  **confirm flow** (renders message, Confirm fires `onConfirm`), and confirm disabled while streaming.

## How to run / verify locally
```
pnpm --filter @ai-projectos/web typecheck                 # green
pnpm --filter @ai-projectos/web lint                      # 0 errors (pre-existing fast-refresh warnings only)
pnpm --filter @ai-projectos/web test                      # 64 tests, 18 files
pnpm --filter @ai-projectos/web build                     # tsc + vite build green
# End-to-end: docker compose up mongo/redis/qdrant, set GEMINI_API_KEY, pnpm dev, open /chat
```

## Definition of Done checklist
- [x] Streaming renders token-by-token; tool cards show args + result/error.
- [x] "Create a high-priority task…" in chat creates the task (via TASK-17 tools) and the board is invalidated so it appears (parity demo).
- [x] Destructive proposals show a confirm step in chat (`pendingConfirmation` → Confirm → `CONFIRM_REPLY`).
- [x] Session history loads (infinite "load earlier"); suggested prompts work.
- [x] Component tests (SSE reducer, tool card, confirm flow) pass.

## Known gaps / follow-ups
- **RAG citations** (source chips under answers) → TASK-21; chat only renders what the API returns.
- **Bundle size** — the lazy `ai-chat-page` chunk is ~402 kB (116 kB gzip) driven by highlight.js's language
  pack. If it matters, swap `rehype-highlight` for a lighter/subset highlighter or `shiki` fine-grained import.
- **Code-block "copy" button** and per-message token/latency badges are not yet rendered (data is available on
  the persisted message / execution).
- **Contextual prompts** are static; wiring them to the current project/screen is a small follow-up.
- **Mobile session drawer** — the sidebar is `hidden md:flex`; a slide-over for small screens is TODO.

## Notes for the next agent
- The chat consumes `ChatSseEvent` from `packages/shared`; if you add a new SSE event type, extend the union
  there and add a `case` in `streamReducer`.
- To render a **new proposal type** (e.g. a sprint plan card with an Accept button), switch on
  `toolResult.name` / output schema inside `tool-call-card.tsx` (or a dedicated proposal component) — the raw
  `data` is already on the `StreamToolCall`.
- Deep links rely on tools returning a `url` field (see `tools/tool-support.ts`); new linkable entities just
  need a `url` + a label key.
