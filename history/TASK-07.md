# TASK-07 — Projects backend (+ activity/audit event bus)

- **Status:** ✅ done (typecheck + lint + 54 tests + build + live smoke)
- **Date:** 2026-07-16
- **Agent / chat:** projects backend chat
- **Branch / PR:** task/TASK-07-projects-backend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (03-database-schema #3/#10/#11, 04-api-design, 02-architecture)

## What was implemented

The Projects module plus a reusable **domain event bus** that fans mutations out
to Audit + Activity write-models. All routes are tenant-scoped and RBAC-guarded.

### Shared contracts — `packages/shared/src/index.ts`
- Projects: `projectStatusSchema`, `projectKeySchema` (`^[A-Z][A-Z0-9]{1,9}$`),
  `createProjectSchema`, `updateProjectSchema`, `listProjectsQuerySchema`
  (status filter, `q`, `sort`, cursor **and** offset params), `PROJECT_SORT_FIELDS`,
  and `ProjectDTO`.
- Read models: `listActivityQuerySchema`, `listAuditQuerySchema`, `ActivityLogDTO`,
  `AuditLogDTO`.

### Domain event bus — `apps/api/src/modules/events/`
- `domain-event.ts` — `DOMAIN_EVENT_CHANNEL`, `DomainEventName`, and the
  `DomainEvent` payload (carries both the audit diff *and* the activity projection).
- `domain-event-bus.ts` — `DomainEventBus.publish()` wraps `EventEmitter2.emitAsync`
  so listeners complete **before** the mutation returns (deterministic; safe because
  listeners never throw).
- `audit-activity.listener.ts` — `@OnEvent(DOMAIN_EVENT_CHANNEL)` fans every event to
  `AuditService.record` (with `before`/`after`) + `ActivityService.record`.
- `events.module.ts` — `@Global`, exports the bus. `EventEmitterModule.forRoot()` is
  wired in `AppModule`.

### Activity module — `apps/api/src/modules/activity/` (`@Global`)
- Schema (`orgId`, `actorId`, `verb`, `object{type,id,label}`, `projectId`),
  repository (create + cursor list), service (`record` + paginated `list`).

### Audit module — extended
- `audit.repository.ts` + `audit.service.ts` gained a paginated `list()` (filter by
  action / entity) returning `AuditLogDTO`, on top of the existing `record()`.

### Projects module — `apps/api/src/modules/projects/`
- `schemas/project.schema.ts` — `orgId, key, name, description, leadId, status,
  color, startDate, targetDate, counters.taskSeq`, soft-delete fields. Indexes:
  **unique `{orgId,key}` (partial: non-deleted)**, `{orgId,status,isDeleted}`, and a
  **text index** on `name`+`description`.
- `projects.repository.ts` (port + Mongo impl) — org-scoped CRUD, `findByKey`,
  `softDelete`/`restoreDeleted`, **`listCursor`** + **`listOffset`** (with text-score
  sort), and atomic **`nextTaskSeq`** (`$inc counters.taskSeq`).
- `projects.mapper.ts` — `toProjectDTO` + pure **`deriveKeyBase`** (name → key).
- `projects.service.ts` — create (key resolution/generation), get, list (cursor↔offset
  auto-select), update (with diff), archive/restore, soft-delete/undo-delete, and
  `allocateTaskNumber` (for Tasks in TASK-09). Emits a `project.*` event per mutation.
- `projects.controller.ts` — `POST/GET/GET :id/PATCH/POST :id/archive|restore/DELETE/
  POST :id/undo-delete`, guarded by `TenantGuard + PermissionsGuard`.

### Tenant guard — `apps/api/src/modules/auth/guards/tenant.guard.ts`
- New guard for resource routes whose `:id` is **not** the org id. Resolves the org
  from the `x-org-id` header (or `orgId` body field), verifies active membership, and
  sets `req.orgContext`. (Contrast: `OrgGuard` reads `params.id` and stays on `/orgs`.)

### Timeline read API — `apps/api/src/modules/timeline/`
- `GET /activity` (`read`) and `GET /audit-logs` (`export` → admin+manager),
  both tenant-scoped, in a small module importing `OrganizationsModule` for the guards.

### Wiring — `app.module.ts`
- Added `EventEmitterModule.forRoot({ wildcard: true })` and the Activity/Events/
  Projects/Timeline modules.

## Event-bus contract (for other modules)
- **Publish** from a service: inject `DomainEventBus` and
  `await this.events.publish({ name, orgId, actorId, source, entity, before?, after?,
  verb, object:{type,id,label}, projectId?, requestId?, ip?, userAgent? })`.
- `name` doubles as the AuditLog `action`; `verb`+`object` drive the ActivityLog.
- Names are `<entity>.<pastTense>` — this task adds `project.created|updated|archived|
  restored|deleted|undeleted`.
- To react to events elsewhere (notifications, search indexing, cache-bust), add a new
  `@OnEvent(DOMAIN_EVENT_CHANNEL)` listener — emitters stay untouched.

## Project key + counter logic
- **Key**: explicit key → validated + uniqueness-checked; else derived via
  `deriveKeyBase` (single word → first ≤4 letters, multi-word → initials), then made
  unique per org with a numeric suffix (`ACME`, `ACME2`, …). Uniqueness is also
  enforced by the partial unique index (duplicate → `CONFLICT`).
- **Task counter**: `counters.taskSeq` starts at 0; `allocateTaskNumber` calls the
  atomic `nextTaskSeq` (`findOneAndUpdate` `$inc`) and returns `{ key: "AUTH-1", seq }`
  — race-safe for concurrent task creation (TASK-09 will consume this).

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api dev      # docs at /api/docs

pnpm --filter @ai-projectos/api typecheck   # green
pnpm --filter @ai-projectos/api lint        # 0 warnings
pnpm --filter @ai-projectos/api test        # 54 passing (11 project integration)
pnpm --filter @ai-projectos/api build
```
All project routes require an `x-org-id` header (the active org).

## Verified live (2026-07-16)
Register → create org → `POST /projects` (missing `x-org-id` → `VALIDATION_ERROR`;
with header → key `AUTH`) → list → update → archive → soft-delete (200) → undo-delete
→ `GET /activity` (`[restored, deleted, archived, updated, created]`) →
`GET /audit-logs` (`project.undeleted…project.created, org.create`).

## Tests added
- Unit: `projects.mapper.spec.ts` (5 — key derivation), `permissions.guard.spec.ts`
  (5 — RBAC: admin allowed, viewer/developer denied, missing context).
- Integration: `projects.integration.spec.ts` (11 — create+audit+activity, explicit key
  + duplicate conflict, auto-increment key, update diff, archive/restore + double-archive
  guard, soft-delete/undo, cursor pagination, offset pagination + total, text search,
  tenant isolation, task-counter allocation).
- Test harness `test/integration-module.ts` extended with EventEmitter + Projects +
  Activity wiring. Repo suite: **54 tests** passing.

## Definition of Done checklist
- [x] Full CRUD + archive/restore + soft-delete/undo work via Swagger (verified live).
- [x] Every mutation writes an AuditLog (diff) + ActivityLog (via the event bus).
- [x] List paginates (cursor + offset) / filters (status) / sorts / searches (text);
      RBAC (`project:*`) + tenancy (`x-org-id` + org scoping) enforced.
- [x] Unit (key/counter, RBAC guard) + integration (CRUD, audit+activity rows, isolation)
      tests pass.

## Known gaps / follow-ups
- **Frontend** for projects is TASK-08 (this is backend only). The web `apiClient` must
  send `x-org-id` (active org) — wire it in TASK-08.
- `leadId` is stored but not validated as an active member yet (add membership check when
  the assignee UI lands).
- Sprints/Tasks (TASK-09) will consume `allocateTaskNumber` and publish `task.*`/`sprint.*`
  events through the same bus.
- Audit access uses the `export` permission as a proxy for "compliance viewer"
  (admin+manager); revisit if a dedicated `audit:read` permission is introduced.
- Cursor pagination is `_id`-ordered (≈ createdAt desc); custom-sorted/searched lists use
  offset mode.

## Notes for the next agent
- **Add a tenant-scoped resource route**: guard with `@UseGuards(TenantGuard,
  PermissionsGuard)`, annotate `@Permissions('...')`, read `@CurrentOrg()`/`@CurrentUser()`,
  and always scope repo queries by `org.orgId`. Clients must send `x-org-id`.
- **Emit audit+activity** by publishing a `DomainEvent` (see contract above) — never call
  AuditService/ActivityService directly from feature services.
- **New Mongoose schemas**: ObjectId props use `SchemaTypes.ObjectId`; give nullable/union
  props an explicit `type:` (SWC reflection caveat).
- **Task keys**: call `ProjectsService.allocateTaskNumber(orgId, projectId)` for `KEY-<n>`.
