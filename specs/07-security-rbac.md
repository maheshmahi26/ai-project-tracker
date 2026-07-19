# 07 — Security & RBAC

## Authentication

### Strategies (Passport)
- **Local**: email + password (Argon2id hashing).
- **JWT**: stateless access tokens.
- **Google OAuth 2.0**: social login; first login provisions a user (`provider:'google'`).

### Token model
| Token | TTL | Storage | Purpose |
|-------|-----|---------|---------|
| **Access** | ~15 min | in-memory (FE) / `Authorization` header | authorize API calls |
| **Refresh** | ~7–30 days | httpOnly, Secure, SameSite cookie | mint new access tokens |

- **Refresh rotation**: each refresh issues a new refresh token and invalidates the old one (hash stored in `Users.refreshTokenHash`). Detects reuse → force logout (possible theft).
- **Logout**: clears refresh cookie + drops stored hash.
- **Short access TTL** avoids a full revocation list; sensitive actions can require re-auth.

### Auth flows

```
Register → hash password (Argon2id) → create user → issue access+refresh
Login    → verify password → issue access+refresh (rotate)
Refresh  → validate refresh (hash + not reused) → issue new pair
Forgot   → email one-time, expiring, single-use reset token (hashed at rest)
Reset    → validate token → set new password → invalidate sessions
Google   → OAuth → find/create user → issue access+refresh
```

## Authorization — RBAC

Roles are **per-organization** (a user can be Admin in one org, Tester in another) via `Memberships`. There are exactly four roles: **admin, manager, developer, tester**. Testers have the same reach as developers (they own and update task work); the two differ only in intent.

### Roles → permissions matrix

| Permission | Admin | Manager | Developer | Tester |
|------------|:----:|:-------:|:---------:|:------:|
| read (projects/tasks/…) | ✅ | ✅ | ✅ | ✅ |
| task:create / update | ✅ | ✅ | ✅ | ✅ |
| task:delete | ✅ | ✅ | ✅* | ✅* |
| task:assign | ✅ | ✅ | ✅ | ✅ |
| project:create / update | ✅ | ✅ | ❌ | ❌ |
| project:archive / delete | ✅ | ✅ | ❌ | ❌ |
| sprint:manage | ✅ | ✅ | ❌ | ❌ |
| export | ✅ | ✅ | ❌ | ❌ |
| manage:users (invite/roles) | ✅ | ❌ | ❌ | ❌ |
| manage:org (settings/delete) | ✅ | ❌ | ❌ | ❌ |

\* Developers/testers may delete tasks they created / are assigned to (policy-checked), not arbitrary ones.

### Domain invariants enforced in the Application layer

These rules live in the services (so both REST and AI tools inherit them):

- **Task assignment**: only members with the **developer** or **tester** role can be the assignee of a task. Assigning an admin/manager is rejected (`businessRule`). Enforced in `TasksService` for create/update/assign/bulk.
- **Project manager (lead)**: a project's `leadId` is its single manager. The lead must hold the **manager** role, and a manager can lead **at most one** active project. Enforced in `ProjectsService` for create/update. (Uniqueness is enforced in the service, not a DB index, so pre-existing data is never invalidated — only new writes are blocked.)
- **Subtasks**: a subtask (a task with `parentId`) cannot itself have subtasks (max depth 1) and defaults to its parent's assignee when created without one.
- **AI user management**: only admins hold `manage:users`, so the AI user-management tools (`createUser`, `bulkCreateUsers`, `removeUser`, `bulkRemoveUsers`) are only ever offered to and usable by admins.

> Migration note: the former `viewer` role was replaced by `tester`. The idempotent migration (`scripts/migrate.ts`) rewrites any residual `role:'viewer'` membership to `'tester'`.

### Enforcement layers (defense in depth)

```
1. JwtAuthGuard   → is the caller authenticated?
2. OrgGuard       → does the caller belong to the target org? (derives membership+role)
3. RolesGuard / @Permissions('task:create') → does the role grant this permission?
4. Policy check   → resource-level rules (ownership, project membership)
5. Tool layer     → AI tools re-check requiredPermission (same rules, second gate)
```

**Crucially, RBAC lives in the Application/tool layer**, so the UI route *and* the AI tool are both gated. The AI can never exceed the acting user's permissions.

## Input validation & data safety

- **Zod at every boundary** (`ZodValidationPipe`) → no untyped input reaches services.
- **Output DTOs** strip sensitive fields (`passwordHash`, `refreshTokenHash` never serialized).
- **Mongo injection**: parameterized queries via Mongoose; no raw user-built query objects.
- **NoSQL operator injection**: sanitize/deny `$`-prefixed keys in request payloads.
- **Rich text (TipTap/comments)**: sanitize HTML/JSON on the server before storage & render.

## Transport & platform hardening

- HTTPS everywhere; HSTS.
- **Helmet** security headers; strict **CORS** allowlist (web origin only).
- **Rate limiting** (Redis token bucket): global + stricter on `/auth/*` and `/ai/*`.
- **Brute-force protection** on login (progressive delay / lockout).
- **CSRF**: refresh cookie is `SameSite=Strict`; state-changing routes use bearer tokens (not cookie-only auth) to avoid CSRF on the API.
- **File uploads**: presigned URLs, size/mime allowlist, virus/size checks, private buckets + signed downloads.

## Secrets & multi-tenancy

- Secrets via platform env managers (Railway/Vercel/Upstash) — never committed. `.env.example` documents keys.
- **Tenant isolation**: every query is org-scoped; a base repository filter injects `orgId` from the principal so a missing filter can't leak data. Vector/search indexes are org-filtered too.

## Auditing (security-relevant)

- Every mutation → `AuditLog` with `actorId`, `source ('ui'|'ai')`, before/after diff, `requestId`, IP/UA.
- Auth events (login, refresh reuse, password reset, role change) are audited.
- AI actions are additionally linked to their `AIExecution`.

## Interview questions this prepares you for

- Access vs. refresh tokens; how do you handle rotation and reuse detection?
- Why Argon2id over bcrypt? What params matter?
- How do you prevent the AI agent from escalating privileges?
- NoSQL injection in Mongo — how do you defend against it?
- Multi-tenant data isolation strategies and their failure modes.
