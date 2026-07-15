# TASK-13 — Dashboard & reports frontend

- **Layer:** Human
- **Depends on:** TASK-11, TASK-12
- **Parallel with:** —
- **Size:** M

## Specs to read first
- [08 Frontend Architecture → dashboard](../specs/08-frontend-architecture.md)
- [04 API Design → Dashboard & Reports](../specs/04-api-design.md)

## Scope — in
- `features/dashboard`: Recharts widgets (lazy-loaded) for completed/pending, velocity, burndown, tasks-per-user, priority distribution, project progress + recent activity feed.
- Date-range / project filters (URL state); skeleton loaders per widget; error boundaries per widget.
- Weekly report view + CSV export button (RBAC-gated).

## Scope — out
- AI report generation (TASK-18/19).

## Deliverables
- Complete analytics dashboard wired to TASK-12 APIs.

## Definition of Done
- [ ] All charts render from real API data with loading skeletons.
- [ ] Filters update charts via URL state.
- [ ] A broken widget is isolated by its error boundary.
- [ ] Export works for privileged roles only.
- [ ] Component tests (widget render states, filter wiring) pass.

## History requirement
Create `../history/TASK-13.md`: document chart component structure, lazy-loading of Recharts, and filter/URL-state pattern. Add CHANGELOG row.
