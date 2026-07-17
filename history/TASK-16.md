# TASK-16 — AI foundation (Gemini + tool registry + LangGraph agent + chat + SSE)

- **Status:** ✅ done — typecheck + lint + full build green; **144 API tests** pass with coverage gate still passing (statements 87.1% / branches 75.1% / functions 91.8% / lines 87.1%). Gemini is mocked in tests (no live calls in CI); the real key + model + function calling + embeddings were verified with a throwaway live smoke test.
- **Date:** 2026-07-17
- **Agent / chat:** AI foundation chat
- **Branch / PR:** task/TASK-16-ai-foundation → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-17 (05-ai-agent, 03-database-schema §12–16, 04-api-design "AI & Chat").
- **Depends on:** TASK-15 (stable, tested human layer).

## What was implemented

The first AI layer: a Gemini client, an MCP-inspired **tool registry**, a **LangGraph** agent
that streams over **SSE**, chat persistence, and a fully-audited **AIExecution** trace — proven
end-to-end by a trivial `whoAmI` tool. The golden rule holds: **the AI never touches Mongo**; it
can only invoke backend tools that wrap the same use cases the UI calls.

### 1. Gemini client — `apps/api/src/infra/ai/` (excluded from coverage: it's infra/network)
- `GeminiClient` is an **abstract DI token**; `GoogleGeminiClient` implements it with the Google AI
  SDK (`@google/genai` v2). `generate()` streams (`generateContentStream`), forwarding text deltas
  via an `onToken` callback and collecting function calls + usage; `embed()` returns vectors for RAG
  (TASK-20). `AiInfraModule` is `@Global` so any module can inject it.
- The agent depends only on this narrow interface, so **tests bind a fake** (`test/fake-gemini.ts`)
  and CI never makes a network call.

### 2. Tool registry (MCP-inspired) — `apps/api/src/modules/ai/tools/`
- **`AiTool` contract**: `name`, `description`, `requiredPermission`, optional `destructive`, Zod
  `inputSchema`/`outputSchema`, and `handler(input, ctx)`. `ToolContext` carries the RBAC `principal`,
  `requestId`, `sessionId`, and an abort `signal` — **never** anything the LLM controls.
- **`zodToJsonSchema`**: converts a Zod schema into a Gemini `parametersJsonSchema` (objects,
  primitives, enums, literals, arrays, optional/nullable/default/refined). Unknown nodes degrade to
  `string` so a tool is never un-callable.
- **`ToolRegistry.execute()`** = validate args (Zod) → **check permission** (`can(role, perm)`) →
  run handler → validate output. It **never throws**: it returns a structured `{ ok, data | error }`
  the agent can read and self-correct on (`UNKNOWN_TOOL`, `PERMISSION_DENIED`, `VALIDATION_ERROR`,
  `OUTPUT_INVALID`, or a mapped `AppException` code). `functionDeclarations(role)` / `toInfo(role)`
  only expose tools the caller's role may actually use.
- **`ToolRegistrar`** loads all `AI_TOOLS` multi-providers into the registry on boot — adding a tool
  is one provider, no central edit. Sample: **`whoAmITool`** (read-only, wraps `UsersService`).

### 3. LangGraph agent — `apps/api/src/modules/ai/agent/`
- Real `@langchain/langgraph` `StateGraph`: `START → ingest → reason → (act ↔ reason)* → respond → END`.
  - **ingest** — memory/RBAC seed (history pre-loaded; RAG memory lands in TASK-20).
  - **reason** — one streamed Gemini turn; emits `token` events, appends the model turn, records usage.
  - **act** — runs each requested tool through the registry; emits `tool_call` + `tool_result`, appends
    `functionResponse` parts, bumps the iteration counter.
  - **respond** — finalizes the answer (or a partial notice if a guardrail cut the run short).
- **Guardrails** (proven by tests): `AI_MAX_ITERATIONS` (reason→act cap), `AI_TOKEN_BUDGET`
  (cumulative-token stop), `AI_NODE_TIMEOUT_MS` (per-model-call abort via `withTimeout`), and
  `AI_RUN_TIMEOUT_MS` + LangGraph `recursionLimit` as the hard stop. Failures degrade to
  `partial`/`failed` and emit an `error` event rather than crashing the stream.

### 4. Chat + persistence — `apps/api/src/modules/ai/`
- Schemas/repos for **ChatSessions**, **ChatMessages** (`toolCalls`/`toolResults`/`tokens`), and
  **AIExecutions** (prompt, model, status, `graphState` node trace, per-tool timings, latency, tokens,
  iterations). All tenant-scoped; soft-delete on sessions.
- **`ChatService`** — session CRUD + message/execution reads (cursor-paginated, ownership-checked).
- **`AgentService`** — orchestrates a turn: load prior turns → persist the user message → run the agent
  (streaming) → persist the assistant message (with tool cards) + the `AIExecution` trace → bump session
  counters/title → write an **`AuditLog` with `source:'ai'`, `actorType:'ai'`** → emit `done`.

### 5. HTTP + SSE — `AiController` (`/api/v1/ai`)
```
POST   /ai/chat/sessions                     GET /ai/chat/sessions        GET  /ai/chat/sessions/:id
PATCH  /ai/chat/sessions/:id                 DELETE /ai/chat/sessions/:id GET  /ai/chat/sessions/:id/messages
POST   /ai/chat/sessions/:id/messages   # SSE: token | tool_call | tool_result | done | error
GET    /ai/tools                        # role-scoped registry introspection (schemas + permissions)
GET    /ai/executions/:id               # persisted run trace
```
- Guarded by `TenantGuard` + `PermissionsGuard` (base `read` to chat; **finer perms enforced per-tool**).
- The SSE route is `@Passthrough()` (skips the transform + 15s timeout interceptors). Session existence
  and Gemini availability are checked **before** the stream opens, so failures return a normal JSON error.
  Client disconnect aborts the run via `req.on('close')`.

### SSE event shapes (`ChatSseEvent` in `packages/shared`)
```
event: token        data: {"type":"token","delta":"Creating"}
event: tool_call    data: {"type":"tool_call","callId":"...","name":"whoAmI","args":{}}
event: tool_result  data: {"type":"tool_result","callId":"...","name":"whoAmI","ok":true,"data":{...},"error":null}
event: done         data: {"type":"done","messageId":"...","executionId":"...","status":"success"}
event: error        data: {"type":"error","code":"AGENT_FAILED","message":"..."}
```

## Design decisions
- **Abstract Gemini client as the seam** — the graph/tools depend on a 4-method interface, not the SDK,
  so tests are deterministic + offline and the provider is swappable.
- **Registry is the only door to the domain** — permission + Zod validation live *inside* `execute()`,
  so the model physically cannot bypass RBAC or hit a repository directly (defense in depth).
- **Real LangGraph, own tools** — used `StateGraph` for the inspectable, checkpoint-ready state machine,
  but kept the MCP-style Zod tool registry rather than LangChain's tool abstraction (one schema source,
  shared with FE/API). The graph is rebuilt per run over closures (cheap) so streaming + guardrails are explicit.
- **Tools never throw to the agent** — structured error results let the model self-correct ("you forgot X")
  instead of aborting, which is the whole point of function calling over prompt-parsing.
- **Text-only history reconstruction (v1)** — prior turns feed back as user/model text; tool-call/response
  plumbing is not replayed across turns (Gemini requires well-formed pairs). Full tool-history replay is a
  follow-up if multi-turn tool chaining needs it.

## Model reality check (important)
The old defaults (`gemini-2.5-flash`, `text-embedding-004`) are **no longer available to new API keys**
(404). Verified with the user's key what actually works and updated defaults:
- `GEMINI_MODEL` default → **`gemini-flash-latest`** (forward-compatible alias). The user's `.env` is set
  to **`gemini-3-flash-preview`**, which was confirmed working right now (`gemini-flash-latest` was
  transiently 503 "high demand"; `gemini-2.0-flash` hit 429 quota on this key).
- `GEMINI_EMBED_MODEL` default → **`gemini-embedding-001`**, with `GEMINI_EMBED_DIM=768`
  (Matryoshka `outputDimensionality`) so vectors match the Qdrant collection bootstrapped in TASK-15.
- **Live smoke (throwaway, then deleted):** `gemini-3-flash-preview` returned a `whoAmI` function call;
  `gemini-embedding-001` returned 768-dim vectors. ✅

## Testing & mocking strategy
- **Gemini is faked in all tests** via `FakeGeminiClient` (`test/fake-gemini.ts`): `script(...turns)` queues
  responses, `loop(turn)` returns forever (for the iteration-guardrail test), and text is streamed word-by-word
  through `onToken`. Bound in the integration harness as the `GeminiClient` provider — **no network in CI**.
- **Unit:** `zod-to-gemini.spec.ts`, `tool-registry.spec.ts` (validation/permission/output/error mapping/role
  scoping), `timeout.spec.ts`, `agent-runner.spec.ts` (happy path + iteration cap + token budget + model-throws).
- **Integration** (`ai.integration.spec.ts`, real Mongo RS): full SSE turn (`tool_call`→`tool_result`→`token`→`done`),
  assistant message + tool cards persisted, `AIExecution` trace written, **audit row with `source:'ai'`**, session
  title/counter update, tenant isolation on executions, and cross-user session-message denial.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo   # replica set for transactions/tests
pnpm --filter @ai-projectos/shared build                  # DTOs consumed by the API
pnpm --filter @ai-projectos/api typecheck                 # green
pnpm --filter @ai-projectos/api lint                      # green
pnpm --filter @ai-projectos/api exec vitest run --coverage --no-file-parallelism  # 144 tests, gate passes
pnpm --filter @ai-projectos/api build                     # nest build green

# Live (needs GEMINI_API_KEY in .env): start the API, create a session, POST a message and watch SSE.
```

## Definition of Done checklist
- [x] A chat message triggers the sample tool; SSE streams token + tool events; result persisted.
- [x] Arg validation + permission checks enforced inside the tool layer (`ToolRegistry.execute`).
- [x] Guardrails (iteration/timeout/token) proven by tests.
- [x] `AIExecution` + audit row (`source:'ai'`) written; Gemini mocked in tests (no live calls in CI).

## Known gaps / follow-ups
- **Real CRUD tools** (createTask/updateTask/…) → TASK-17; **generative tools** → TASK-18; **chat UI** → TASK-19;
  **RAG / `searchKnowledge`** + real memory summarization → TASK-20. The registry + graph are ready for all of them.
- **Per-`/ai/*` rate limiting** (Gemini free-tier friendliness) — a stricter `@Throttle` on the SSE route is a small follow-up.
- **`gemini-flash-latest` overload:** if the default alias 503s, set `GEMINI_MODEL` to a specific model
  (e.g. `gemini-3-flash-preview`) as done in the user's `.env`.
- **Destructive-tool confirmation** flow (propose→confirm) is modeled (`destructive` flag + system prompt) but
  has no committing tools yet — enforced for real in TASK-17/18.

## Notes for the next agent
- **Add a tool:** write `createXTool(deps): AiTool` and add it to the `AI_TOOLS` factory array in
  `ai.module.ts` (and the integration harness). Enforce the right `requiredPermission`; mark mutating/deleting
  tools `destructive: true`. Wrap the **existing service** — never a repository.
- **Add an env var:** extend `config/env.schema.ts` (fail-fast Zod) **and** `.env.example`.
- The graph lives in `agent/agent-runner.service.ts`; guardrail values come from `AI_*` env. Streaming is via the
  `emit` callback threaded from the controller → `AgentService` → `AgentRunner`.
