# TASK-07 — Projects backend (+ activity/audit event bus)

- **Layer:** Human
- **Depends on:** TASK-05
- **Parallel with:** —
- **Size:** M–L

## Specs to read first
- [03 Database Schema → Projects, AuditLogs, ActivityLogs](../specs/03-database-schema.md)
- [04 API Design → Projects](../specs/04-api-design.md)
- [02 Architecture → request lifecycle, events](../specs/02-architecture.md)

## Scope — in
- **Projects** module: schema + repo (port/impl), service, controller, DTOs (shared Zod).
- CRUD + lifecycle: create, update, **archive**, **restore**, **soft-delete**, **undo-delete**.
- Human project **key** (e.g. `AUTH`) unique per org + per-project **task counter** (atomic).
- List with filter/sort/**cursor+offset pagination**/text search.
- Introduce the **domain event bus** here: emit `project.*` events →
  - **ActivityService** (ActivityLogs) + **AuditService** (AuditLogs with before/after diff, `source:'ui'`).
- RBAC applied (`project:create/update/archive/delete`), tenant-scoped.

## Scope — out
- No frontend (TASK-08). No sprints/tasks (TASK-09).

## Deliverables
- Projects backend + reusable Activity/Audit event infrastructure other modules will reuse.

## Definition of Done
- [ ] Full CRUD + archive/restore + soft-delete/undo work via Swagger.
- [ ] Every mutation writes an AuditLog (diff) + ActivityLog.
- [ ] List paginates/filters/sorts/searches; RBAC + tenancy enforced.
- [ ] Unit (service, key/counter) + integration (CRUD, audit rows, isolation) tests pass.

## History requirement
Create `../history/TASK-07.md`: document the event-bus contract (event names, payloads), how to emit audit/activity from a service, and project-key/counter logic. Add CHANGELOG row.
