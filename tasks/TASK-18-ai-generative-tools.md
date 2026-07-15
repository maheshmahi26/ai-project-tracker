# TASK-18 — AI generative tools (structured, propose→confirm)

- **Layer:** AI (build last)
- **Depends on:** TASK-16
- **Parallel with:** TASK-17
- **Size:** L

## Specs to read first
- [05 AI Agent → generative tools](../specs/05-ai-agent.md)
- [04 API Design → Dashboard/Reports](../specs/04-api-design.md) (data sources for analytics)

## Scope — in
- Generative tools returning **structured JSON** (validated by `outputSchema`), operating **propose→confirm** where they mutate:
  - `generateSprint, generateStandup, summarizeSprint, summarizeProject, generateProjectReport, generateWeeklyReport, generateUserStories, generateAcceptanceCriteria, generateSubtasks, generateRoadmap, generateReleaseNotes, generateMeetingSummary`
  - `analytics` (structured dashboard query over TASK-12 aggregates).
- Proposals render as structured objects the UI/chat can display and the user can accept; on accept, commit via TASK-17 action tools (e.g. proposed sprint → `createSprint` + `addTasksToSprint`).
- Prompt templates + output schemas kept in `packages/shared`.

## Scope — out
- RAG-grounded generation (TASK-21). Chat UI rendering (TASK-19).

## Deliverables
- The generative/agentic feature set, safely gated behind confirmation.

## Definition of Done
- [ ] Each generative tool returns schema-valid JSON (asserted; never asserted on free prose).
- [ ] `generateSprint` proposal, once confirmed, creates real sprint+tasks via action tools, audited.
- [ ] `analytics` answers a structured question from real aggregates.
- [ ] Tests with mocked Gemini returning canned structured output pass.

## History requirement
Create `../history/TASK-18.md`: document each generative tool's output schema, prompt template location, and the propose→confirm→commit flow. Add CHANGELOG row.
