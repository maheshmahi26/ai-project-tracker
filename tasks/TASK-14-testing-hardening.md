# TASK-14 — Testing hardening (human layer)

- **Layer:** Human
- **Depends on:** TASK-13
- **Parallel with:** —
- **Size:** M–L

## Specs to read first
- [10 Testing Strategy](../specs/10-testing-strategy.md)

## Scope — in
- Backfill/strengthen tests across the human layer to hit coverage targets:
  - **Unit**: domain entities/invariants, services (fake repos), RBAC matrix, utils.
  - **Integration**: `mongodb-memory-server` (or disposable Mongo container) + test Redis — auth flows, tenant isolation, projects/sprints/tasks CRUD + bulk + soft-delete/undo, audit/activity rows, dashboard aggregates.
  - **E2E (Playwright)**: auth journey, project+task UI flow (create→board→comment→delete→undo), RBAC (Viewer blocked), dashboard renders.
- Test data **factories/builders**; deterministic clock/seed where needed.
- Wire **coverage thresholds** into CI; make E2E runnable locally + nightly.

## Scope — out
- AI/RAG tests (added with TASK-16–21). No new features.

## Deliverables
- Reliable, gated test suite for the entire human layer.

## Definition of Done
- [ ] Coverage meets targets (domain/services ~90%+, overall ~80%+).
- [ ] Unit + integration green in CI; CI fails under threshold.
- [ ] E2E journeys pass against an ephemeral stack.
- [ ] No flaky tests (seeded/deterministic).

## History requirement
Create `../history/TASK-14.md`: document test setup (memory-server, factories), how to run each suite, coverage config, and E2E harness. Add CHANGELOG row.
