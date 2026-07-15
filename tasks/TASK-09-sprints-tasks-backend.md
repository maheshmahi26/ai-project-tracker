# TASK-09 — Sprints + Tasks backend

- **Layer:** Human
- **Depends on:** TASK-07
- **Parallel with:** —
- **Size:** L

## Specs to read first
- [03 Database Schema → Sprints, Tasks](../specs/03-database-schema.md)
- [04 API Design → Sprints, Tasks](../specs/04-api-design.md)

## Scope — in
- **Sprints** module: CRUD, start/complete, point totals (committed/completed) updated within **Mongo transactions**.
- **Tasks** module: schema + repo + service + controller + shared DTOs.
  - CRUD; **subtasks** via `parentId` (depth-1 rule); assign; move (sprint/status/order); status/priority/deadline/labels/story points.
  - **bulk-update** and **bulk-delete**; soft-delete + undo.
  - filter/sort/**cursor pagination**; **MongoDB text index** search on title/description.
  - human task key `PROJKEY-123` from project counter (transactional).
- Emit `sprint.*` / `task.*` events → Audit + Activity (reuse TASK-07 bus).
- RBAC + tenancy on every endpoint.

## Scope — out
- Comments/labels/files/notifications (TASK-10). Frontend (TASK-11).

## Deliverables
- Complete sprint + task backend, the core of the product.

## Definition of Done
- [ ] Task CRUD, subtasks, assign, move, bulk ops, soft-delete/undo work via Swagger.
- [ ] Moving tasks between sprints updates point totals atomically (transaction verified).
- [ ] Text search returns ranked results; filters/sort/pagination correct.
- [ ] Audit + activity written for all mutations; RBAC + tenancy enforced.
- [ ] Unit + integration tests (incl. transaction + bulk-op correctness) pass.

## History requirement
Create `../history/TASK-09.md`: document task state machine, ordering strategy, bulk-op semantics, search index, and transaction usage. Add CHANGELOG row.
