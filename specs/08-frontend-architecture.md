# 08 — Frontend Architecture

## Goals

Modern SaaS UI that is responsive, accessible (WCAG AA), fast, and feels like Linear/Notion-grade product — not a demo. Feature-based, reusable, lazy-loaded, with optimistic updates.

## Folder structure (feature-based)

```
apps/web/src/
├── main.tsx · App.tsx
├── app/
│   ├── router.tsx              # lazy routes, layouts, error boundaries
│   ├── providers.tsx           # Query, Theme, Auth, Toaster
│   └── layouts/                # AppShell (sidebar+topbar), AuthLayout
├── components/ui/              # shadcn/ui primitives (owned)
├── components/                 # shared composite components
│   ├── data-table/ · charts/ · skeletons/ · empty-states/
│   └── error-boundary/
├── lib/
│   ├── api-client.ts           # fetch wrapper: auth, refresh, error envelope
│   ├── query-keys.ts           # centralized TanStack Query keys
│   └── utils.ts
├── stores/                     # Zustand: theme, ui, chat drawer, selections
├── hooks/                      # shared hooks (useDebounce, useInfiniteList…)
├── features/                   # ← the bulk of the app
│   ├── auth/
│   ├── organizations/
│   ├── projects/
│   ├── sprints/
│   ├── tasks/                  # board, table, detail, filters
│   ├── comments/ · files/ · labels/
│   ├── notifications/
│   ├── dashboard/              # charts + reports
│   ├── activity/
│   ├── documents/              # RAG uploads
│   └── ai-chat/                # ChatGPT-like interface
└── types/                      # types imported from packages/shared
```

Each feature folder contains its own `components/`, `hooks/` (Query hooks), `api/` (typed calls), and `routes`. Nothing reaches into another feature's internals except through shared `components/`, `lib/`, and `packages/shared`.

## State strategy

| Kind of state | Tool | Example |
|---------------|------|---------|
| **Server state** | TanStack Query | tasks, projects, dashboard data (cache, refetch, optimistic) |
| **Client/UI state** | Zustand | theme, sidebar, selected task ids, chat panel open |
| **Form state** | React Hook Form + Zod | create/edit dialogs |
| **URL state** | React Router search params | filters, sort, pagination, active tab |

Rationale: keep server data in Query (single cache, dedупe, invalidation) and only genuinely-client state in Zustand — avoids the classic "everything in Redux" anti-pattern.

## Data fetching & mutations

- Typed `apiClient` handles auth header, transparent **refresh-on-401 + retry**, and unwraps the standard success/error envelope.
- **Query keys** centralized in `query-keys.ts` for predictable invalidation.
- **Optimistic updates** for high-frequency actions (drag task across board, toggle status, mark notification read): update cache immediately, roll back on error, reconcile on settle.
- **Infinite scroll** via `useInfiniteQuery` + cursor pagination for task lists/activity feeds.

## Performance

- **Route-level code splitting** (`React.lazy` + `Suspense`) — auth, dashboard, chat, editor load on demand.
- **Lazy-load heavy libs**: TipTap editor and Recharts only in their routes; Framer Motion sparingly.
- **Skeleton loaders** per view (not spinners) for perceived speed.
- **Virtualized** long lists/tables where needed.
- **Memoization** for expensive chart transforms; suspense boundaries to stream UI.

## Resilience & UX

- **Error boundaries** at app + route + widget level (a broken chart doesn't kill the page).
- **Empty states** with clear CTAs for every list.
- **Toasts** for success/error; inline field errors from Zod.
- **Undo delete** surfaced as a toast action ("Task deleted — Undo").
- **Dark mode** via CSS variables + Tailwind + Zustand-persisted theme (respects `prefers-color-scheme`).
- **Accessibility**: shadcn/Radix primitives (focus traps, ARIA, keyboard nav), visible focus rings, color-contrast-checked tokens.

## Key screens

- **App shell**: collapsible sidebar (orgs/projects), top bar (search, notifications, theme, profile), command palette (⌘K), and a **floating AI assistant** (bottom-right circular button → compact chat window with session switcher + "expand to full chat").
- **Board**: drag-and-drop Kanban with optimistic reordering. Cards show a **type icon** (story/task/bug), priority, a **due-date badge** ("Nd left" / "Overdue Nd"), and a **parent chip** for subtasks. Subtasks appear on the board tagged with their parent key.
- **Task table**: filter/sort/search/paginate, bulk-select → bulk actions; rows show the type icon and a parent hint for subtasks.
- **Task detail**: rich description (TipTap), comments (inline `@`-mention autocomplete), subtasks (hidden for subtasks themselves), files, activity, plus a "Subtask of PARENT-KEY" link and editable type.
- **Dashboard**: velocity, burndown, completed vs pending, per-user, priority distribution, project progress, and **team-by-role** counts (Recharts) + recent activity.
- **Documents**: upload (drag-drop), indexing status, semantic search.
- **AI Chat** (below).

## AI Chat interface (ChatGPT-like)

```
┌──────────────────────────────────────────────┐
│  Session list │  Conversation                  │
│  (history)    │  ─────────────────────────────  │
│               │  [user bubble]                  │
│  + New chat   │  [assistant bubble - streaming] │
│               │    ┌── tool call card ────────┐ │
│               │    │ createTask  ▸ args JSON   │ │
│               │    │ ✔ result: AUTH-124        │ │
│               │    └───────────────────────────┘ │
│               │  ─────────────────────────────  │
│               │  Suggested prompts (chips)      │
│               │  [ message input ▸ send ]       │
└──────────────────────────────────────────────┘
```

Features:
- **Streaming** via SSE (token-by-token) → smooth typing effect.
- **Markdown** rendering + **syntax-highlighted code** blocks.
- **Tool execution visualization**: each tool call is a card showing name → arguments → status → result/error (the transparency feature from [AI spec](./05-ai-agent.md)).
- **Chat history** (sessions) + **conversation memory** (agent recalls prior turns).
- **Resume last session**: opening the Assistant tab (or the floating widget) with no explicit session resumes the most recent conversation instead of a blank chat; an explicit "New chat" action is always available.
- **Floating widget**: the same agent is reachable from anywhere via a bottom-right button — a compact chat window with a session picker and an "expand" control that navigates to the full `/chat` page.
- **Suggested prompts** contextual to the current project/screen.
- **Confirm dialogs** in-chat for destructive proposals.
- Deep links: results (e.g. "AUTH-124") are clickable to the entity.

## Shared contracts

Zod schemas and DTO types live in `packages/shared` and are imported by the frontend, so form validation, API types, and AI tool inputs all agree — no drift between client and server.

## Interview questions this prepares you for

- When do you use server-state (Query) vs. client-state (Zustand)?
- How do optimistic updates work and how do you roll back safely?
- Code splitting & lazy loading strategy for a large SPA?
- How do you stream and render LLM responses with tool visualizations?
- Accessibility: how do Radix/shadcn primitives help you meet WCAG?
