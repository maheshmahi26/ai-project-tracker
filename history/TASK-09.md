# TASK-09 — Sprints + Tasks backend

- **Status:** ✅ done (typecheck + lint + 74 API tests + build + live smoke)
- **Date:** 2026-07-16
- **Agent / chat:** sprints + tasks backend chat
- **Branch / PR:** task/TASK-09-sprints-tasks-backend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (03-database-schema §4/§5, 04-api-design → Sprints/Tasks)

## What was implemented

The Sprints and Tasks modules — the core of the product. Tasks support full CRUD,
subtasks, assign, move, bulk ops, soft-delete/undo, filter/sort/cursor-pagination and
ranked text search. Sprint point totals (committed/completed) are recomputed inside
Mongo transactions whenever a task change affects them.

### Shared contracts — `packages/shared/src/index.ts`
- Sprints: `sprintStatusSchema`, `createSprintSchema`, `updateSprintSchema`,
  `listSprintsQuerySchema`, `SprintDTO`.
- Tasks: `taskStatusSchema` (`backlog|todo|in_progress|in_review|done`),
  `taskPrioritySchema` (`low|medium|high|urgent`), `createTaskSchema`,
  `createSubtaskSchema`, `updateTaskSchema`, `assignTaskSchema`, `moveTaskSchema`,
  `bulkUpdateTasksSchema`/`bulkDeleteTasksSchema`, `listTasksQuerySchema`,
  `TASK_SORT_FIELDS`, `TaskDTO`.

### Domain events — `modules/events/domain-event.ts`
- Added `sprint.created|updated|started|completed|deleted` and
  `task.created|updated|moved|assigned|deleted|undeleted`. Emitters reuse the TASK-07
  bus → Audit (diff) + Activity (feed), no listener changes needed.

### Transaction helper — `common/db/transaction.ts`
- `runInTransaction(connection, fn)` probes replica-set support once and either runs
  `fn(session)` in `withTransaction` or `fn(undefined)` sequentially (standalone dev).
  `supportsTransactions()` is shared (org-service pattern generalized here).

### Sprints module — `modules/sprints/`
- Schema (`orgId, projectId, name, goal, status, startDate, endDate, capacityPoints,
  committedPoints, completedPoints`, soft-delete). Index `{orgId,projectId,status}`.
- Repo: `findById`, `create`, session-aware `updateById`, `softDelete`, `listCursor`.
- Service: create (project must exist), get, list (cursor), update (diff), **start**
  (planned→active), **complete** (finalizes points), **delete** (soft-delete + detach
  tasks atomically), plus `recomputePoints(orgId, sprintId, session?)` and
  `assertSprintInProject(...)` used by Tasks.
- Controller: `POST/GET /projects/:projectId/sprints`, `GET/PATCH/DELETE /sprints/:id`,
  `POST /sprints/:id/start|complete`. `sprint:manage` for writes, `read` for gets.

### Tasks module — `modules/tasks/`
- Schema (`orgId, projectId, sprintId, key, parentId, title, description, status,
  priority, assigneeId, reporterId, labelIds, storyPoints, dueDate, order,
  attachmentsCount, commentsCount`, soft-delete). Indexes: board
  `{orgId,projectId,status,order}`, `{orgId,sprintId}`, `{orgId,assigneeId,status}`,
  unique partial `{orgId,key}`, `{parentId}`, and **text index** on `title`+`description`.
- Repo: `findById`/`findByIds`, session-aware `create`/`updateById`/`updateMany`/
  `softDelete`/`detachSprint`, `restoreDeleted`, `listCursor` (filters + text),
  `maxOrder` (board append), and **`sumPointsBySprint`** (aggregation, session-aware).
- Service: create, get, list, listSubtasks, update, **assign**, **move**, delete,
  undoDelete, **bulkUpdate**, **bulkDelete** — see semantics below.
- Controller: `POST/GET /tasks`, `POST /tasks/bulk-update|bulk-delete`,
  `GET/PATCH/DELETE /tasks/:id`, `POST /tasks/:id/undo-delete|assign|move`,
  `GET/POST /tasks/:id/subtasks`. RBAC: `task:create|update|delete|assign`, `read`.

### Wiring
- `app.module.ts` imports `SprintsModule` + `TasksModule`.
- `test/integration-module.ts` extended with both modules/schemas/services.

## Task state machine (status)
`backlog → todo → in_progress → in_review → done` — statuses are free-transition (any
value accepted via `update`/`move`); no forced ordering (kanban-style). Only `status:
'done'` counts toward a sprint's `completedPoints`.

## Sprint state machine
`planned → active → completed`. `start` requires `planned` (rejects active/completed);
`complete` rejects an already-completed sprint and finalizes `committed/completed` from
current tasks. Transitions happen via dedicated endpoints, not generic `update`.

## Ordering strategy
- `order` is a float. On create/append: `maxOrder(project,status) + 1000` (ORDER_GAP).
- `move` sets an explicit `order` when provided; if only `status` changes it appends to
  the end of the new column. Board reordering (fractional inserts) will be driven by the
  frontend in TASK-11 by passing explicit `order` values between neighbors.

## Point-total recomputation (transaction usage)
- Totals are **recomputed from tasks** (not incrementally maintained) → always correct.
  `committedPoints = Σ storyPoints` of non-deleted tasks in the sprint;
  `completedPoints = Σ storyPoints` of those with `status='done'`.
- Any task write that changes sprint membership, `status`, or `storyPoints` runs inside
  `runInTransaction`: the task write **and** `recomputePoints` for every affected sprint
  (old + new) commit atomically on a replica set. Verified live: create (committed=5),
  move→done (completed=5), move between sprints (A:0, B:8), bulk/delete recompute.
- On standalone Mongo the same code runs without a session (sequential) so local dev
  works; the integration suite runs against a replica set where it is atomic.

## Bulk-op semantics
- `bulk-update { ids[], patch }` — loads existing (non-deleted) tasks for the org, applies
  one `$set` via `updateMany` inside a transaction, recomputes all affected sprints once,
  and emits a `task.updated` audit+activity event per task. If `patch.sprintId` is set,
  every task's project must match the sprint's project (else `BUSINESS_RULE`).
- `bulk-delete { ids[] }` — soft-deletes via `updateMany`, recomputes affected sprints,
  emits `task.deleted` per task. Both return `{ updated }` / `{ deleted }` counts.

## Subtasks (depth-1 rule)
- `parentId` makes a task a subtask; a subtask's `parentId` must be null (creating a
  subtask under a subtask → `BUSINESS_RULE`). Subtasks inherit the parent's `projectId`.
- `GET/POST /tasks/:id/subtasks` list/create under a parent (project derived from path).

## Search index
- Mongo **text index** on `title`+`description`. `?q=` returns a single **ranked** page
  (`{score:{$meta:'textScore'}, _id:-1}`, `nextCursor:null`) — deep pagination of ranked
  results is intentionally not supported. Non-`q` lists use `_id` cursor pagination
  (optionally a `sort` field with `_id` tiebreaker).

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api dev            # docs at /api/docs

pnpm --filter @ai-projectos/api typecheck      # green
pnpm --filter @ai-projectos/api lint           # 0 warnings
pnpm --filter @ai-projectos/api test           # 74 passing
pnpm --filter @ai-projectos/api build
```
All sprint/task routes require an `x-org-id` header (active org).

## Verified live (2026-07-16)
register → create org → project `PAY` → sprint (planned) → create task `PAY-1` (sp=5, in
sprint) → committed=5 → move→done → completed=5 → subtask `PAY-2` → complete sprint
(status=completed, 5/5) → bulk-update → `GET /tasks` (missing header → `VALIDATION_ERROR`)
→ text search `checkout` → `[PAY-1]` → activity `[updated,completed,created,moved,created×3]`.

## Tests added
- Unit: `tasks.mapper.spec.ts` (2 — DTO serialization/defaults).
- Integration: `sprints.integration.spec.ts` (6 — create+audit, missing project, start/
  complete guards, list+filter, delete+detach, tenant isolation);
  `tasks.integration.spec.ts` (12 — create+key+audit/activity, depth-1 subtasks, assign,
  **point totals across create/move/delete**, **move between sprints**, cross-project
  sprint reject, bulk-update/bulk-delete recompute, soft-delete/undo, update diff,
  filter+cursor+search, tenant isolation). Repo suite: **74 tests** passing.

## Definition of Done checklist
- [x] Task CRUD, subtasks, assign, move, bulk ops, soft-delete/undo work via Swagger (live).
- [x] Moving tasks between sprints updates point totals atomically (transaction verified).
- [x] Text search returns ranked results; filters/sort/cursor pagination correct.
- [x] Audit + activity written for all mutations; RBAC + tenancy enforced on every route.
- [x] Unit + integration tests (incl. transaction + bulk-op correctness) pass.

## Known gaps / follow-ups
- **Frontend** for the board/backlog/sprints is TASK-11.
- `assigneeId`/`labelIds` are stored but not yet validated as active members / existing
  labels (labels arrive in TASK-10; validate assignees when the picker lands).
- Ranked `?q=` search returns only the first page (no cursor); fine for the search box.
- Custom `sort` uses `_id` as a tiebreaker for the cursor — stable, but cursoring across a
  non-unique custom sort key can skew; board views should page by the default order.
- Sprint↔Task modules use `forwardRef` (Sprints needs `TasksRepository` for recompute;
  Tasks needs `SprintsService`). Intentional and resolved at bootstrap.

## Notes for the next agent
- **Point totals**: never mutate `committed/completedPoints` directly — call
  `SprintsService.recomputePoints(orgId, sprintId, session)` inside `runInTransaction`
  after any task change that touches membership/status/points.
- **Task keys**: allocated via `ProjectsService.allocateTaskNumber` (atomic `$inc`,
  race-safe). Keys may have gaps if a create fails after allocation — acceptable.
- **New resource routes**: guard with `@UseGuards(TenantGuard, PermissionsGuard)`,
  annotate `@Permissions('...')`, scope every repo query by `org.orgId`, and emit a
  `DomainEvent` for audit+activity (never call Audit/Activity services directly).
