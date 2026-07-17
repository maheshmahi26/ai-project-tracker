# End-to-end tests (Playwright)

High-value user journeys run against a **real full stack** (web + API + MongoDB + Redis).
They are intentionally kept off the per-PR critical path — see `.github/workflows/e2e.yml`
(nightly, `workflow_dispatch`, and PRs labelled `e2e`).

## Journeys covered

| Spec                  | Journey                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `auth.spec.ts`        | register → onboarding → app → logout → login; invalid credentials       |
| `admin-users.spec.ts` | admin provisions a user → forced first-login password change; block prevents login |
| `rbac.spec.ts`        | a developer cannot manage members (UI is gated, not just the API)       |
| `projects.spec.ts`    | create a project and see it in the list                                 |
| `dashboard.spec.ts`   | dashboard shell renders for a new workspace                             |

## Prerequisites

- MongoDB running as a **single-node replica set** (transactions), Redis running.
  Locally: `docker compose -f docker/docker-compose.yml up -d mongo redis`.
- Root `.env` populated (see `.env.example`). `PORT` must match the API port.
- Browsers installed once: `pnpm --filter @ai-projectos/web exec playwright install chromium`.

## Running

```bash
# One command — Playwright boots the API + web dev servers itself.
pnpm --filter @ai-projectos/web test:e2e

# Interactive UI mode
pnpm --filter @ai-projectos/web test:e2e:ui
```

If you already have `pnpm dev` running, Playwright reuses those servers (outside CI).

## Notes

- Tests are self-seeding: each spec registers its own account/org so runs are isolated
  and order-independent.
- Selectors prefer roles/labels/accessible names over CSS. If the UI copy changes,
  update the helpers in `helpers.ts` rather than individual specs.
- The task-board journey (create → move on board → comment → soft-delete → undo) is
  tracked for a follow-up once stable `data-testid`s are added to the board DnD widgets.
