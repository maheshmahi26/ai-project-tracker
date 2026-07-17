# TASK-17 — AI action/CRUD tools (UI ↔ AI parity)

- **Layer:** AI (build last)
- **Depends on:** TASK-16
- **Parallel with:** TASK-18
- **Size:** L

## Specs to read first
- [05 AI Agent → Tool catalogue](../specs/05-ai-agent.md)
- The service layers built in TASK-07, TASK-09, TASK-10.

## Scope — in
- Implement action tools, each a **thin wrapper over the existing service** (never new DB logic):
  - `createTask, updateTask, deleteTask, bulkUpdateTasks, bulkDeleteTasks, assignTask, moveTask, searchTasks`
  - `createProject, updateProject, archiveProject, deleteProject`
  - `createSprint, addTasksToSprint, completeSprint`
  - `addComment, createLabel`
- Each tool: Zod input/output schema (shared), `requiredPermission`, error handling, audited as `source:'ai'`.
- **Resolver helpers**: map natural-language references (assignee name → userId, project key/name → id) within the org, with disambiguation errors the agent can act on.
- **Confirmation gating** for destructive tools (`deleteProject`, `bulkDeleteTasks`): tool signals "needs confirmation"; agent must confirm before commit (soft-delete + undo still applies).

## Scope — out
- Generative tools (TASK-18). Chat UI (TASK-19).
- **User/member management tools** (`createUser`, `blockUser`/`unblockUser`, `changeMemberRole`) are intentionally **not** in the catalogue by default. The admin user-management feature is UI-only. Add these later only if AI↔UI parity for administration is desired — if so, wrap the existing `OrganizationsService` methods, gate with `requiredPermission: 'manage:users'`, audit `source:'ai'`, and require confirmation for `blockUser`.

## Deliverables
- Full parity: everything the human UI can mutate is callable by the agent through audited tools.

## Definition of Done
- [ ] "Create a high-priority backend auth task assigned to Mahesh in AUTH" creates the same task the UI would, audited `source:'ai'`.
- [ ] Viewer's agent is blocked by `requiredPermission` (no escalation).
- [ ] Destructive tools require confirmation.
- [ ] Name/key resolvers work + disambiguate; tests (per tool: validation, permission, parity vs. service) pass.

## History requirement
Create `../history/TASK-17.md`: list every tool with its schema + permission, document resolver behavior and confirmation flow. Add CHANGELOG row.
