# TASK-19 — AI chat frontend (ChatGPT-like)

- **Layer:** AI (build last)
- **Depends on:** TASK-17, TASK-18
- **Parallel with:** —
- **Size:** L

## Specs to read first
- [08 Frontend Architecture → AI Chat interface](../specs/08-frontend-architecture.md)
- [05 AI Agent → tool execution visualization](../specs/05-ai-agent.md)
- [04 API Design → streaming (SSE)](../specs/04-api-design.md)

## Scope — in
- `features/ai-chat`: ChatGPT-like layout — session list/history sidebar + conversation panel.
- **SSE streaming** consumption with a reducer handling `token`/`tool_call`/`tool_result`/`done`.
- **Markdown** rendering + **syntax-highlighted** code blocks.
- **Tool execution visualization** cards: tool name → args (pretty JSON) → status spinner → result/error; deep links to created entities (e.g. `AUTH-124`).
- **Suggested prompts** (contextual to current project/screen); **in-chat confirm** dialog for destructive/propose→confirm actions.
- Session CRUD; conversation persists; keyboard + a11y; skeleton/empty/error states.

## Scope — out
- RAG document UI + citations (TASK-21). Memory resolver internals (TASK-21) — chat just renders what the API returns.

## Deliverables
- Polished, transparent AI chat experience proving UI↔AI parity visually.

## Definition of Done
- [ ] Streaming renders token-by-token; tool cards show args + result/error.
- [ ] "Create a high-priority task…" in chat creates the task and it appears on the board (parity demo).
- [ ] Destructive proposals show a confirm step in chat.
- [ ] Session history loads; suggested prompts work.
- [ ] Component tests (SSE reducer, tool card, confirm flow) pass.

## History requirement
Create `../history/TASK-19.md`: document the SSE reducer state shape, tool-card component API, and deep-link mapping. Add CHANGELOG row.
