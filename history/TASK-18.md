# TASK-18 — AI generative tools (structured, propose→confirm)

- **Status:** ✅ done — typecheck + lint + full build green; **157 API tests** pass (29 files), incl. a new 5-case generative-tools integration suite. Gemini stays mocked in tests via `FakeGeminiClient.scriptJson(...)` (JSON mode); no live calls in CI.
- **Date:** 2026-07-18
- **Agent / chat:** AI generative tools chat
- **Branch / PR:** task/TASK-18-ai-generative-tools → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-18 (05-ai-agent "Generative / analytical"; 04-api-design Dashboard/Reports).
- **Depends on:** TASK-16 (registry + agent). Reuses TASK-12 dashboard aggregates + TASK-17 action services.

## What was implemented

A set of **generative + analytical tools** that return **schema-valid JSON** (never free prose), so the
chat UI can render a proposal the user reviews and accepts. Pure generation is **read-only**; the single
mutation (`applySprintPlan`) is the **confirm→commit** step that turns a `generateSprint` proposal into a
real sprint + tasks through the same services the UI uses (audited `source:'ai'`).

### 1. JSON-mode generation seam — `infra/ai/gemini.client.ts`
- New `GeminiClient.generateJson({ prompt, systemInstruction, responseSchema, signal })`. The Google impl
  calls `generateContent` with `responseMimeType:'application/json'` (+ `responseJsonSchema` derived from the
  Zod output schema) and `JSON.parse`s the result. `FakeGeminiClient.scriptJson(...objects)` queues canned
  JSON so tests are deterministic + offline.
- **`generateStructured(gemini, schema, prompt, ctx)`** (`tools/generative-support.ts`) constrains the model
  with the schema **and re-validates the response** (`schema.safeParse`) — a tool NEVER returns unvalidated
  output. A schema miss becomes a readable `BUSINESS_RULE` error the agent can retry/report.

### 2. Output schemas + prompt templates in `packages/shared`
One source of truth shared by API (validation) and web (rendering): `sprintPlanSchema`, `standupSchema`,
`summarySchema`, `reportSchema`, `weeklyReportGenSchema`, `meetingSummarySchema`, `userStoriesSchema`,
`acceptanceCriteriaSchema`, `subtaskPlanSchema`, `roadmapSchema`, `releaseNotesSchema`,
`analyticsResultSchema`, plus `generativePrompts.*` builders and `GENERATIVE_SYSTEM_PROMPT` (JSON-only, grounded).

### 3. The tools — `tools/generative-tools.ts`
| Tool | Perm | Output schema | Context source |
|------|------|---------------|----------------|
| `generateSprint` | `read` | `sprintPlan` | project backlog (`backlog,todo`) |
| `applySprintPlan` | `sprint:manage` | apply result | **commit** — createSprint + createTask×N |
| `generateStandup` | `read` | `standup` | recent task activity |
| `summarizeSprint` | `read` | `summary` | sprint + its tasks |
| `summarizeProject` | `read` | `summary` | project + its tasks |
| `generateProjectReport` | `read` | `report` | project + overview metrics + tasks |
| `generateWeeklyReport` | `read` | `weeklyReportGen` | dashboard weekly aggregate |
| `generateUserStories` | `read` | `userStories` | feature text |
| `generateAcceptanceCriteria` | `read` | `acceptanceCriteria` | task (by key/id) or free text |
| `generateSubtasks` | `read` | `subtaskPlan` | task (by key/id) |
| `generateRoadmap` | `read` | `roadmap` | goals text |
| `generateReleaseNotes` | `read` | `releaseNotes` | done tasks (project/sprint) |
| `generateMeetingSummary` | `read` | `meetingSummary` | raw notes |
| `analytics` | `read` | `analyticsResult` | **deterministic** — TASK-12 dashboard aggregates |

- **`analytics`** is *not* generative: it maps a `metric` (overview / velocity / tasksPerUser /
  priorityDistribution / projectProgress / weeklyReport) onto the real cached aggregates and returns a flat
  `{ metric, note, points:[{label,value}] }` series — cheap to render, no LLM call.

### 4. propose → confirm → commit
`generateSprint` returns a `SprintPlan` proposal (read-only). `applySprintPlan` takes that plan; the **first
call** (no `confirm`) commits nothing and returns `{ needsConfirmation:true, taskCount, message }`; on
`confirm:true` it creates the sprint via `SprintsService` and each task via `TasksService` (with `sprintId`),
all `source:'ai'`. Same pattern the destructive action tools use in TASK-17.

## Design decisions
- **Structured JSON, always re-validated** — function/JSON mode + Zod output schema means results are safe to
  render as UI, and we assert on shape, never on prose (the DoD).
- **Prompts + schemas in `shared`** — the web renders the exact shapes the API validates; no drift.
- **Generation reads, a separate tool commits** — keeps generative tools side-effect-free and puts the
  mutation behind an explicit, permissioned, confirmation-gated step that reuses the audited services.
- **`analytics` stays deterministic** — analytical questions should be exact, not hallucinated; it queries the
  aggregates directly and only *shapes* the answer.
- **`AiTool` schema fields widened to `ZodType<_, _, unknown>`** — so schemas using `.default()` (input omits a
  field the parsed output requires) fit the contract without casts.

## Testing & mocking strategy
- **`FakeGeminiClient.scriptJson(...)`** queues canned JSON returned by `generateJson`; `reset()` clears it.
- **Integration** (`tools/generative-tools.integration.spec.ts`, real Mongo RS, 5 cases): four representative
  generative tools return **schema-valid JSON**; malformed model output is **rejected** (`BUSINESS_RULE`);
  `generateSprint`→`applySprintPlan` requires confirmation then **creates a real sprint + 2 tasks, audited
  `source:'ai'`**; `analytics overview` returns correct `open`/`done` counts **from real aggregates with zero
  LLM calls**; and a viewer is blocked from `applySprintPlan` by `sprint:manage`.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api typecheck                 # green
pnpm --filter @ai-projectos/api lint                      # green
pnpm --filter @ai-projectos/api exec vitest run --no-file-parallelism   # 157 tests pass (29 files)
pnpm --filter @ai-projectos/api build                     # nest build green
```

## Definition of Done checklist
- [x] Each generative tool returns schema-valid JSON (asserted on shape; malformed output rejected).
- [x] `generateSprint` proposal, once confirmed, creates real sprint + tasks via the services, audited `source:'ai'`.
- [x] `analytics` answers a structured question from real aggregates (no LLM call).
- [x] Tests with mocked Gemini returning canned structured output pass.

## Known gaps / follow-ups
- **RAG-grounded generation** (cite real docs) → TASK-21; **chat UI** rendering proposals + accept buttons → TASK-19.
- **Idempotent/cached generative results** (spec "safety & cost") — not yet; a content hash → cache would cut repeat cost.
- **More commit paths** — only `applySprintPlan` commits today; `generateSubtasks`/`generateUserStories` could gain
  an `apply*` that fans out to `createTask`/`createSubtask` when the UI wants one-click accept.
- **`analytics` labels use assignee ids** for `tasksPerUser`; resolving to names is a small follow-up.

## Notes for the next agent
- **Add a generative tool:** add its output schema + prompt to `packages/shared`, then a tool in
  `tools/generative-tools.ts` that gathers context from services and calls `generateStructured(gemini, schema, prompt, ctx)`.
  It auto-registers via the `AI_TOOLS` factory (`ai.module.ts` **and** `test/integration-module.ts`).
- **Commit paths** wrap the TASK-17 services with `aiMeta(ctx)` and should be confirmation-gated.
- Chat UI (TASK-19) can switch on `toolResult.name`/output schema to render each proposal type.
