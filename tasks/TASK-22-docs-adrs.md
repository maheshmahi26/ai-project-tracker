# TASK-22 — Final documentation & ADRs

- **Layer:** AI (final)
- **Depends on:** TASK-21
- **Parallel with:** —
- **Size:** M

## Specs to read first
- [11 Roadmap → Phase 10](../specs/11-roadmap.md)
- All specs (to reconcile with the built system).

## Scope — in
- Root `README.md`: architecture diagram, feature list, quickstart (clone → `make up` → run), screenshots/GIFs, live demo links, env setup.
  - Feature list must include **admin user management**: admin-created users with a temporary password, forced password change on first login, block/unblock, and paginated member management (the self-service "invite a member" UI is disabled).
- Reconcile `specs/` with the actual implementation (fix any drift discovered during the build). Known drift from the admin-provisioned-users feature to reconcile:
  - `specs/04-api-design.md`: add `POST /orgs/:id/users`, `GET /orgs/:id/members/page`, `POST /orgs/:id/members/:userId/block` + `/unblock`, `POST /auth/change-password`.
  - `specs/03-database-schema.md`: `User.mustChangePassword` field.
  - `specs/07-security-rbac.md`: admin-provisioned users (non-admin roles only), system-wide block via `user.status='disabled'`, and the disabled invite flow.
- **AI tools reference** doc (auto-generate from the tool registry where possible: name, description, input/output schema, permission).
- Swagger/OpenAPI export + link.
- **ADRs** (`docs/adr/`) for major decisions: local Mongo + Qdrant (vs Atlas), LangGraph agent, tool-registry/MCP concept, monorepo + shared Zod, SSE vs WebSockets, soft-delete + undo, **admin-provisioned users + forced password reset (vs self-registration/invite)**, and **system-wide block (`disabled`) vs org-scoped suspension**.
- Per-feature **engineering notes** (why architecture / patterns / scaling / interview Qs / trade-offs) — consolidate from history entries.

## Scope — out
- No new product features.

## Deliverables
- A repo that reads like a real startup product and is interview/portfolio-ready.

## Definition of Done
- [ ] A new engineer can clone, run locally, and understand the system from docs alone.
- [ ] README + ADRs + AI tools reference complete and accurate.
- [ ] Specs match the built system.
- [ ] Links to live deployments work.

## History requirement
Create `../history/TASK-22.md`: list docs produced + ADR index, and mark the project complete in `CHANGELOG.md`. Add CHANGELOG row.
