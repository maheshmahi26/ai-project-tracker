# TASK-17 — AI action/CRUD tools (UI ↔ AI parity)

- **Status:** ✅ done — typecheck + lint + full build green; **160 API tests** pass (28 files), incl. a new 8-case action-tools integration suite. Gemini stays mocked in tests; these tools were exercised directly through `ToolRegistry.execute()` against a real Mongo replica set.
- **Date:** 2026-07-18
- **Agent / chat:** AI action tools chat
- **Branch / PR:** task/TASK-17-ai-action-tools → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-18 (05-ai-agent "Tool catalogue"); service layers from TASK-07/09/10.
- **Depends on:** TASK-16 (tool registry + LangGraph agent + chat/SSE).

## What was implemented

The agent can now **do everything the human UI can mutate**, through audited tools. Each tool is a
**thin wrapper over the existing Application service** (the same one the REST controllers call) — no new
DB logic, so validation, RBAC, transactions, sprint-point recomputation, domain events, and auditing are
all shared. The only AI-specific additions are **reference resolution** (name/key → id) and
**confirmation gating** for destructive tools.

### 1. Audit attribution: `source:'ai'` end-to-end
Domain-event `emit()` helpers previously hard-coded `source:'ui'`. `RequestMeta` now carries optional
`source` + `actorType`, and every service emit uses `meta.source ?? 'ui'` / `meta.actorType ?? 'user'`
(tasks, projects, sprints, comments, labels). AI tools pass `aiMeta(ctx)` = `{ requestId, source:'ai',
actorType:'ai' }`, so **every mutation the agent performs shows up in the audit log + activity feed as the
assistant's work** — exactly like the human path, just attributed differently.

### 2. Reference resolver — `tools/reference-resolver.ts`
Translates the natural-language references an LLM emits into ObjectIds, all org-scoped:
- **`projectId(ref)`** — ObjectId → project **key** (`AUTH`) → **name** (`$text`).
- **`memberId(ref)`** — ObjectId → **email** (exact) → **name** (exact, else contains), over org members.
- **`taskId(ref)`** — ObjectId → task **key** (`AUTH-12`, via new `TasksRepository.findByKey`).
- **`sprintId(projectId, ref)`** — ObjectId → **name** within the project.
- **Disambiguation:** 0 matches → `NOT_FOUND`; >1 → `VALIDATION_ERROR` whose `details` list the candidates
  (id + label), so the agent can surface the options and ask the user to choose — the same loop a human does.

### 3. The tool catalogue (17 action tools + `whoAmI`)
Registered via the `AI_TOOLS` multi-provider in `ai.module.ts` (and the integration harness). Compact,
model-friendly result summaries (id/key/status + a deep-link `url`) rather than raw DTOs.

| Tool | Perm | Wraps | Notes |
|------|------|-------|-------|
| `createTask` | `task:create` | `TasksService.createTask` | resolves project + assignee + sprint |
| `updateTask` | `task:update` | `updateTask` | any field; `assignee`/`sprint` = null clears |
| `assignTask` | `task:assign` | `assignTask` | assignee name/email/id or null |
| `moveTask` | `task:update` | `moveTask` | status/sprint/order (≥1 required) |
| `deleteTask` | `task:delete` | `deleteTask` | `destructive` (soft-delete + undo) |
| `searchTasks` | `read` | `listTasks` | project/query/status/priority/assignee/sprint filters |
| `bulkUpdateTasks` | `task:update` | `bulkUpdate` | same patch to many; `project` needed for sprint-by-name |
| `bulkDeleteTasks` | `task:delete` | `bulkDelete` | **confirmation-gated** |
| `createProject` | `project:create` | `createProject` | optional lead by name |
| `updateProject` | `project:update` | `updateProject` | lead = null clears |
| `archiveProject` | `project:archive` | `archiveProject` | reversible |
| `deleteProject` | `project:delete` | `deleteProject` | **confirmation-gated** |
| `createSprint` | `sprint:manage` | `createSprint` | in a project |
| `addTasksToSprint` | `sprint:manage` | `bulkUpdate({sprintId})` | reuses task write → points recomputed |
| `completeSprint` | `sprint:manage` | `completeSprint` | by name (with project) or id |
| `addComment` | `task:update` | `CommentsService.create` | plain text → TipTap doc |
| `createLabel` | `project:update` | `LabelsService.create` | project-scoped or org-wide |

Input schemas are **AI-facing** (references are strings the resolver maps; dates/colors are LLM-forgiving);
output schemas validate the summaries so results are always safe to render.

### 4. Confirmation gating (destructive tools)
`deleteProject` and `bulkDeleteTasks` accept an optional `confirm: boolean`. The **first** call (no
`confirm`) commits nothing and returns an `ok:true` result with `{ needsConfirmation: true, message }`
describing exactly what will happen; the agent (nudged by the `destructive` flag + system prompt) relays it,
and only re-invokes with `confirm:true` after the user agrees. Deletes remain soft + reversible via undo.
This keeps the confirmation state in the tool contract — no extra agent infra.

## Design decisions
- **Wrap services, never repositories** — the agent reaches exactly as far as the UI, and every cross-cutting
  concern (RBAC guardrails were already enforced at the tool layer; transactions/events/audit at the service
  layer) is reused rather than re-implemented.
- **References are strings, resolved server-side** — the model speaks in keys/names ("AUTH", "Mahesh"); ids
  never round-trip through the LLM. Ambiguity becomes a structured error the agent can act on.
- **Compact summaries + deep links** over raw DTOs — the model gets just enough to narrate + link, and output
  validation stays cheap.
- **`source:'ai'` via `RequestMeta`** — one small, backwards-compatible field threaded through existing emit
  helpers, instead of duplicating the write paths for AI.
- **Admin/member management tools intentionally excluded** (per the task card) — user provisioning stays UI-only.

## Testing & mocking strategy
- **Unit:** existing `tool-registry` / `zod-to-gemini` / `timeout` / `agent-runner` suites still pass; the new
  input schemas (refine/nullable/number/`.or()` date union) all convert to Gemini declarations (unions degrade
  to `string`, which is fine).
- **Integration** (`tools/action-tools.integration.spec.ts`, real Mongo RS, 8 cases): createTask resolves
  `AUTH` + `Mahesh` and audits **`source:'ai'`**; a **viewer is blocked** by `requiredPermission` (and never
  even sees the tool declaration); an **ambiguous "Sam"** yields a 2-candidate `VALIDATION_ERROR`; searchTasks
  returns compact summaries; assign→move→comment flow by task key; sprint create→add→complete; and both
  destructive tools require confirmation before committing (verified the record survives the first call and is
  gone after `confirm:true`).

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo   # replica set for transactions/tests
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api typecheck                 # green
pnpm --filter @ai-projectos/api lint                      # green
pnpm --filter @ai-projectos/api exec vitest run --no-file-parallelism   # 160 tests pass (28 files)
pnpm --filter @ai-projectos/api build                     # nest build green
```

## Definition of Done checklist
- [x] "Create a high-priority backend auth task assigned to Mahesh in AUTH" creates the same task the UI would, audited `source:'ai'`.
- [x] Viewer's agent is blocked by `requiredPermission` (no escalation; tool not even declared to the model).
- [x] Destructive tools (`deleteProject`, `bulkDeleteTasks`) require confirmation.
- [x] Name/key resolvers work + disambiguate; per-tool tests (validation, permission, parity vs. service) pass.

## Known gaps / follow-ups
- **Generative tools** (draft/summarize/breakdown) → TASK-18; **chat UI** with tool cards + confirm buttons → TASK-19.
- **Multi-turn tool-history replay** is still text-only (from TASK-16); if the agent needs to chain tool calls
  across turns with full context, replay the `functionResponse` pairs.
- **Label resolution on tasks** (attach labels by name in create/update) — not yet exposed; add a `labels` field
  + resolver when needed.
- **`bulkUpdateTasks`/sprint-by-name** requires an explicit `project` arg; acceptable, but a smarter resolver
  could infer the project from the referenced tasks.

## Notes for the next agent
- **Add a tool:** write `createXTool(deps, resolver): AiTool` (or add to an existing `*-tools.ts` factory) and it
  auto-registers via the `AI_TOOLS` array in `ai.module.ts` **and** `test/integration-module.ts`. Wrap the
  **existing service**, set the right `requiredPermission`, pass `aiMeta(ctx)` for `source:'ai'`, and mark
  mutating/deleting tools `destructive: true` (confirm-gate the truly dangerous ones).
- **Resolvers** live in `tools/reference-resolver.ts`; **summaries/urls/meta helpers** in `tools/tool-support.ts`.
- The array-return of each factory is cast `as unknown as AiTool[]` to widen `AiTool<Specific>` → `AiTool`
  (handler input is contravariant); the individual tool objects stay fully type-checked.
