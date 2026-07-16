# TASK-05 — Auth + RBAC backend

- **Status:** ✅ done (verified live)
- **Date:** 2026-07-16
- **Agent / chat:** auth + rbac backend chat
- **Branch / PR:** task/TASK-05-auth-rbac-backend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (07-security-rbac, 03-database-schema, 04-api-design)

## What was implemented

A production-shaped authentication, multi-tenant organization, and RBAC layer in
`apps/api`, with shared contracts in `packages/shared`.

### Shared contracts — `packages/shared/src/index.ts`
- **RBAC**: `PERMISSIONS` list + `permissionSchema`, `ROLE_PERMISSIONS` matrix
  (owner/admin/member/viewer → permissions), and `can(role, permission)` helper —
  single source of truth used by both API guards and (later) the web UI.
- **Auth DTOs (Zod)**: `emailSchema`, `passwordSchema`, `registerSchema`,
  `loginSchema`, `refreshSchema`, `forgotPasswordSchema`, `resetPasswordSchema`.
- **Org DTOs (Zod)**: `createOrgSchema`, `updateOrgSchema`, `inviteMemberSchema`,
  `changeRoleSchema`.
- **Public response types**: `PublicUser`, `AuthTokens`, `AuthResult`,
  `OrganizationDTO`, `MembershipDTO` (never expose hashes/secrets).

### Schemas (Mongoose) — `apps/api/src/modules/*/schemas/`
- `users/schemas/user.schema.ts` — email, name, `provider` (local/google),
  `status`, `passwordHash`, `googleId`, `refreshTokenHash`, `resetTokenHash` +
  expiry, `defaultOrgId`. Secrets stripped in `toJSON`.
- `organizations/schemas/organization.schema.ts` — name, unique `slug`, `ownerId`,
  `plan`, `settings`, soft-delete `deletedAt`.
- `organizations/schemas/membership.schema.ts` — `orgId`+`userId` (unique compound),
  `role`, `status`, `invitedBy`, `joinedAt`.
- `audit/schemas/audit-log.schema.ts` — actor/org/action/source/ip/ua/requestId.
- **All ObjectId props use `SchemaTypes.ObjectId`** and all nullable/union props
  carry an explicit `type:` (see decisions) so SWC metadata reflection is correct.

### Repositories (ports + Mongo impls)
- `users.repository.ts`, `organizations.repository.ts`, `memberships.repository.ts`,
  `audit/audit.repository.ts` — abstract port + `Mongo*` implementation each.
  Users repo exposes `findByIdWithSecrets` / `findByIds` for the auth path.

### Crypto & tokens
- `common/crypto/hash.ts` — `hashToken` (SHA-256 for high-entropy refresh/reset
  tokens), `generateToken` (URL-safe random), `safeEqualHex` (constant-time).
- `modules/auth/password.service.ts` — **Argon2id** hash/verify for user passwords.
- `modules/auth/token.service.ts` — signs **access** + **refresh** JWTs with
  **separate secrets** and TTLs; refresh carries a `jti`.

### Guards / decorators / strategies — `modules/auth/`
- `guards/jwt-auth.guard.ts` (respects `@Public()`), `local-auth.guard.ts`,
  `google-auth.guard.ts` (throws if Google env not configured),
  `org.guard.ts` (resolves `orgId`, verifies active membership, attaches `OrgContext`),
  `permissions.guard.ts` (enforces `@Permissions()` against the member's role).
- `decorators/`: `@Public()`, `@Permissions()`, `@CurrentUser()`, `@CurrentOrg()`.
- `strategies/`: `jwt.strategy.ts`, `local.strategy.ts`, `google.strategy.ts`
  (registered only when Google client id/secret are present).

### Services & controllers
- `auth.service.ts` + `auth.controller.ts` — register, login, refresh (rotation +
  reuse detection), logout, forgot/reset password, google + callback, `GET /auth/me`.
  Refresh token is also set as an httpOnly cookie.
- `organizations.service.ts` + `organizations.controller.ts` — org CRUD (create/list/
  get/update/soft-delete), members list/invite/change-role/remove, with tenant
  scoping + RBAC + last-admin protection.
- `memberships.service.ts` — role resolution + active-membership checks.
- `mail/` — `MailService` enqueues a password-reset job to BullMQ;
  `MailProcessor` consumes it (prints to console in dev).
- `audit/audit.service.ts` — records auth/membership events (non-blocking).

### Wiring
- `app.module.ts` imports Audit/Users/Auth/Organizations modules and registers
  **`JwtAuthGuard` globally** via `APP_GUARD` (routes opt out with `@Public()`).
- `main.ts` adds `cookie-parser`.
- Existing health/debug/ping routes marked `@Public()`.

## Key decisions & deviations
- **Two token secrets** (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`), access TTL
  **15 min**, refresh TTL **7 days** (env-driven). Compromise of one class of token
  can't mint the other.
- **Refresh rotation + reuse detection**: only the SHA-256 hash of the current
  refresh token is stored on the user. On refresh we verify the presented token's
  hash matches; on success we rotate (store the new hash). If a **already-rotated**
  (old) token is presented, we treat it as theft → clear the stored hash, forcing
  re-login on the whole session. Verified live: reusing the old refresh **and** the
  freshly-rotated one both return `UNAUTHENTICATED` after a reuse is detected.
- **Argon2id** for passwords (memory-hard) vs bcrypt.
- **RBAC matrix lives in `packages/shared`** (`ROLE_PERMISSIONS` + `can()`) so the
  frontend can render permission-aware UI from the same source in TASK-06.
- **Guard model**: global `JwtAuthGuard`; route/controller composes `OrgGuard` +
  `PermissionsGuard` with `@Permissions(...)`. `OrgGuard` enforces tenant isolation
  by resolving `orgId` and confirming an active membership before anything runs.
- **Mongoose + SWC metadata fix**: nullable/union `@Prop`s need an explicit `type:`
  and ObjectId props must use `SchemaTypes.ObjectId` (not `Types.ObjectId`, which is
  reflected as `Mixed` and breaks `ObjectId` casting in queries). This was the root
  cause of "membership not found after create" during testing.
- **Transaction resilience**: `OrganizationsService` detects replica-set support at
  runtime (`hello.setName`). With a replica set it writes org+owner-membership in a
  transaction; on a standalone server it falls back to sequential writes (with
  duplicate-key handling). Local dev works either way; `.env` uses
  `replicaSet=rs0&directConnection=true`.
- **Google strategy is conditional** — the module only registers it when
  `GOOGLE_CLIENT_ID`/`SECRET` are set, so the app boots without Google creds.

## How to run / verify locally
```
pnpm install
docker compose -f docker/docker-compose.yml up -d      # mongo/redis/qdrant/minio
pnpm --filter @ai-projectos/api dev                     # API on :3001, docs at /api/docs

# quality gates
pnpm --filter @ai-projectos/api typecheck
pnpm --filter @ai-projectos/api lint
pnpm --filter @ai-projectos/api test                    # unit + integration
pnpm --filter @ai-projectos/api build
```

## Verified live (2026-07-16)
End-to-end smoke test against a running API on :3001:
- `POST /auth/register` → returns `PublicUser` (no secrets) + access/refresh tokens.
- `GET /auth/me` **without** token → `401`; **with** token → the user.
- `POST /auth/refresh` → issues a new access token and **rotates** the refresh token.
- Reusing the **old** refresh → `UNAUTHENTICATED`; the **rotated** token is then also
  invalidated → `UNAUTHENTICATED` (reuse detection locks the session).
- `POST /orgs` → creates org with generated `slug`, caller becomes `admin`.
- `GET /orgs` → lists the caller's org with role `admin`.

## Tests added
- `modules/auth/rbac.spec.ts` — permission matrix / `can()` per role.
- `modules/auth/token.service.spec.ts` — access/refresh issuance + verification +
  duration parsing.
- `modules/auth/password.service.spec.ts` — Argon2id hash/verify.
- `modules/auth/auth.integration.spec.ts` — register/login/refresh/logout,
  **refresh reuse detection**, forgot/reset password, google provisioning.
- `modules/organizations/organizations.integration.spec.ts` — org create, tenant
  isolation, viewer write-blocked, admin role change, last-admin protection.
- Integration harness `test/integration-module.ts` — isolated DB per test file,
  faked mail/config.

## Definition of Done checklist
- [x] Register→login→access protected route→refresh (rotates)→logout works.
- [x] Refresh-token **reuse** is detected and locks the session.
- [x] Google login provisions a user (strategy + provisioning path; conditional on env).
- [x] Forgot/reset password issues single-use, expiring, hashed token.
- [x] RBAC matrix enforced (Viewer blocked from writes); tenant isolation via `orgId`.
- [x] Sensitive fields never serialized (`toJSON` strips hashes; public DTO mappers).
- [x] Unit (RBAC matrix, token service, password) + integration (auth, tenant) tests pass.

## Known gaps / follow-ups
- **No frontend** — login/register/refresh wiring + org bootstrap is TASK-06
  (`configureApiAuth` hook already exists on the web client).
- Password-reset email is a **console stub** via BullMQ; real transport in a later
  DevOps/mail task.
- Email verification is modeled (`emailVerifiedAt`) but not enforced yet.
- Member **invite** creates a membership record; invite-email + accept flow is a
  follow-up.
- Audit log is written but there's no read/query API yet.

## Notes for the next agent
- **Protect a route**: it's authenticated by default (global `JwtAuthGuard`). For
  tenant + permission scoping add `@UseGuards(OrgGuard, PermissionsGuard)` +
  `@Permissions('project:write')`, and read context with `@CurrentUser()` /
  `@CurrentOrg()`. Mark truly public routes with `@Public()`.
- **`orgId` source**: `OrgGuard` resolves it from the request (param/header/body per
  its logic) and verifies active membership — always scope repository queries by the
  `orgId` from `@CurrentOrg()`, never trust a client-supplied id blindly.
- **Permissions**: import `ROLE_PERMISSIONS` / `can()` from `@ai-projectos/shared`;
  don't hard-code role checks. Add new permissions there so UI + API stay in sync.
- **New Mongoose schemas**: give every ObjectId prop `type: SchemaTypes.ObjectId` and
  every nullable/union prop an explicit `type:` (SWC reflection caveat above).
- **Writes needing atomicity**: reuse the `supportsTransactions()` + fallback pattern
  in `OrganizationsService` so it works on both replica-set and standalone Mongo.
- **New shared DTOs** go in `packages/shared` (Zod schema + inferred type + public
  response interface); the frontend consumes these directly in TASK-06.
