# TASK-11 — Tasks frontend (board, table, detail, notifications)

- **Status:** ✅ done (web typecheck + lint + 37 web tests + production build; API 97 tests still green)
- **Date:** 2026-07-16
- **Agent / chat:** tasks frontend chat
- **Branch / PR:** task/TASK-11-tasks-frontend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (08-frontend-architecture → key screens; 04-api-design → Tasks/Comments/Files/Notifications)
- **Depends on:** TASK-08 (projects FE patterns), TASK-09 (tasks/sprints backend), TASK-10 (comments/labels/files/notifications backend)

## What was implemented

The human product's centerpiece — the full task-management UI — plus the notification center.

### New dependencies (`apps/web/package.json`)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — accessible Kanban drag-and-drop.
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm` — rich-text task descriptions (lazy chunk).
- `@radix-ui/react-tabs`, `@radix-ui/react-popover` — tabs + notification/mention popovers.

### API layers (`features/*/api`)
- `tasks-api.ts` — list (cursor), get, create, update, assign, move, delete, undo-delete, bulk-update, bulk-delete, subtasks list/create.
- `comments-api.ts` — list (cursor), create, update, remove (task-scoped).
- `files-api.ts` — list (new `GET /files?scopeType&scopeId`), presign, confirm, download, remove, plus `uploadFile()` (presign → PUT bytes to storage → confirm).
- `notifications-api.ts` — list (`unreadOnly`, `meta.total` = unread count), markRead, markAllRead.

### Query hooks (`features/*/hooks`)
- `use-tasks.ts`:
  - `useInfiniteTasks` (table, `useInfiniteQuery` + `getNextPageParam` on cursor).
  - `useTaskBoard` (single project, `parentId=none`, `sort=order`, grouped client-side).
  - `useTask`, `useSubtasks`, `useCreateSubtask`.
  - Mutations: `useCreateTask/useUpdateTask/useAssignTask`, `useMoveTask` (**optimistic** board patch + rollback), `useDeleteTask/useUndoDeleteTask`, `useBulkUpdateTasks/useBulkDeleteTasks`.
  - `invalidateTaskViews` invalidates both `tasks.lists` and `tasks.boards`.
- `use-comments.ts`, `use-files.ts` (upload/download/delete + scope invalidation), `use-notifications.ts` (poll every 30s; `useMarkRead`/`useMarkAllRead` optimistic with unread-count decrement).
- Shared `hooks/use-members.ts` — active-org members + `userId → member` lookup for assignee/mention UIs.

### Query keys (`lib/query-keys.ts`)
- Extended `tasks` (`lists`, `list(orgId,filters)`, `boards`, `board(orgId,projectId)`, `detail`, `subtasks`), and added `comments`, `files`, `notifications` (incl. `list(orgId)` and `unreadCount`).

### Kanban board (`features/tasks/components/kanban-board.tsx`)
- `DndContext` + `closestCorners`; each status column is a `useDroppable` container wrapping a `SortableContext`; cards are `useSortable`. `DragOverlay` renders a floating clone.
- `PointerSensor` with a 5px activation distance so a click (open detail) is distinct from a drag.
- On drop: resolve destination column, compute the new float `order` via `computeOrder(dest, index)` (midpoint / ±1 / 0), fire `useMoveTask` — optimistic reorder, rollback on failure, reconcile on settle.
- Per-column quick-add (＋) opens the create dialog pre-seeded with that status.
- Wired into **both** the Tasks page (Board view) and the Project detail **Board** tab.

### Task table (`features/tasks/components/task-table.tsx`)
- Infinite scroll via `IntersectionObserver` sentinel → `fetchNextPage`.
- Row multi-select (header select-all + per-row checkbox); selections auto-pruned when they leave the result set (filter change).
- Row menu: Edit (dialog) / Delete (with **Undo** toast).
- `BulkActionsBar` (sticky) — set status / priority / assignee (bulk-update) and bulk-delete for the selection.

### Tasks page (`features/tasks/routes/tasks-page.tsx`)
- Project selector + **Board/Table** toggle (Radix Tabs); `?project=` and `?view=` in the URL (shareable deep links).
- Table filters: debounced search, status, priority, sort. "New task" + empty state when the org has no projects.

### Task detail (`features/tasks/routes/task-detail-page.tsx`)
- Header (key, title, Edit dialog, Delete + undo). Details sidebar with inline status / priority selects and an assignee picker (`useAssignTask`).
- `TaskDescription` — lazy TipTap editor (`React.lazy`, separate 315 kB chunk). Read-only render re-parses stored HTML through TipTap's schema (drops unsafe markup — no `dangerouslySetInnerHTML`).
- Tabs: **Comments** (thread + composer with member `@mentions`), **Subtasks** (checklist + quick-add, depth-1), **Files** (drag-drop upload + download/delete), **Activity** (entity-scoped feed).

### Comments (`features/comments`)
- `comment-body.ts` — serialize plain text ⇄ a minimal TipTap-compatible JSON doc (forward-compatible with a richer editor).
- `comment-composer.tsx` — textarea + `@mention` popover (member multi-select → explicit `mentions[]`), ⌘/Ctrl+Enter to post.
- `comment-thread.tsx` — author avatar/name/relative-time, "(edited)", author-only edit/delete, mention chips.

### Files (`features/files`)
- `attachments-section.tsx` — drag-drop + browse upload with client-side size/MIME validation (`FILE_MAX_BYTES`, `isAllowedMimeType`), list with download (fresh presigned URL → new tab) and delete.

### Notifications (`features/notifications`)
- `notification-center.tsx` — Bell trigger in the top bar with an **unread badge** (from `meta.total`), popover list, per-item mark-read + deep-link to the task, and "Mark all read". Replaces the static Bell in `app-shell.tsx`.

### Backend addition (small, needed by the detail Files tab)
- `GET /files?scopeType&scopeId` — TASK-10 only had presign/confirm/download/delete, so a task couldn't list its attachments. Added `listFilesQuerySchema` (shared), `FilesRepository.listByScope` + `FilesService.listByScope` + a `@Permissions('read')` controller route. Additive; all 97 API tests remain green.

### Supporting UI primitives (`components/ui`)
- `tabs.tsx`, `popover.tsx`, `textarea.tsx` (hand-authored shadcn-style Radix wrappers). Task-scoped `task-badges.tsx` (status/priority) and `task-card.tsx`.
- `activity-feed.tsx` extended to accept `entityType`/`entityId` (task-scoped activity) in addition to `projectId`.

## Design decisions
- **Float ordering for the board.** A task's `order` is a float, so a reorder only rewrites the moved card (midpoint between neighbors) — no column renumbering. The math lives in the pure `computeOrder()` helper (unit-tested) so drag logic is testable without simulating DnD.
- **Optimistic only where it pays off.** Board moves and notification read toggles patch the cache immediately (high-frequency, low-risk). Create/update/bulk use invalidate-on-success (correctness over snappiness for structural changes).
- **Board fetches ≤100 top-level tasks per project** (grouped client-side) rather than paginating columns — simple and fast for realistic board sizes; the table view is the paginated/infinite surface. (Follow-up: per-column pagination if a column grows huge.)
- **Rich text stored as HTML string** in `task.description` (already a string column); rendered safely by re-parsing through TipTap read-only instead of injecting raw HTML.
- **Comment mentions are explicit.** The composer sends a `mentions[]` array (backend contract) rather than parsing `@` tokens out of text — reliable, and matches TASK-10's server-side membership validation.
- **TipTap is a lazy chunk** (`React.lazy` inside the already-lazy detail route) so the editor's ~315 kB never loads for users who don't open a task description.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant minio minio-setup
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api dev
pnpm --filter @ai-projectos/api worker:dev
pnpm --filter @ai-projectos/web dev

pnpm --filter @ai-projectos/web typecheck   # green
pnpm --filter @ai-projectos/web lint         # only pre-existing fast-refresh warnings
pnpm --filter @ai-projectos/web test         # 37 passing
pnpm --filter @ai-projectos/web build        # rich-text-editor emitted as its own lazy chunk
```
Note: the full API suite (`pnpm --filter @ai-projectos/api test`) is DB-backed; running all 19 spec files fully parallel can time out setup hooks on a single Mongo — run with `vitest run --no-file-parallelism` (all 97 pass).

## Tests added (web)
- `features/tasks/lib/board-order.test.ts` (4 — reorder midpoint / top / bottom / empty column).
- `features/tasks/components/bulk-actions-bar.test.tsx` (4 — hidden when empty, selection count, bulk-delete calls + clear, close button).
- `features/tasks/components/task-table.test.tsx` (2 — renders rows, selecting a row reveals the bulk bar).
- `features/comments/lib/comment-body.test.ts` (3 — text ⇄ doc round-trip, trim, empty).
- Web suite: **37 tests** passing (was 24).

## Definition of Done checklist
- [x] Create → assign → move (drag) → comment → bulk-update → soft-delete → undo all work in the UI.
- [x] Board drag is optimistic with rollback on failure (`useMoveTask` + `computeOrder`).
- [x] Table filters/sorts/searches + infinite scroll; bulk actions work.
- [x] Task detail: rich text saves (TipTap), comments + mentions, subtasks, file up/download.
- [x] Notification center works with an unread badge.
- [x] Component tests (board reorder, bulk actions, table/detail) pass.

## Known gaps / follow-ups
- Board loads up to 100 top-level tasks/project (no per-column pagination yet).
- Comment editor is plain text over a TipTap-compatible doc; a full rich comment editor with inline `@mention` nodes is a later polish.
- No realtime push — notifications poll every 30s (WebSocket/SSE is a later task).
- Labels UI (assign labels on tasks, manage label CRUD) is minimal here; TASK-10 exposes the endpoints, richer label management can follow.
- Dashboard/charts (TASK-13) and AI chat (TASK-19) remain out of scope.

## Notes for the next agent
- Server state lives in TanStack Query keyed by `lib/query-keys.ts`; mutations that touch tasks should call `invalidateTaskViews` (or invalidate `tasks.lists` + `tasks.boards`).
- The active-org `x-org-id` header is injected automatically by `api-client.ts` (configured in `configure-auth.ts`) — feature APIs don't set it.
- Reuse `hooks/use-members.ts` for anything needing member names/avatars; don't refetch members ad hoc.
- New board columns/statuses come from `TASK_STATUSES`/`STATUS_ORDER` — keep `task-badges.ts` as the single source for status/priority labels.
