# TASK-04 — Frontend skeleton & design system

- **Layer:** Foundation
- **Depends on:** TASK-02
- **Parallel with:** TASK-03
- **Size:** M–L

## Specs to read first
- [08 Frontend Architecture](../specs/08-frontend-architecture.md)
- [04 API Design](../specs/04-api-design.md) (envelopes for the api client)

## Scope — in
- Vite + React 19 + TypeScript app in `apps/web`.
- TailwindCSS + shadcn/ui installed; design tokens; **dark mode** via CSS variables + Zustand-persisted theme.
- App shell layout: collapsible sidebar, top bar (search, notifications placeholder, theme toggle, profile), command palette (⌘K) shell.
- Router (React Router) with **lazy routes**, nested layouts (`AuthLayout`, `AppShell`), route-level **error boundaries** + **Suspense** skeletons.
- Providers: TanStack Query, Theme, Toaster; Zustand stores skeleton (`theme`, `ui`).
- `lib/api-client.ts`: fetch wrapper handling auth header, envelope unwrap, error mapping (refresh hook stubbed for TASK-06), and `query-keys.ts`.
- Shared UI: skeletons, empty-state, error-boundary, data-table shell, chart wrapper (lazy).
- Import shared types/Zod from `packages/shared`.

## Scope — out
- No auth flow logic (TASK-06). No feature pages beyond placeholders. No real data.

## Deliverables
- Running SPA with app shell, theme toggle, lazy routing, and a demo page hitting `GET /api/v1/ping` through `apiClient`.

## Definition of Done
- [ ] `pnpm dev` serves the app; shell renders responsive + accessible (keyboard nav, focus rings).
- [ ] Dark/light toggle persists across reload.
- [ ] Lazy route + Suspense skeleton + error boundary demonstrated.
- [ ] `apiClient` unwraps success/error envelope; error toast on failure.
- [ ] Component tests for theme toggle + api-client error mapping pass.

## History requirement
Create `../history/TASK-04.md`: document folder conventions, how to add a feature, design tokens, and api-client contract. Add CHANGELOG row.
