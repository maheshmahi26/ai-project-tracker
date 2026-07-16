# TASK-12 — Dashboard & reports backend

- **Status:** ✅ done (API typecheck + lint + 109 tests + production build)
- **Date:** 2026-07-16
- **Agent / chat:** dashboard backend chat
- **Branch / PR:** task/TASK-12-dashboard-backend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (04-api-design → Dashboard & Reports; 02-architecture → CQRS-lite read models + caching)
- **Depends on:** TASK-09 (sprints/tasks backend); reuses TASK-07 domain-event bus for cache invalidation.

## What was implemented

Read-only **CQRS-lite read models** for the dashboard/reports surface: MongoDB aggregation pipelines wrapped in a short-TTL Redis cache that is explicitly invalidated on writes, plus a privileged CSV export. The AI never touches these; they feed TASK-13 charts.

### Endpoints (all under `/api/v1`, `x-org-id` scoped, `TenantGuard` + `PermissionsGuard`)
| Method | Path | Permission | Shape |
|--------|------|-----------|-------|
| GET | `/dashboard/overview?projectId=` | `read` | `DashboardOverviewDTO` |
| GET | `/dashboard/velocity?projectId=` | `read` | `VelocityPointDTO[]` |
| GET | `/dashboard/burndown?sprintId=` | `read` | `BurndownDTO` |
| GET | `/dashboard/tasks-per-user?projectId=` | `read` | `TasksPerUserDTO[]` |
| GET | `/dashboard/priority-distribution?projectId=` | `read` | `PriorityDistributionDTO[]` |
| GET | `/dashboard/project-progress` | `read` | `ProjectProgressDTO[]` |
| GET | `/reports/weekly?projectId=&weekOf=` | `read` | `WeeklyReportDTO` |
| GET | `/reports/tasks.csv?projectId=&sprintId=&status=` | `export` | `text/csv` attachment |

### Aggregation shapes (`dashboard.repository.ts`)
Every pipeline `$match`es `orgId` (+ `isDeleted: {$ne:true}`) **first**, so it rides the collection's `orgId` index instead of scanning.
- **overview** — three `$group`s: tasks by status (+ points), projects by status, sprints by status (+ committed/completed sums); plus a `countDocuments` for overdue (`status != done && dueDate < now`). Derives `open = total - done`, `points = Σ sprint committed/completed`.
- **velocity** — `find` sprints (scoped, sorted `startDate,createdAt`), map `committedPoints`/`completedPoints` (already maintained transactionally by TASK-09).
- **burndown** — load the sprint, `totalPoints = committedPoints` (fallback: `Σ` task points in sprint), fetch done tasks (`storyPoints`,`updatedAt`), then build a per-day series from `startDate…endDate` (capped 60 days): `ideal = total·(1 − i/(n−1))`, `remaining = total − Σ(points of done tasks with updatedAt < endOfDay)`.
- **tasks-per-user** — `$group` by `assigneeId` → `{total, done, points}`; `null` bucket = unassigned; `open = total − done`.
- **priority-distribution** — `$group` by `priority`, back-filled to all four priorities (zeros).
- **project-progress** — `$group` tasks by `projectId` (`total/done/points/donePoints`) joined in-app with the org's non-deleted projects; `percentComplete = round(done/total·100)`.
- **weekly report** — for the 7 days ending at `weekOf` (default now): `createdCount`, `completedCount` (done + `updatedAt` in range — proxy), `createdByPriority`, active-sprint count, top 5 contributors (done tasks grouped by assignee).
- **export tasks** — `find` (scoped, optional `projectId`/`sprintId`/`status` CSV) → rows serialized to RFC-4180-ish CSV (quote fields with `",\n`).

### Caching (`dashboard.cache.ts`) — versioned keys, no `SCAN`
- Key: `dash:<orgId>:v<version>:<name>:<stableStringify(params)>`; value = JSON, `EX <DASHBOARD_CACHE_TTL_SEC>` (default 30s, new env var).
- **Invalidation = `INCR dash:ver:<orgId>`** (O(1)): bumping the version orphans every prior key (they expire via TTL). No key scanning on the hot path.
- Redis is **best-effort**: any Redis error (read/write/incr) is caught and the value is computed directly — a cache outage degrades perf, never correctness.
- `stableStringify` sorts object keys so equivalent params share a key.

### Cache invalidation trigger (`dashboard-cache.listener.ts`)
- `@OnEvent(DOMAIN_EVENT_CHANNEL)` — on any `task.*` / `sprint.* `/ `project.*` domain event, calls `cache.invalidateOrg(event.orgId)`. Mutating services stay unaware of the cache (reuses the TASK-07 event bus).

### Shared contracts (`packages/shared`)
- Query schemas: `dashboardScopeQuerySchema` (`projectId?`), `burndownQuerySchema` (`sprintId`), `weeklyReportQuerySchema` (`projectId?`,`weekOf?`), `exportTasksQuerySchema`.
- DTOs: `DashboardOverviewDTO`, `VelocityPointDTO`, `BurndownDTO`/`BurndownPointDTO`, `TasksPerUserDTO`, `PriorityDistributionDTO`, `ProjectProgressDTO`, `WeeklyReportDTO`.

### Wiring
- `DashboardModule` (imports `OrganizationsModule` for the guards + `forFeature(Task,Sprint,Project)`), registered in `app.module.ts`.
- Env: `DASHBOARD_CACHE_TTL_SEC` (default 30) added to `env.schema.ts`, `.env`, `.env.example`.
- Test harness (`test/integration-module.ts`): added `DashboardService` + `DashboardRepository` and a **no-op `DashboardCache`** (`wrap` always computes) so integration assertions test the aggregations, not the cache.

## Index requirements (no collection scans)
- `Task`: `{orgId,projectId,status,order}`, `{orgId,sprintId}`, `{orgId,assigneeId,status}` — all lead with `orgId`, so every dashboard `$match` uses an index. Overdue/weekly `countDocuments` also match on `orgId` first.
- `Sprint`: `{orgId,projectId,status}` — velocity/burndown/active-sprint queries.
- `Project`: `{orgId,key}` unique + `orgId` index for progress/overview.
No new indexes were required.

## Design decisions
- **Version-counter invalidation over key scanning.** `KEYS`/`SCAN` on every write is O(collection) and risky under load; a per-org `INCR` is O(1) and lets stale entries lapse via TTL. Trade-off: momentary extra memory for orphaned keys until they expire (bounded by the 30s TTL).
- **Short TTL *and* explicit bust.** TTL bounds staleness if an event is ever missed; the event bust makes the common case instantly consistent. Belt and suspenders, per the architecture spec.
- **Burndown uses `updatedAt` as a completion proxy.** We don't snapshot daily remaining points or record a `completedAt`, so "burned by day X" = points of done tasks whose `updatedAt < X`. Accurate enough for a chart; a true event-sourced burndown is a later enhancement (documented gap).
- **CSV via `@Passthrough()` + `@Res()`.** The export streams `text/csv` with a `Content-Disposition` attachment and opts out of the success-envelope interceptor. Gated by `export` (admin/manager only).
- **Cache is best-effort.** Correctness never depends on Redis; the service always has a direct compute path.
- **Repository is a concrete class** (not the abstract-port pattern used elsewhere) — these are Mongo-specific read models with no swappable implementation, so a port would be ceremony.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant minio minio-setup
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api typecheck   # green
pnpm --filter @ai-projectos/api lint         # clean
pnpm --filter @ai-projectos/api exec vitest run --no-file-parallelism   # 109 pass (21 files)
pnpm --filter @ai-projectos/api build        # nest build OK
```
Note: the DB-backed suite can time out setup hooks when fully parallel on a single Mongo — run with `--no-file-parallelism`.

## Tests added
- `dashboard.integration.spec.ts` (8) — overview counts/open/done/overdue; tasks-per-user + priority buckets; project-progress %; velocity + burndown series (ideal endpoints, remaining); unknown-sprint burndown rejects; weekly report (created/completed/byPriority/activeSprints/contributors); CSV export with comma-quoting; org tenancy isolation.
- `dashboard.cache.spec.ts` (4) — compute-once/serve-cached, recompute after `invalidateOrg`, keying by params + org, and best-effort fallback when Redis throws.
- Full API suite: **109 tests** passing (was 97 + a new module).

## Definition of Done checklist
- [x] All dashboard endpoints return correct aggregates against seeded data.
- [x] Responses cached; writes invalidate the relevant cache keys (version bump via domain events; unit-tested).
- [x] CSV export gated by `export` permission.
- [x] Aggregation queries lead with the `orgId` index (no collection scans); tests pass.

## Known gaps / follow-ups
- Burndown is an `updatedAt`-proxy approximation (no daily snapshots / `completedAt`).
- No cumulative-flow or lead/cycle-time reports yet (only the spec'd set).
- CSV export is the only export format; XLSX/PDF and a sprint/velocity CSV could follow.
- Charts UI is TASK-13; AI-generated narrative reports are TASK-18.

## Notes for the next agent (TASK-13 — Dashboard frontend)
- Consume the DTOs from `@ai-projectos/shared` (all chart-ready); `x-org-id` is auto-injected by the web `api-client`.
- `overview/velocity/tasks-per-user/priority-distribution` accept `?projectId=`; `project-progress` is always org-wide; `burndown` needs `?sprintId=`.
- Responses are cached ~30s server-side and busted on any task/sprint/project write — the frontend can use normal TanStack Query staleness without hammering Mongo.
- `tasks-per-user`/`weekly` return `assigneeId`s; map names via `hooks/use-members.ts` (TASK-11).
- CSV export is a plain authenticated GET returning an attachment — trigger via a link/fetch, gated to `export` roles (`useCan('export')`).
