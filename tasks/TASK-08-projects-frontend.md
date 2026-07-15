# TASK-08 — Projects frontend

- **Layer:** Human
- **Depends on:** TASK-06, TASK-07
- **Parallel with:** —
- **Size:** M

## Specs to read first
- [08 Frontend Architecture](../specs/08-frontend-architecture.md)
- [04 API Design → Projects](../specs/04-api-design.md)

## Scope — in
- `features/projects`: list view (table/cards) with filter/sort/search/pagination, create/edit dialogs (RHF+Zod), archive/restore, soft-delete with **undo toast**.
- Project detail **shell** (tabs for future: overview/board/sprints/activity) — populate overview + activity feed.
- TanStack Query hooks with **optimistic updates** for archive/restore/delete.
- RBAC-aware controls via `useCan()`; skeleton/empty/error states.

## Scope — out
- No sprint/task board (TASK-11). Detail tabs can be placeholders except overview + activity.

## Deliverables
- Complete projects management UI wired to TASK-07 API.

## Definition of Done
- [ ] Create/edit/archive/restore/delete+undo all work with optimistic UI + rollback.
- [ ] List filters/sorts/searches/paginates.
- [ ] Viewer role sees read-only UI.
- [ ] Activity feed renders on project detail.
- [ ] Component tests (list, dialog validation, optimistic rollback) pass.

## History requirement
Create `../history/TASK-08.md`: document query-key layout for projects, optimistic patterns used, and detail-tab extension points. Add CHANGELOG row.
