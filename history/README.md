# History — build log & durable memory

This folder is the **persistent memory** of the build. Because each task may be done by a **different Cursor agent** in a fresh session, every completed task must leave a record here so the next agent has full context.

## Files
- **`_TEMPLATE.md`** — copy this to `TASK-XX.md` when you finish a task.
- **`TASK-XX.md`** — one entry per completed task, written by the agent that did it.
- **`CHANGELOG.md`** — running, newest-first index of everything done.

## Rules for every agent
1. A task is **not done** until:
   - `history/TASK-XX.md` exists (copied from the template, fully filled in), **and**
   - `history/CHANGELOG.md` has a new **top** row for it.
2. Be specific and honest: record real file paths, decisions, deviations, and gaps.
3. Write for the **next agent**: what they need to know to build on your work.
4. If you changed a spec, say so and link it.
5. Never delete or rewrite a previous task's history; append corrections in your own entry.

## How to start a task
Read [`../specs/12-execution-plan.md`](../specs/12-execution-plan.md), open the matching `../tasks/TASK-XX-*.md`, complete it per its Definition of Done, then write your history entry.
