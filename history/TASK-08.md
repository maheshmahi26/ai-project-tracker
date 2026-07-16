# TASK-08 — Projects frontend

- **Status:** ✅ done (typecheck + lint + 24 web tests)
- **Date:** 2026-07-16
- **Agent / chat:** projects frontend chat
- **Branch / PR:** task/TASK-08-projects-frontend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (08-frontend-architecture, 04-api-design → Projects)

## What was implemented

The full projects management UI wired to the TASK-07 API: a filter/sort/search/
paginated list, create/edit dialogs, optimistic archive/restore/delete-with-undo, and
a project detail shell (overview + activity feed, placeholder tabs for board/sprints).

### API client — active-org header
- `lib/api-client.ts` — `configureApiAuth` now also takes `getOrgId`; both `request` and
  `requestWithMeta` inject an `x-org-id` header (unless already set). This satisfies the
  backend `TenantGuard` for every project/activity route.
- `features/auth/configure-auth.ts` — wires `getOrgId: () => useOrgStore.getState().activeOrgId`.

### Query keys — `lib/query-keys.ts`
- `projects.lists` (prefix for bulk invalidation / optimistic patching),
  `projects.list(orgId, filters)`, `projects.detail(id)`.
- `activity.all`, `activity.list(orgId, filters)`.
- Keys are **org-scoped** (org id in the key) so switching orgs can't show stale data.

### Projects data layer — `features/projects/`
- `api/projects-api.ts` — `list` (via `getWithMeta` → `{ items, page }`), `get`, `create`,
  `update`, `archive`, `restore`, `remove`, `undoDelete`.
- `hooks/use-projects.ts`:
  - `useProjects(params)` — list query; `placeholderData: (prev) => prev` keeps the current
    page on screen while the next loads (smooth paging/filtering).
  - `useProject(id)` — detail (enabled only with an id).
  - `useCreateProject` / `useUpdateProject` — invalidate `projects.lists`; update also
    seeds the detail cache.
  - `useArchiveProject` / `useRestoreProject` — **optimistic** in-place status flip.
  - `useDeleteProject` — **optimistic** removal from every cached list.
  - `useUndoDeleteProject` — restore + invalidate.

### Activity feed — `features/activity/`
- `api/activity-api.ts` + `hooks/use-activity.ts` — `GET /activity?projectId=…`.
- `components/activity-feed.tsx` — loading skeletons, empty/error states, relative
  timestamps; used on the project detail Activity tab.

### UI — `features/projects/`
- `routes/projects-page.tsx` — header (New project, gated by `useCan('project:create')`),
  toolbar (debounced search, status filter active/archived/all, sort), `DataTable`, and
  offset pagination (Prev/Next + page count from `meta.page.total`). Row click → detail.
- `routes/project-detail-page.tsx` — back link, header with color/key/status + Edit/
  Archive-Restore actions, lightweight local-state tabs (Overview populated; Board/Sprints
  placeholders; Activity renders the feed).
- `components/project-form-dialog.tsx` — RHF create/edit dialog. Validates via the shared
  schemas' `safeParse` (no direct `zod` dep in web, matching TASK-06). Key field is
  create-only; native color + date inputs.
- `components/project-row-actions.tsx` — per-row menu (Edit/Archive|Restore/Delete),
  each entry gated by `useCan`. Delete fires an **undo toast** (`sonner`) that calls
  `useUndoDeleteProject`.
- `components/project-status-badge.tsx` — active/archived badge.
- `hooks/use-debounced-value.ts` — 300ms debounce for the search box.

### Routing — `app/router.tsx`
- Added lazy `projects/:projectId` under the `RequireAuth → RequireOrg → AppShell` chain.

## Query-key layout (for the next agent)
```
['projects']                                  projects.all
['projects','list']                           projects.lists   (invalidate/patch prefix)
['projects','list', orgId, { status,q,sort,page,pageSize }]   a page
['projects','detail', id]                     one project
['activity','list', orgId, { projectId? }]    activity feed
```
- Invalidate `projects.lists` after any mutation; it covers all filter/page combos.
- Optimistic helpers (`patchLists`/`restoreLists`) use `getQueriesData`/`setQueriesData`
  over the `projects.lists` prefix and snapshot for rollback.

## Optimistic patterns used
- **Archive/Restore**: `onMutate` cancels in-flight list queries, flips `status` in place
  across all cached lists, snapshots previous; `onError` restores; `onSettled` invalidates.
- **Delete + undo**: `onMutate` removes the row from all lists (instant), snapshots for
  rollback; on success a toast offers **Undo** → `undoDelete` → invalidate. `onError`
  rolls back.
- **List paging**: `placeholderData: (prev) => prev` (v5 keep-previous-data) avoids table
  flicker between pages/filters.

## Detail-tab extension points
- Tabs are a local `useState<TabId>` list in `project-detail-page.tsx`. Board (TASK-11) and
  Sprints (TASK-09/11) currently render `PlaceholderTab`; swap in real components there.
- The Activity tab already consumes `ActivityFeed projectId=…`; reuse it elsewhere.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant
pnpm --filter @ai-projectos/shared build
pnpm dev                                  # web + api

pnpm --filter @ai-projectos/web typecheck # green
pnpm --filter @ai-projectos/web lint      # 0 errors (2 pre-existing fast-refresh warns)
pnpm --filter @ai-projectos/web test      # 24 passing
```

## Tests added
- `features/projects/components/project-form-dialog.test.tsx` (3) — empty-name validation,
  invalid-key validation, valid submit.
- `features/projects/routes/projects-page.test.tsx` (2) — renders rows + count, empty state.
- `features/projects/hooks/use-projects.test.tsx` (2) — optimistic **rollback** on failed
  delete and failed archive.
- Suite: **24 web tests** passing.

## Definition of Done checklist
- [x] Create/edit/archive/restore/delete+undo work with optimistic UI + rollback.
- [x] List filters (status) / sorts / searches (debounced) / paginates (offset).
- [x] Viewer role sees read-only UI (create/edit/archive/delete controls hidden via `useCan`).
- [x] Activity feed renders on project detail.
- [x] Component tests (list, dialog validation, optimistic rollback) pass.

## Known gaps / follow-ups
- `requestWithMeta` (list reads) does not run the 401→refresh retry that `request` does;
  fine today because AuthBootstrap refreshes on load, but consider unifying.
- Detail tabs Board/Sprints are placeholders until TASK-09/TASK-11.
- `leadId` (project lead) is not yet editable — needs the member-picker UI when assignees land.
- Pagination is offset-only in the UI (backend also supports cursor); revisit for very large lists.

## Notes for the next agent
- Send `x-org-id` automatically — it's wired in `configure-auth.ts`; new resource calls
  just use `apiClient`.
- Gate every mutating control with `useCan('<permission>')`; the server still enforces.
- Reuse `DataTable`, `EmptyState`, `useDebouncedValue`, and the optimistic
  `patchLists`/`restoreLists` pattern for Tasks (TASK-09 frontend).
