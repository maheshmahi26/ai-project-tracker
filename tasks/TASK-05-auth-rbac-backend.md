# TASK-05 — Auth + RBAC backend

- **Layer:** Human
- **Depends on:** TASK-03
- **Parallel with:** —
- **Size:** L

## Specs to read first
- [07 Security & RBAC](../specs/07-security-rbac.md)
- [03 Database Schema](../specs/03-database-schema.md) (Users, Memberships, Organizations)
- [04 API Design → Auth, Organizations](../specs/04-api-design.md)

## Scope — in
- Schemas: **Users**, **Organizations**, **Memberships** (Mongoose) + repositories (ports + impls).
- Passwordless-safe password auth: **Argon2id** hashing.
- Passport strategies: **local**, **JWT**, **Google OAuth**.
- Tokens: short-TTL **access** + rotating **refresh** (hash stored, reuse detection → force logout).
- Endpoints: register, login, refresh, logout, forgot-password, reset-password (emailed token via BullMQ email job stub), google + callback, `GET /auth/me`.
- Org endpoints: create/list/get/update/soft-delete; members list/invite/change-role/remove.
- **RBAC**: role→permission matrix, `RolesGuard`, `@Permissions()`, `@CurrentUser()`, `OrgGuard` (tenant scoping), resource policy checks.
- Audit auth + membership events.
- Shared Zod schemas/DTOs in `packages/shared`.

## Scope — out
- No frontend (TASK-06). No project/task features (TASK-07+).

## Deliverables
- Fully working auth + org + RBAC backend with Swagger docs.

## Definition of Done
- [ ] Register→login→access protected route→refresh (rotates)→logout works via Swagger.
- [ ] Refresh-token **reuse** is detected and locks the session.
- [ ] Google login provisions a user.
- [ ] Forgot/reset password issues single-use, expiring, hashed token.
- [ ] RBAC matrix enforced (Viewer blocked from writes); tenant isolation enforced (`orgId` scoping).
- [ ] Sensitive fields never serialized.
- [ ] Unit (RBAC matrix, token service) + integration (auth flows, tenant isolation) tests pass.

## History requirement
Create `../history/TASK-05.md`: document token TTLs, refresh rotation/reuse strategy, permission matrix location, and how other modules should apply guards. Add CHANGELOG row.
