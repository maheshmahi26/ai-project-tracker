# Build Changelog (newest first)

Each completed task adds a row at the **top**. Keep it one line; details go in `TASK-XX.md`.

| Date | Task | Title | Status | Agent / chat | Entry |
|------|------|-------|--------|--------------|-------|
| 2026-07-16 | TASK-12 | Dashboard & reports backend (aggregation read-models, versioned Redis cache + event-driven invalidation, CSV export) | ✅ done (109 API tests + build) | dashboard backend chat | [TASK-12.md](./TASK-12.md) |
| 2026-07-16 | TASK-11 | Tasks frontend (Kanban DnD board, table + infinite scroll/bulk, task detail: TipTap/comments/subtasks/files, notification center) | ✅ done (typecheck/lint/37 web tests + build) | tasks frontend chat | [TASK-11.md](./TASK-11.md) |
| 2026-07-16 | TASK-10 | Comments, Labels, Files (R2/MinIO), Notifications + email jobs | ✅ done (97 tests + live MinIO round-trip) | comments/labels/files/notifications backend chat | [TASK-10.md](./TASK-10.md) |
| 2026-07-16 | TASK-09 | Sprints + Tasks backend (subtasks, move/bulk, transactional sprint points, text search) | ✅ done (74 tests + live smoke) | sprints + tasks backend chat | [TASK-09.md](./TASK-09.md) |
| 2026-07-16 | TASK-08 | Projects frontend (list/detail, CRUD dialogs, optimistic archive/restore/delete+undo) | ✅ done (typecheck/lint/24 tests) | projects frontend chat | [TASK-08.md](./TASK-08.md) |
| 2026-07-16 | TASK-07 | Projects backend + activity/audit domain event bus | ✅ done (54 tests + live smoke) | projects backend chat | [TASK-07.md](./TASK-07.md) |
| 2026-07-16 | TASK-06 | Auth frontend + org bootstrap (session refresh, guards, RBAC UI) | ✅ done (typecheck/lint/test/build) | auth frontend chat | [TASK-06.md](./TASK-06.md) |
| 2026-07-16 | TASK-05 | Auth + RBAC backend (users/orgs/memberships, JWT + refresh rotation, guards) | ✅ done (verified live) | auth + rbac backend chat | [TASK-05.md](./TASK-05.md) |
| 2026-07-16 | TASK-04 | Frontend skeleton & design system | ✅ done (verified) | frontend skeleton chat | [TASK-04.md](./TASK-04.md) |
| 2026-07-15 | TASK-03 | Backend skeleton & cross-cutting concerns | ✅ done (verified live) | backend skeleton chat | [TASK-03.md](./TASK-03.md) |
| 2026-07-15 | TASK-02 | Local infra (Mongo RS + Redis + Qdrant + MinIO) & config | ✅ done (containers healthy) | initial setup chat | [TASK-02.md](./TASK-02.md) |
| 2026-07-15 | TASK-01 | Monorepo & tooling foundation | ✅ done (installed & building) | initial setup chat | [TASK-01.md](./TASK-01.md) |

<!--
Example row once TASK-01 is done:
| 2026-07-16 | TASK-01 | Monorepo & tooling | ✅ done | <chat link> | [TASK-01.md](./TASK-01.md) |
-->
