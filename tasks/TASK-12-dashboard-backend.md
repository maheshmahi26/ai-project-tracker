# TASK-12 — Dashboard & reports backend

- **Layer:** Human
- **Depends on:** TASK-09
- **Parallel with:** TASK-10, TASK-11
- **Size:** M

## Specs to read first
- [04 API Design → Dashboard & Reports](../specs/04-api-design.md)
- [02 Architecture → CQRS-lite read models, caching](../specs/02-architecture.md)

## Scope — in
- Dashboard module with **aggregation pipelines** (read models), **Redis-cached** with short TTL + explicit invalidation on writes:
  - overview counts, velocity (per sprint), burndown (per sprint), tasks-per-user, priority distribution, project progress.
- Weekly report endpoint (aggregated summary data — no AI).
- Export endpoints (CSV) for privileged roles; RBAC + tenancy.

## Scope — out
- Charts UI (TASK-13). AI-generated reports (TASK-18).

## Deliverables
- Cached, indexed dashboard/report APIs returning chart-ready data.

## Definition of Done
- [ ] All dashboard endpoints return correct aggregates against seeded data.
- [ ] Responses cached; writes invalidate the relevant cache keys.
- [ ] CSV export gated by `export` permission.
- [ ] Aggregation queries use indexes (no collection scans); tests pass.

## History requirement
Create `../history/TASK-12.md`: document each aggregation's shape, cache keys + invalidation triggers, and index requirements. Add CHANGELOG row.
