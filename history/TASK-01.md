# TASK-01 — Monorepo & tooling foundation

- **Status:** ✅ done (code scaffolded; `pnpm install` + build pending on a machine with npm-registry access — see gaps)
- **Date:** 2026-07-15
- **Agent / chat:** initial setup chat
- **Branch / PR:** task/TASK-01-monorepo-foundation → (push via `refs/for/<branch>`)
- **Spec version built against:** specs/ as of 2026-07-15 (post local-Mongo/Qdrant update)

## What was implemented
- **pnpm workspace + Turborepo** monorepo:
  - `pnpm-workspace.yaml` (globs `apps/*`, `packages/*`), root `package.json` (private, scripts, `packageManager: pnpm@9.15.0`, engines node>=20).
  - `turbo.json` pipelines: `build` (`^build`, outputs `dist/**`), `typecheck` (`^build`), `lint`, `test` (`^build`), `dev` (persistent), `clean`.
- **Root tooling:** `tsconfig.base.json` (strict, ES2022, NodeNext), `.prettierrc.json` + `.prettierignore`, `.editorconfig`, `.gitignore`, `.nvmrc` (20), root flat `eslint.config.mjs` re-exporting the shared preset.
- **`packages/config`** — shared ESLint flat config (`@eslint/js` + `typescript-eslint` + `eslint-config-prettier`), exported as `@ai-projectos/config/eslint`.
- **`packages/shared`** — `@ai-projectos/shared` with initial Zod contracts/types: `ROLES`/`roleSchema`, `ApiSuccess`/`ApiError`/`ApiMeta` envelopes, `paginationQuerySchema`, `healthStatusSchema`, `APP_NAME`. Builds to `dist` via `tsc`.
- **`apps/api`** — NestJS 11 placeholder (see TASK-02 for env config). `AppController` exposes `GET /api/v1/ping` and `GET /api/v1/health`; imports `APP_NAME`/`HealthStatus` from shared to prove cross-package types.
- **`apps/web`** — React 19 + Vite 6 placeholder; `App.tsx` fetches `/api/v1/ping` (via Vite proxy to :3000) and imports `APP_NAME` from shared.
- **CI:** `.github/workflows/ci.yml` — pnpm/action-setup + node 20 → install → typecheck → lint → format:check → build → test.
- Root `README.md` with quickstart.

## Key decisions & deviations
- **Node 20, not 22.** The local runtime is Node v20.19.5 and 22 wasn't installable here; React 19 / NestJS 11 fully support Node 20. `.nvmrc`=20, engines `node>=20`. Specs mention Node 22 as the original target — Node 20 is the pragmatic baseline; bump later if desired.
- **Dependency versions are caret ranges** for known-good majors (Nest 11, React 19, Vite 6, TS 5.7, zod 3.24, turbo 2.3, typescript-eslint 8). I could **not** run `pnpm install` to pin a lockfile because this environment cannot reach `registry.npmjs.org` (see gaps). First install on a networked machine will generate `pnpm-lock.yaml`.
- **`packages/shared` builds to `dist`** and is consumed via its `exports` (types+default). Turbo `typecheck`/`build` depend on `^build` so shared is built before consumers.
- ESLint uses **flat config**; each workspace has a tiny `eslint.config.mjs` re-exporting the shared preset (api disables `no-extraneous-class` for Nest modules; web adds react-hooks/react-refresh).

## How to run / verify locally
```bash
# prerequisites: Node 20+, pnpm 9+ (corepack enable && corepack prepare pnpm@9 --activate)
pnpm install
pnpm typecheck    # expect clean
pnpm lint         # expect zero warnings/errors
pnpm build        # shared → api (nest build) → web (vite build)
```
Verified in this environment (no npm registry access):
- ✅ All `package.json` / `tsconfig` / `turbo.json` / `nest-cli.json` parse as valid JSON.
- ✅ `docker compose config` valid (see TASK-02).
- ⛔ `pnpm install` / `typecheck` / `build` NOT run here (registry unreachable).

## Tests added
- None yet (test scripts are no-op placeholders in api/web). Real tests arrive with feature tasks; suites/coverage gates in TASK-14.

## Definition of Done checklist
- [ ] `pnpm install` clean from root — **pending on networked machine**
- [ ] `pnpm -w typecheck` and `pnpm -w lint` pass — **pending install**
- [ ] `apps/api` and `apps/web` each build (placeholder) — **pending install**
- [x] `packages/shared` importable from both apps (wired via `workspace:*` + exports)
- [x] Base CI workflow runs install → typecheck → lint → build

## Known gaps / follow-ups
- **Run `pnpm install` on a machine with npm access** to generate `pnpm-lock.yaml`, then confirm typecheck/lint/build all pass. If any pinned major needs adjusting, update and note it.
- Prettier ignores `*.md` currently (docs hand-formatted); revisit if desired.
- Full Nest cross-cutting (Swagger, filters, interceptors, readiness checks) is intentionally deferred to **TASK-03**.

## Notes for the next agent
- Shared contracts go in `packages/shared/src/index.ts` — import via `@ai-projectos/shared`. Do **not** duplicate schemas in apps.
- To add a workspace dep: `pnpm --filter @ai-projectos/<pkg> add <dep>`.
- API global prefix is `/api/v1`; add feature modules under `apps/api/src/modules/*` (TASK-03 sets up the pattern).
