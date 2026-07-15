# TASK-11 — Tasks frontend (board, table, detail, notifications)

- **Layer:** Human
- **Depends on:** TASK-08, TASK-09
- **Parallel with:** TASK-10
- **Size:** L

## Specs to read first
- [08 Frontend Architecture → key screens, AI-independent parts](../specs/08-frontend-architecture.md)
- [04 API Design → Tasks, Comments, Files, Notifications](../specs/04-api-design.md)

## Scope — in
- `features/tasks`:
  - **Kanban board** with drag-and-drop + **optimistic** reorder/status change.
  - **Task table**: filter/sort/search/**infinite scroll**, multi-select → **bulk actions** (update/delete).
  - **Task detail**: TipTap rich description (lazy), comments thread (+mentions), subtasks, file upload/download, activity.
- `features/notifications`: notification center in top bar (list, mark read/all), unread badge.
- Optimistic mutations + rollback; skeleton/empty/error states; keyboard + a11y.

## Scope — out
- Dashboard (TASK-13). AI chat (TASK-19). Depends on TASK-10 endpoints for comments/files/notifications — coordinate or mock if TASK-10 not merged yet.

## Deliverables
- Full task-management UI — the human product's centerpiece.

## Definition of Done
- [ ] Create→assign→move (drag)→comment→bulk-update→soft-delete→undo all work in UI.
- [ ] Board drag is optimistic with rollback on failure.
- [ ] Table filters/sorts/searches + infinite scroll; bulk actions work.
- [ ] Task detail: rich text saves, comments + mentions, subtasks, file up/download.
- [ ] Notification center works with unread badge.
- [ ] Component tests (board reorder, bulk actions, detail) pass.

## History requirement
Create `../history/TASK-11.md`: document board ordering approach, optimistic patterns, TipTap integration, and query-key invalidation map. Add CHANGELOG row.
