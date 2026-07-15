# 05 — AI Agent & Tool Calling

## The golden rule

> The AI **never** accesses MongoDB directly. It can only invoke **backend tools**. Each tool is a thin wrapper over an Application-layer use case — the *same* one the UI uses — so validation, authorization, and auditing are enforced identically.

```
Chat message
   │
   ▼
LangGraph Agent (Gemini 2.5 Flash)
   │  reason → choose tool(s) → emit function call(s)
   ▼
Tool Registry (typed contracts)
   │  validate args (Zod) → check permission → run
   ▼
Application Use Case  ──►  Domain  ──►  Repository  ──►  MongoDB
   │
   ▼
Structured result → back to agent → agent composes final answer (streamed)
   │
   └─► every run persisted as an AIExecution + AuditLog(source: 'ai')
```

## Why LangGraph (state machine) instead of a raw while-loop

- **Explicit, inspectable states** (`plan → act → observe → respond`) → we can visualize and debug each step, and persist the trace to `AIExecutions`.
- **Durable & resumable**: long/generative runs (report generation) survive across steps and can be checkpointed.
- **Deterministic guardrails**: max tool-iterations, per-node timeouts, and a hard stop prevent runaway loops.
- Trade-off: more boilerplate than a naive loop, but reliability + observability are worth it for an agent that mutates real data.

## Agent graph

```
        ┌────────────┐
        │  ingest     │  load memory (recent messages + summary), RBAC context
        └─────┬──────┘
              ▼
        ┌────────────┐     no tool needed
        │  reason      │ ─────────────────────────►  ┌──────────┐
        │ (Gemini)     │                             │ respond   │──► stream out
        └─────┬──────┘  ◄────── observe ──────┐      └──────────┘
              │ tool call(s)                   │
              ▼                                 │
        ┌────────────┐   validated + authz     │
        │  act         │ ─── run tool(s) ───────┘
        │ (registry)   │
        └────────────┘
   guards: maxIterations, timeout, tokenBudget, permission checks
```

## Tool contract (MCP-inspired)

Every tool is a typed object. We adopt **MCP concepts**: a tool = name + description + input schema + output schema + handler + required permission. Schemas are Zod (shared with FE/API).

```ts
interface AiTool<I, O> {
  name: string;                       // "createTask"
  description: string;                // what & when to use (fed to the LLM)
  inputSchema: ZodSchema<I>;          // validated before handler runs
  outputSchema: ZodSchema<O>;         // validated after handler
  requiredPermission: Permission;     // e.g. "task:create"
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

interface ToolContext {
  principal: Principal;               // userId, orgId, role, permissions
  requestId: string;
  sessionId?: string;
  emitAudit: (entry: AuditEntry) => void;
}
```

- The registry converts each `inputSchema` into a **Gemini function declaration** (JSON schema) so the model produces structured, validated arguments — no brittle string parsing.
- If args fail Zod validation, the tool returns a structured error the agent can read and self-correct ("you forgot assigneeId").
- If the principal lacks `requiredPermission`, the tool returns `PERMISSION_DENIED` — the agent cannot escalate.

## Tool catalogue (v1)

**CRUD / actions** (mirror the UI 1:1):
```
createTask, updateTask, deleteTask, bulkUpdateTasks, bulkDeleteTasks,
assignTask, moveTask, searchTasks,
createProject, updateProject, archiveProject, deleteProject,
createSprint, addTasksToSprint, completeSprint,
addComment, createLabel, uploadDocument
```

**Generative / analytical**:
```
generateSprint,           // from backlog or a PRD document
generateStandup,          // from recent activity
summarizeSprint / summarizeProject,
generateProjectReport, generateWeeklyReport,
generateUserStories, generateAcceptanceCriteria, generateSubtasks,
generateRoadmap, generateReleaseNotes, generateMeetingSummary,
analytics,                // structured dashboard query
searchKnowledge           // RAG retrieval (see 06)
```

Generative tools return **structured JSON** (validated by `outputSchema`) so results can be rendered as UI (e.g. a proposed sprint the user can accept) rather than free text. Many "generate X" tools operate in **propose → confirm** mode: the agent proposes, the user confirms in chat, then a mutation tool commits.

## Example end-to-end

User: *"Create a High Priority backend authentication task assigned to Mahesh in the AUTH project."*

1. `reason` → Gemini emits function call `createTask({ projectKey:"AUTH", title:"Backend authentication", priority:"high", assigneeName:"Mahesh" })`.
2. `act` → registry validates args; resolves `assigneeName` → userId (a resolver step) within the org; checks `task:create`.
3. Handler calls `TasksService.create(...)` → task `AUTH-124` created, audited (`source:'ai'`).
4. `observe` → tool result `{ ok:true, key:"AUTH-124", url:"/projects/AUTH/tasks/AUTH-124" }`.
5. `respond` → streamed: "Created **AUTH-124** (High priority) assigned to Mahesh." Chat shows the `createTask` tool card with its args + result.
6. `AIExecution` saved with the full trace, latency, tokens.

## Tool execution visualization (chat UI)

Each tool call renders a card: **tool name → arguments (pretty JSON) → status spinner → result/error**. This makes the agent's actions transparent and debuggable — a key trust feature and a strong portfolio talking point.

## Safety, cost & reliability guardrails

- **Permission enforcement** inside every tool (defense in depth; the agent can't bypass RBAC).
- **Confirmation for destructive tools** (`deleteProject`, `bulkDeleteTasks`) — agent must ask, user confirms, and soft-delete + undo still applies.
- **Iteration/timeout/token budgets** per run; graph aborts gracefully with a partial result.
- **Rate limiting** on `/ai/*` per user (Redis) to respect Gemini free-tier limits.
- **Caching** of embeddings and idempotent generative results.
- **Full observability**: `AIExecutions` + OTel spans per node + Sentry on failures.

## Interview questions this prepares you for

- How do you stop an LLM from doing unauthorized/destructive actions?
- Function calling vs. prompt-parsing — why is structured output safer?
- Why a graph/state-machine agent over a simple ReAct loop?
- How do you make generative outputs deterministic enough to render as UI?
- How do you keep UI and AI from duplicating business logic?
