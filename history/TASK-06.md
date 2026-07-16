# TASK-06 — Auth frontend + organization bootstrap

- **Status:** ✅ done (typecheck + lint + tests + build green)
- **Date:** 2026-07-16
- **Agent / chat:** auth frontend chat
- **Branch / PR:** task/TASK-06-auth-frontend → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (08-frontend-architecture, 07-security-rbac, 04-api-design)

## What was implemented

The full auth UX + org context for `apps/web`, wired to the TASK-05 backend: session
stores, silent refresh, route guards, auth forms, org bootstrap/switcher, and an
RBAC-aware UI helper.

### Dependencies
- Added `react-hook-form`, `@hookform/resolvers` (Zod resolver), `@radix-ui/react-label`.

### State — `src/stores/`
- `auth-store.ts` — Zustand store: **in-memory** `accessToken` (never localStorage),
  `user`, and a `status` machine (`idle → loading → authenticated | unauthenticated`).
  Exposes `getAccessToken()` for non-React use (api-client wiring).
- `org-store.ts` — persists only the **selected** `activeOrgId` (`apos.org`). The org
  list itself is server state (TanStack Query).

### API + hooks
- `features/auth/api/auth-api.ts` — `register/login/logout/me/forgotPassword/resetPassword`
  via `apiClient`, plus **`refreshSession()`**: a raw `fetch` to `/auth/refresh`
  (bypasses the client interceptor to avoid recursion) that is **deduped** via a
  shared in-flight promise so concurrent 401s trigger one network refresh.
- `features/auth/hooks/use-auth.ts` — `useLogin/useRegister/useForgotPassword/`
  `useResetPassword/useLogout` mutations; login/register adopt the session into the store.
- `features/organizations/api/orgs-api.ts` + `hooks/use-orgs.ts` — `useOrgs`,
  `useActiveOrg` (resolves selection → first org, returns caller `role`),
  `useCreateOrg`, `useOrgMembers`, `useInviteMember`.

### Auth wiring & bootstrap — `src/app/`, `src/features/auth/configure-auth.ts`
- `configure-auth.ts` (side-effect) calls `configureApiAuth({ getToken, onRefresh })`:
  `getToken` returns the in-memory access token; `onRefresh` runs `refreshSession()`,
  adopts the new session or clears it. This arms the client's **401 → refresh → retry**.
- `app/auth-bootstrap.tsx` — on load, sets `loading`, runs a **silent refresh** (using
  the httpOnly cookie) to re-hydrate the access token + user, then renders. Shows a
  splash until resolved so guards never flash the wrong screen. Wraps `<RouterProvider>`.

### Route guards & structure — `src/app/guards/`, `src/app/router.tsx`
- `RequireAuth` — no session → `/login` (remembers `from` for post-login return).
- `RequireOrg` — no orgs → `/onboarding`; keeps persisted `activeOrgId` in sync with
  the resolved active org.
- `RedirectIfAuthed` — signed-in users are bounced off auth screens.
- Router: `RequireAuth → { onboarding, RequireOrg → AppShell → {dashboard,projects,`
  `tasks,settings} }`, `RedirectIfAuthed → AuthLayout → {login,register,forgot,reset}`,
  and a standalone `auth/callback` (Google return). All pages remain lazy chunks.

### Auth screens — `src/features/auth/routes/`
- `login-page` (RHF + `loginSchema`, Google button, links), `register-page`
  (`registerSchema`), `forgot-password-page` (success = "check your email", no
  account enumeration), `reset-password-page` (reads `?token`, confirm-match
  validation using shared `passwordSchema`), `auth-callback-page` (reacts to the
  bootstrapped session and routes on).
- `components/google-button.tsx` — full-page redirect to `/api/v1/auth/google`.

### Org bootstrap & shell — `src/features/organizations/`, `src/app/layouts/app-shell.tsx`
- `routes/onboarding-page.tsx` — create-org form (`createOrgSchema`) + "continue to an
  existing workspace" list; sets active org and enters the app.
- `components/org-switcher.tsx` — sidebar dropdown to switch active org / create new.
- App shell now shows the **real** user (name/email/initials), an org switcher, and a
  working **Sign out** (revoke + clear stores + query cache + redirect).

### RBAC-aware UI — `src/hooks/use-can.ts`
- `useActiveRole()` + `useCan(permission)` built on the shared `can()` matrix
  (`ROLE_PERMISSIONS`). Defaults to **false** until the role resolves so controls
  hide/disable rather than flicker.
- Sample gate: the **invite member** form in Settings
  (`features/organizations/components/members-section.tsx`) is only shown when
  `useCan('manage:users')` is true; otherwise a permission note is displayed.

## Key decisions & deviations
- **Access token in memory, refresh in httpOnly cookie.** No token in localStorage
  (XSS surface). A silent refresh on boot re-hydrates the session; the cookie is
  scoped to `/api/v1/auth` and sent via `credentials: 'include'` (same-origin through
  the Vite proxy in dev).
- **Refresh dedupe + interceptor safety.** `refreshSession()` uses a plain `fetch`
  (not `apiClient`) so the 401→refresh path can't recurse, and a shared in-flight
  promise collapses concurrent refreshes into one — important because the backend
  **rotates** refresh tokens and would otherwise flag a reused (rotated) token.
- **`useActiveOrg` derives role from the org list** (`OrganizationDTO.role`), so
  `useCan` needs no extra endpoint. Server still enforces every permission.
- **RequireOrg only sends to onboarding when it positively knows there are 0 orgs**
  (not on load/error) to avoid redirect loops.
- **Reset-password page uses RHF `validate` (not `zodResolver`)** to avoid adding a
  direct `zod` dep to web; it reuses the shared `passwordSchema` for the rule + a
  confirm-match check.
- **Role select uses a native `<select>`** (no Radix Select dep yet) — accessible and
  minimal for the invite form.

## How to run / verify locally
```
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @ai-projectos/api dev     # :3001
pnpm --filter @ai-projectos/web dev     # http://localhost:5173

# quality gates
pnpm --filter @ai-projectos/web typecheck   # green
pnpm --filter @ai-projectos/web lint        # 0 errors (2 pre-existing DS warnings)
pnpm --filter @ai-projectos/web test        # 17 passing
pnpm --filter @ai-projectos/web build       # per-route chunks
```

Manual flow: register → land on onboarding → create org → app shell (real user +
org switcher) → Settings shows members + invite (admin) → sign out → login →
forgot-password → reset-password (`/reset-password?token=…`).

## Tests added
- `stores/auth-store.test.ts` (2) — session adopt + clear + `getAccessToken`.
- `features/auth/api/auth-api.test.ts` (3) — refresh **dedupe** (1 call for 3
  concurrent), 401 → null, network error → null.
- `hooks/use-can.test.tsx` (3) — admin allowed, viewer denied, no-role denied.
- `features/auth/routes/login-page.test.tsx` (2) — validation blocks empty submit;
  valid submit calls the login mutation.
- Repo web suite: **17 tests** passing.

## Definition of Done checklist
- [x] Register/login/logout, forgot+reset, and Google login all work against the API
      (Google via redirect + callback; button + strategy wired).
- [x] Expired access token transparently refreshes (client interceptor + `onRefresh`);
      reuse/hard-fail clears the session and guards redirect to login.
- [x] New user is guided to create/select an org; active org persists (`apos.org`).
- [x] `useCan()` correctly gates a sample action (invite form in Settings).
- [x] Loading/empty/error states + inline validation present.
- [x] Component tests (forms, refresh logic, guard/RBAC) pass.

## Known gaps / follow-ups
- **Backend Google env not set** in local `.env` (client id/secret blank) — the button
  redirects but the guard 400s until creds are configured; the callback path is ready.
- Invite creates an `invited` membership; the **invite email + accept** flow is a
  follow-up (backend also stubs mail to console).
- No member **role change / remove** UI yet (backend endpoints exist) — minimal by design.
- `useActiveOrg` falls back to the first org on an invalid selection but there's no
  cross-tab sync of `activeOrgId` beyond localStorage.
- Main vendor chunk still ~777 kB — vendor `manualChunks` split deferred (TASK-13/15).

## Notes for the next agent
- **Read the session** with `useAuthStore` (`user`, `status`, `accessToken`) and the
  **active org** with `useActiveOrg()` (gives `activeOrg` incl. the caller `role`).
- **Gate UI** with `useCan('<permission>')` — never hard-code role checks; add new
  permissions in `packages/shared` (`PERMISSIONS`/`ROLE_PERMISSIONS`) so API + UI stay
  in sync. The server is still the source of truth.
- **Authenticated requests just work**: call `apiClient` — it injects the bearer token
  and handles 401 → refresh → retry. For org-scoped endpoints, pass the active org id
  from `useActiveOrg()`.
- **New protected pages**: add a lazy route under the `RequireAuth → RequireOrg →
  AppShell` branch in `src/app/router.tsx` and a nav item in `app-shell.tsx`.
- **Forms**: React Hook Form + `zodResolver` with schemas from `@ai-projectos/shared`;
  surface `formState.errors.<field>.message` inline; mutations already toast on error.
