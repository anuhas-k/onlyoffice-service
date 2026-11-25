# docs/tasks — one file per task

Every task the factory runs has **one brief here**, filed by category:

```
docs/tasks/<category>/TASK-NNN-<slug>.md
```

| Category | What goes in it |
|---|---|
| `foundation` | shared skeleton every other task needs — app bootstrap, config, error handler, response helper, db client, auth middleware. Runs first. |
| `data` | schema + migrations (ordered — usually individual tasks) |
| `backend` | endpoints / services / jobs — batched by resource |
| `frontend` | screens / components — batched by feature area |
| `mobile` | iOS / Android screens |
| `contract` | smart-contract functions / modules |
| `infra` | CI, Docker, deploy config |
| `integration` | the ONE owner of shared registration points (route index, app wiring, nav) + the contract sweep |
| `review` | the final whole-run review before the PR |

Only create a category folder when it has a task — no empty folders.

## How it fits together

- **`STATUS.md`** is the index: status (`[TODO]/[IN PROGRESS]/[DONE]`), title,
  `**Depends on:**` edges and a `**Task:**` link to the file here. The scheduler
  (`bun scripts/parallel.ts`) reads it.
- **This folder** holds the detail: sources, units, owned files, the execution flow,
  the SE-side QA checklist. An agent executes exactly one file: `/factory exec TASK-NNN`.
- Neither repeats the other. Status is never written in a task file; detail is never
  written in STATUS.md.

Created by `/factory tasks` from `docs/SRS.md` + `docs/RTM.md` + the API doc.
Template: `~/.claude/skills/astra/templates/tasks/TASK.md`. Rules: `factory-mode.md` FCT-G/H.
