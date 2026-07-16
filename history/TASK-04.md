# TASK-04 — Frontend skeleton & design system

- **Status:** ✅ done
- **Date:** 2026-07-16
- **Agent / chat:** frontend skeleton chat
- **Branch / PR:** task/TASK-04-frontend-skeleton → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (08-frontend-architecture, 04-api-design)

## What was implemented

A production-shaped React 19 + Vite SPA in `apps/web`: design system, app shell,
lazy routing, providers, typed API client, and tests.

### Tooling / config
- `package.json` — React Router v7, TanStack Query v5, Zustand v5, Tailwind v4
  (`@tailwindcss/vite`), Radix primitives, `cmdk`, `sonner`, `lucide-react`, `cva`,
  `clsx`, `tailwind-merge`; dev: Vitest + Testing Library + jsdom.
- `vite.config.ts` — React + Tailwind v4 plugins, `@` → `src` alias, API proxy
  (root `.env` PORT), and the Vitest config (jsdom, globals, setup file).
- `tsconfig.json` — `@/*` path alias + test/global types.
- `src/test/setup.ts` — jest-dom matchers + `matchMedia` stub.
- `index.html` — inline no-flash theme script (reads `apos.theme` before paint).

### Design system — `src/index.css` + `src/components/ui/`
- Tailwind v4 CSS-first theme: OKLCH tokens (neutral base, **indigo** accent),
  `.dark` overrides, `@theme inline` → color/radius utilities, sidebar tokens.
- shadcn-style primitives (owned, hand-authored): `button`, `input`, `skeleton`,
  `card`, `badge`, `avatar`, `dialog`, `dropdown-menu`, `tooltip`, `command`
  (cmdk), `sonner` (toaster wired to theme). `lib/utils.ts` exports `cn()`.

### App shell & routing — `src/app/`
- `providers.tsx` — QueryClient (staleTime, no-retry-on-4xx, toast on query/mutation
  error), ThemeProvider, TooltipProvider, Toaster.
- `theme-provider.tsx` — applies `.dark` from the store + follows OS in `system` mode.
- `layouts/app-shell.tsx` — collapsible sidebar (tooltips when collapsed), top bar
  (⌘K search trigger, notifications placeholder, theme toggle, profile menu),
  `<Suspense fallback={PageSkeleton}>` around `<Outlet/>`, mounts the command palette.
- `layouts/auth-layout.tsx` — centered layout for auth screens.
- `router.tsx` — `createBrowserRouter` with **lazy** page chunks, nested layouts,
  and `RouteErrorBoundary` as `errorElement`.

### Shared components — `src/components/`
- `error-boundary/` — class `ErrorBoundary` (widget-level) + `RouteErrorBoundary`.
- `empty-states/empty-state.tsx`, `skeletons/page-skeleton.tsx`,
  `data-table/data-table.tsx` (generic table shell), `charts/chart-frame.tsx`
  (lazy chart wrapper w/ suspense + error boundary), `command-palette.tsx`,
  `theme-toggle.tsx`.

### State & data — `src/stores/`, `src/lib/`
- `stores/theme-store.ts` (persisted `apos.theme`) + `stores/ui-store.ts`
  (persisted sidebar; ephemeral command palette).
- `lib/api-client.ts` — fetch wrapper: base `/api/v1`, bearer header, **envelope
  unwrap**, `ApiClientError` mapping (code/message/details/requestId/status +
  `isAuthError`), 204 handling, `getWithMeta` for pagination, and a **refresh-on-401
  + single-retry hook** (`configureApiAuth`, real flow in TASK-06).
- `lib/query-keys.ts` — centralized keys.

### Feature placeholders — `src/features/`
- `dashboard` (live demo hitting `GET /api/v1/ping` via `apiClient` + `useQuery`,
  stat cards, chart frame, widget error-boundary demo), `projects`, `tasks`
  (uses DataTable), `settings` (theme picker), `auth/login`, `misc/not-found`.

## Key decisions & deviations
- **Tailwind v4** (CSS-first, `@tailwindcss/vite`) instead of v3 + PostCSS — current
  standard, no `tailwind.config.js`. Dark mode via `@custom-variant dark`.
- **Hand-authored shadcn/ui** components rather than the `shadcn` CLI (CLI needs
  interactive/network access unavailable to the agent). Same source, we own it.
- **React Router v7** data router (`createBrowserRouter`) with `React.lazy` route
  elements behind the layout Suspense boundary.
- **Theme owned by Zustand** (persisted) + inline no-flash script, rather than
  `next-themes` (that's a Next.js lib).
- Global query/mutation errors surface as **sonner** toasts; queries don't retry 4xx.
- Indigo accent chosen as the product color (adjustable via `--primary` tokens).

## How to run / verify locally
```
pnpm install          # your terminal has the corporate CA; agent used --strict-ssl=false
pnpm --filter @ai-projectos/api dev    # backend on :3001 (for the ping card)
pnpm --filter @ai-projectos/web dev    # SPA on http://localhost:5173

# quality gates
pnpm --filter @ai-projectos/web typecheck
pnpm --filter @ai-projectos/web lint
pnpm --filter @ai-projectos/web test    # 7 passing
pnpm --filter @ai-projectos/web build
```

## Verified (2026-07-16)
- `typecheck` + `lint` (0 errors) + `build` (per-route code-split chunks) green.
- Dev server serves the SPA (200, title, no-flash theme script, `#root`, HMR entry).
- **15 tests** pass repo-wide (8 api + 7 web).
- api-client test proves envelope unwrap + error mapping (code/message/details,
  `isAuthError`, 204→undefined, non-envelope fallback).
- theme-toggle test proves the persisted theme flips + accessible name updates.

## Tests added
- `src/lib/api-client.test.ts` (5) — success unwrap, error-envelope mapping,
  generic fallback, auth-error flag, 204.
- `src/components/theme-toggle.test.tsx` (2) — accessible toggle + persisted flip.

## Definition of Done checklist
- [x] `pnpm dev` serves the app; shell renders responsive + accessible (keyboard nav, focus rings).
- [x] Dark/light toggle persists across reload (Zustand `persist` + no-flash script).
- [x] Lazy route + Suspense skeleton + error boundary demonstrated.
- [x] `apiClient` unwraps success/error envelope; error toast on failure.
- [x] Component tests for theme toggle + api-client error mapping pass.

## Known gaps / follow-ups
- Main vendor chunk is ~745 kB (React Router + Query + Radix + cmdk). Add
  `build.rollupOptions.output.manualChunks` vendor splitting in TASK-13/15.
- No real auth/session yet — `configureApiAuth` + refresh handler are stubs (TASK-06).
- Sidebar has no mobile drawer (hidden < md) — add a Sheet in a later UI pass.
- Feature pages are placeholders; real data/CRUD arrives in TASK-08/11/13.
- `ErrorBoundary.componentDidCatch` logs to console; Sentry forwarding in TASK-15.

## Notes for the next agent
- **Add a feature:** create `src/features/<name>/{routes,components,hooks,api}/`;
  put a default-exported page in `routes/`, add a `lazy(() => import(...))` route in
  `src/app/router.tsx`, and a nav item in `app/layouts/app-shell.tsx` (`NAV_ITEMS`).
- **Data:** call the backend via `apiClient` (it unwraps the envelope); wrap reads in
  `useQuery` with keys from `lib/query-keys.ts`; mutations should `invalidateQueries`.
- **Forms:** React Hook Form + Zod schemas from `packages/shared` (added with features).
- **UI:** import primitives from `@/components/ui/*`; use `cn()` for class merging;
  use design tokens (`bg-background`, `text-primary`, …) — never hard-coded colors.
- **Auth wiring (TASK-06):** call `configureApiAuth({ getToken, onRefresh })` in
  providers once the token store exists; the 401→refresh→retry path is already in the client.
