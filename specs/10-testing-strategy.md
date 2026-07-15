# 10 — Testing Strategy

We follow the **testing pyramid**: many fast unit tests, fewer integration tests, a small set of high-value E2E tests.

```
        ▲  few    E2E (Playwright)        critical user journeys
       ╱ ╲       ─────────────────
      ╱   ╲ some Integration (API+DB)     controllers → services → Mongo
     ╱     ╲     ─────────────────
    ╱_______╲ many Unit                    domain, services, tools, utils, hooks
```

## Backend

### Unit tests (Vitest or Jest)
- **Domain entities & invariants**: e.g. a task can't be `done` without required fields; subtask depth rule.
- **Services / use cases**: with **in-memory fake repositories** (thanks to the repository *port*), so no DB needed — fast and deterministic.
- **AI tools**: validate that each tool enforces its Zod input schema, checks `requiredPermission`, and returns the correct output schema; mock the underlying service.
- **RBAC/policies**: matrix tests for each role × permission.
- **Utilities**: pagination cursors, mappers, config validation.

### Integration tests
- Boot a real Nest app against **`mongodb-memory-server`** (or a disposable Atlas/Mongo container) + a test Redis.
- Cover: guards + validation + service + repository + DB together.
- Assert: auth flows (register/login/refresh/rotation-reuse), org scoping/tenant isolation, task CRUD + bulk ops, soft-delete + undo, audit/activity rows written, error envelope shape.
- **AI agent integration**: mock the Gemini client to return canned function calls; assert the agent runs the tool, mutates data through the real service, and writes an `AIExecution` + audit log. (No real LLM calls in CI.)

### RAG tests
- Deterministic pipeline test: parse → chunk → (mock) embed → store; assert chunk counts/metadata.
- Retrieval test with a stubbed vector index returning known chunks; assert citations + org filtering.

## Frontend

### Unit / component (Vitest + React Testing Library)
- Components render states: loading (skeleton), empty, error boundary, success.
- Hooks: Query hooks with a mocked `apiClient`; optimistic update + rollback logic.
- Form validation (React Hook Form + Zod) shows correct inline errors.
- Chat: tool-call card renders args/result/error; streaming reducer handles token/tool/done events.

### Contract safety
- Shared Zod schemas in `packages/shared` are the contract; type-level tests ensure FE and BE agree. A change that breaks the contract fails typecheck in CI.

## End-to-end (Playwright)
High-value journeys against an ephemeral full stack (compose + seeded data):
1. **Auth**: register → login → refresh persists session → logout.
2. **Project & task via UI**: create project → create task → move on board → comment → soft-delete → undo.
3. **RBAC**: Viewer cannot see create/delete controls and is 403'd on direct API calls.
4. **AI parity**: in chat, "Create a high priority task…" → tool card shows `createTask` → task appears in the board (proves UI/AI parity through the same service).
5. **RAG**: upload a small PRD → indexed → "generate tasks from this doc" → proposed tasks → confirm → tasks created.
6. **Dashboard**: charts render with seeded data.

## Test data & isolation
- **Factories/builders** for users, orgs, projects, tasks (no shared mutable fixtures).
- Each integration test runs in a clean DB (drop/reset between suites); tenant isolation asserted explicitly.
- Deterministic clock + seeded RNG where time/order matters (e.g. "yesterday" memory tests).

## Coverage & gates
- **Targets**: domain + services ~90%+, overall ~80%+ (quality over vanity numbers).
- CI fails under threshold; PRs blocked without passing unit + integration.
- E2E runs on nightly + on-demand label (kept fast and stable).

## What we deliberately don't over-test
- Framework glue (Nest wiring, Mongoose internals) — trust the framework.
- Exact LLM text output — assert on **tool calls and structured JSON**, never on free-form model prose (non-deterministic).

## Interview questions this prepares you for
- How do you test code that calls an LLM without flaky/expensive tests?
- Why does the repository *port* make services trivially unit-testable?
- Unit vs. integration vs. E2E — how do you decide what goes where?
- How do you test optimistic UI and rollback?
- How do you verify multi-tenant isolation automatically?
