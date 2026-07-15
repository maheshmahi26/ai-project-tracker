# TASK-06 — Auth frontend + organization bootstrap

- **Layer:** Human
- **Depends on:** TASK-04, TASK-05
- **Parallel with:** —
- **Size:** M

## Specs to read first
- [08 Frontend Architecture](../specs/08-frontend-architecture.md)
- [07 Security & RBAC](../specs/07-security-rbac.md)
- [04 API Design → Auth](../specs/04-api-design.md)

## Scope — in
- `features/auth`: register, login, forgot-password, reset-password forms (React Hook Form + Zod), Google login button.
- Auth store (Zustand) + wiring `apiClient` **refresh-on-401 + retry**; protected route guard; redirect flows.
- Session bootstrap on load (`GET /auth/me`); logout.
- `features/organizations`: create-org / select-org flow so a logged-in user lands in the app shell with an active org context; org switcher in the shell.
- RBAC-aware UI helpers (`useCan(permission)`) to hide/disable controls.

## Scope — out
- No project/task UI (TASK-08+). Member management UI can be minimal (invite form only).

## Deliverables
- End-to-end auth UX + org context available app-wide.

## Definition of Done
- [ ] Register/login/logout, forgot+reset, and Google login all work against the API.
- [ ] Expired access token transparently refreshes; reuse/hard-fail redirects to login.
- [ ] New user is guided to create/select an org; active org persists.
- [ ] `useCan()` correctly gates a sample action.
- [ ] Loading/empty/error states + inline validation present.
- [ ] Component tests (forms, refresh logic, guard) pass.

## History requirement
Create `../history/TASK-06.md`: document auth store shape, refresh flow, org-context pattern, and `useCan` usage. Add CHANGELOG row.
