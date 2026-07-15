# TASK-16 — AI foundation (Gemini + tool registry + LangGraph agent + chat + SSE)

- **Layer:** AI (build last)
- **Depends on:** TASK-15 (stable, tested human layer)
- **Parallel with:** —
- **Size:** L

## Specs to read first
- [05 AI Agent & Tool Calling](../specs/05-ai-agent.md)
- [03 Database Schema → ChatSessions, ChatMessages, AIExecutions](../specs/03-database-schema.md)
- [04 API Design → AI & Chat](../specs/04-api-design.md)

## Scope — in
- `infra/ai`: **Gemini 2.5 Flash** client (Google AI SDK) with streaming + function-calling; embeddings client (for later tasks).
- **Tool registry** (MCP-inspired): `AiTool` contract with `name`, `description`, Zod `inputSchema`/`outputSchema`, `requiredPermission`, `handler`, `ToolContext`. Zod→Gemini function-declaration converter. Arg validation + permission enforcement + structured error return.
- **LangGraph agent**: `ingest → reason → act → observe → respond` with guardrails (max iterations, per-node timeout, token budget, hard stop).
- **Chat**: ChatSessions/ChatMessages models + endpoints; **SSE streaming** endpoint emitting `token`/`tool_call`/`tool_result`/`done` events.
- **AIExecutions**: persist full run trace (graph state summary, tool calls, latency, tokens) + link AuditLogs `source:'ai'`.
- One trivial **sample tool** (e.g. `whoAmI`) to prove the loop end-to-end.

## Scope — out
- Real CRUD tools (TASK-17), generative tools (TASK-18), chat UI (TASK-19), RAG (TASK-20).

## Deliverables
- Working agent runtime that can call a tool and stream a response, fully audited.

## Definition of Done
- [ ] A chat message triggers the sample tool; SSE streams token+tool events; result persisted.
- [ ] Arg validation + permission checks enforced inside the tool layer.
- [ ] Guardrails (iteration/timeout/token) proven by tests.
- [ ] `AIExecution` + audit row written; Gemini client mocked in tests (no live calls in CI).

## History requirement
Create `../history/TASK-16.md`: document the `AiTool` contract, how to register a tool, the graph nodes/guardrails, SSE event shapes, and the mocking strategy for tests. Add CHANGELOG row.
