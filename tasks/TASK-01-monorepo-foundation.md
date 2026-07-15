# TASK-01 — Monorepo & tooling foundation

- **Layer:** Foundation
- **Depends on:** —
- **Parallel with:** —
- **Size:** S–M

## Specs to read first
- [01 Tech Stack → "Repository shape (monorepo)"](../specs/01-tech-stack.md)
- [12 Execution Plan](../specs/12-execution-plan.md)

## Scope — in
- Initialize a **pnpm workspace + Turborepo** monorepo:
  - `apps/api` (NestJS placeholder), `apps/web` (Vite React placeholder), `packages/shared`, `packages/config`.
- Root tooling: TypeScript (strict) base config, ESLint + Prettier presets in `packages/config`, shared `tsconfig` base.
- Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `format` wired through Turborepo pipelines.
- `.gitignore`, `.editorconfig`, `.nvmrc`/engines (Node 22), `README.md` stub, `.env.example` stub.
- `packages/shared` exports an initial `zod` + types entry point (empty barrel is fine).

## Scope — out
- No feature code, no Docker (TASK-02), no Nest cross-cutting (TASK-03), no UI shell (TASK-04).

## Deliverables
- Working monorepo where `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm build` succeed with empty apps.
- Turborepo `turbo.json` with cached tasks.

## Definition of Done
- [ ] `pnpm install` clean from root.
- [ ] `pnpm -w typecheck` and `pnpm -w lint` pass (zero warnings).
- [ ] `apps/api` and `apps/web` each build (placeholder).
- [ ] `packages/shared` importable from both apps.
- [ ] Base CI workflow (`.github/workflows/ci.yml`) runs install → typecheck → lint → build.

## History requirement
Create `../history/TASK-01.md` (copy `_TEMPLATE.md`): document chosen versions, folder layout, scripts, and anything the next agent needs (e.g. how to add a package). Add a row to `../history/CHANGELOG.md`.
