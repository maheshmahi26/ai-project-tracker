# TASK-13 — Dashboard & reports frontend

- **Status:** ✅ done (web typecheck + lint + 45 web tests + production build; Recharts split into its own lazy chunk)
- **Date:** 2026-07-16
- **Agent / chat:** dashboard frontend chat
- **Branch / PR:** task/TASK-13-dashboard-frontend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (08-frontend-architecture → dashboard; 04-api-design → Dashboard & Reports)
- **Depends on:** TASK-11 (web patterns: query keys, `use-members`, activity feed), TASK-12 (dashboard/report APIs).

## What was implemented

The analytics dashboard — six Recharts widgets, a weekly report, recent activity, project filter (URL state), and an RBAC-gated CSV export — all wired to the TASK-12 read-model APIs.

### New dependency
- `recharts@2.15.4` (charts). Lazy-loaded, so it never enters the initial bundle.

### API + hooks
- `features/dashboard/api/dashboard-api.ts` — typed calls for `overview`, `velocity`, `burndown`, `tasks-per-user`, `priority-distribution`, `project-progress`, `reports/weekly`, and `exportTasksCsv` (Blob).
- `features/dashboard/hooks/use-dashboard.ts` — one query hook per widget (keyed `['dashboard', <widget>, orgId, filters]`, `staleTime: 30s` to match the server cache), plus `useExportTasks` (mutation → Blob → `<a download>` → toast).
- `features/sprints/api/sprints-api.ts` + `hooks/use-sprints.ts` — minimal `GET /projects/:projectId/sprints` list to drive the burndown sprint selector (no full sprints UI in scope).
- `lib/api-client.ts` — added `getBlob()` (raw GET returning a Blob, reuses auth + `x-org-id` injection, skips envelope unwrapping) for the CSV download.
- `lib/query-keys.ts` — added `dashboard.widget(orgId, widget, filters)` and `sprints.list(orgId, projectId)`.

### Charts (lazy Recharts) — `features/dashboard/components/charts/`
- `chart-kit.tsx` — shared `CHART_COLORS` (mapped to new `--chart-1..5` design tokens), themed `ChartTooltip` (card-styled, dark-mode aware), axis style constants.
- One file per chart, each a **default export** so it can be `React.lazy`'d: `velocity-chart` (grouped bars), `burndown-chart` (ideal dashed vs remaining line), `tasks-per-user-chart` (stacked horizontal bars), `priority-distribution-chart` (donut), `completion-chart` (done vs pending donut), `project-progress-chart` (horizontal % bars).
- `charts/lazy.ts` — `React.lazy` wrappers for all six.

### Widgets — `features/dashboard/components/dashboard-widgets.tsx`
- `OverviewStats` (4 stat cards: active projects / open / completed / overdue) + the six chart widgets.
- Each chart widget = `ChartFrame` (Suspense + **per-widget ErrorBoundary**) → `WidgetState` (loading skeleton / error / empty) → lazy chart. So a broken or slow chart is isolated and never takes down the page.
- `BurndownWidget` owns a sprint `<select>` (rendered in the new `ChartFrame` `action` slot); defaults to the active sprint, else the first. Sprints are project-scoped, so with "All projects" it prompts to pick a project.
- `TasksPerUserWidget`/`WeeklyReport` map `assigneeId → name` via `hooks/use-members` (TASK-11).

### Page + report — `features/dashboard/routes/dashboard-page.tsx`, `components/weekly-report.tsx`
- Header: project filter (`<select>`, **URL state** via `?project=`; empty = org-wide) + `Export CSV` button gated by `useCan('export')`.
- Grid of the six widgets; `WeeklyReport` card (created/completed/active-sprints, created-by-priority badges, top contributors) + `Recent activity` (reused `ActivityFeed`, project-scoped).
- `ChartFrame` extended with an optional `action` header slot and a taller (260px) Suspense skeleton.

### Design tokens — `index.css`
- Added `--chart-1..5` (OKLCH) to `:root` + `.dark` and mapped them in the `@theme` block (`--color-chart-*`), so charts are theme-aware in light/dark.

## Design decisions
- **Recharts is a lazy chunk.** Every chart is `React.lazy`; the dashboard route itself is already lazy. Build confirms Recharts lands in a separate `chart-kit` chunk (~377 kB / 107 kB gzip) loaded only when a chart mounts — not in the initial bundle.
- **Per-widget resilience over page-level.** Each widget has its own `ChartFrame` boundary + `WidgetState`, so one failing endpoint/chart degrades to an inline error while the rest of the dashboard renders — satisfies the "broken widget is isolated" DoD.
- **Filter = project, in the URL.** The genuinely re-scoping filter is `projectId` (all TASK-12 scoped endpoints accept it); it lives in the querystring so dashboards are shareable/bookmarkable. A date range isn't wired because the aggregation endpoints (except the weekly report's implicit 7-day window) are point-in-time — noted as a follow-up.
- **Client `staleTime` mirrors the server cache (30s).** The server already caches + busts on writes, so the client doesn't need aggressive refetching.
- **CSV via `getBlob` + anchor download.** The export endpoint returns `text/csv` (not the JSON envelope), so it bypasses the normal client unwrap; the button is hidden entirely for roles without `export` (server still enforces it).
- **Charts are pure/presentational** (data in → SVG out); all fetching/mapping happens in widgets, keeping charts trivially reusable and the lazy chunks lean.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant minio minio-setup
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api dev
pnpm --filter @ai-projectos/web dev     # open / (dashboard is the index route)

pnpm --filter @ai-projectos/web typecheck   # green
pnpm --filter @ai-projectos/web lint         # only pre-existing fast-refresh warnings (+ chart-kit)
pnpm --filter @ai-projectos/web test         # 45 passing
pnpm --filter @ai-projectos/web build        # recharts emitted as its own lazy chunk
```

## Tests added (web)
- `features/dashboard/components/widget-state.test.tsx` (4) — loading skeleton / error / empty / children.
- `features/dashboard/routes/dashboard-page.test.tsx` (4) — renders all widgets org-wide; export hidden without `export`; export button fires `mutate` for privileged roles; changing the project filter re-scopes widgets (URL state). Chart widgets are stubbed so Recharts never mounts in jsdom.
- Web suite: **45 tests** passing (was 37).

## Definition of Done checklist
- [x] All charts render from real API data with loading skeletons.
- [x] Filters update charts via URL state (`?project=`).
- [x] A broken widget is isolated by its error boundary (`ChartFrame` per widget).
- [x] Export works for privileged roles only (`useCan('export')` + server `export` permission).
- [x] Component tests (widget render states, filter wiring, export gating) pass.

## Known gaps / follow-ups
- No date-range filter (TASK-12 aggregations are point-in-time except the weekly 7-day window); a ranged burndown/velocity is a later enhancement.
- Burndown needs a project selected (sprints are project-scoped); no org-wide burndown.
- Recharts' `ResponsiveContainer` renders empty at 0×0 in jsdom, so chart internals aren't asserted in tests — widgets are tested via stubs + `WidgetState` unit tests.
- No auto-refresh/live updates beyond TanStack Query staleness; charts refetch on window focus.

## Notes for the next agent
- Add a new widget by: writing a pure default-export chart in `components/charts/`, a `React.lazy` entry in `charts/lazy.ts`, and a widget wrapper (`ChartFrame` + `WidgetState` + hook) in `dashboard-widgets.tsx`.
- New dashboard endpoints → add to `dashboard-api.ts` + a hook in `use-dashboard.ts` keyed via `queryKeys.dashboard.widget`.
- Chart colors come from `--chart-1..5`; use `chartColor(i)`/`CHART_COLORS` rather than hardcoding.
- `getBlob` on the api-client is the pattern for any future file/binary download.
