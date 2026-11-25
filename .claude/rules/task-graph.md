---
paths:
  - "STATUS.md"
  - "docs/tasks/**"
  - ".astra/factory.json"
  - "SPEC.md"
---
# task-graph.md — tasks are a DAG; dispatch the ready frontier (TGR-A..E)
# Auto-installed for every project.
# Loaded whenever current_user_role ∈ {Conductor, TL, SE, SE-Backend, SE-Frontend,
#   SE-Contract, PM, SD, JD}.
#
# Source: docs/plans/ASTRA-MATTPOCOCK-GAP-ANALYSIS.md §3.7 (P1) — Matt Pocock's
# `to-tickets` (tracer-bullet tickets each declaring blocking edges) + `implement-spec`
# (work the graph on one branch, spawning implementers across the ready frontier).
# ASTRA already had the `**Depends on:**` field in STATUS.md and `bun ~/.claude/skills/astra/scripts/parallel.ts`,
# but the edges were prose the scheduler ignored (round-robin), and "parallel waves"
# were static barriers — no dynamic ready-frontier. This rule makes task→task
# blocking a real graph and the scheduler frontier-driven. It is the on-ramp to the
# factory axis (§4): "decompose task" is exactly emitting these edges.

---

## TGR-A — Every task declares its blocking edges (the graph is a DAG)

Every `TASK-NNN` block in `STATUS.md` carries an explicit `**Depends on:**` line —
a comma-separated list of the `TASK-NNN`s that must be `[DONE]` before it can start,
or `none`. **Silence is not `none`:** an absent edge is an *undeclared* dependency,
and the scheduler cannot see what you didn't write. The edges form a **directed
acyclic graph** — task→task, distinct from RTM.md's requirement→task trace (which is
orthogonal; keep both).

```markdown
### [TODO] TASK-002 — Users API batch 1 (10 endpoints)
**Task:** docs/tasks/backend/TASK-002-users-batch-1.md
**Depends on:** TASK-001
### [TODO] TASK-003 — Route registration + contract sweep
**Task:** docs/tasks/integration/TASK-003-wire-routes.md
**Depends on:** TASK-001, TASK-002
### [TODO] TASK-004 — CI pipeline
**Task:** docs/tasks/infra/TASK-004-ci.md
**Depends on:** none
**Priority:** P2     # optional: P0|P1|P2|P3, default P2
```

**Priority flows up the edges.** A task's *effective* priority is the min of its own and
that of every task that depends on it, transitively — if login is `P0` and depends on
register, register runs as `P0` too. The queue orders by effective priority, then depth
(roots first), then most downstream dependents, then id.

This is the same "tracked lifecycle with explicit edges" shape as `qa/bugs.json` —
a task has a status (`[TODO] | [IN PROGRESS] | [DONE] | [BLOCKED]`) and its blockers.

**STATUS.md is the index; the brief is the file.** A block here holds only status,
title, `**Task:**` (the brief's path) and `**Depends on:**`. Everything else — sources,
units, owned `## Files`, execution flow, SE-side QA — lives in the brief at
`docs/tasks/<category>/TASK-NNN-<slug>.md` (factory-mode.md FCT-G). Neither copies the
other, so they cannot drift.

**No ticket → no code (enforced).** In a factory-managed project (this rule
installed), `task-required-before-code.sh` HARD BLOCKS an Edit/Write of a real
source-code file until at least one real `TASK-NNN` ticket exists here (the
`/init` template's placeholder `TASK-001/002` examples don't count — a ticket
needs a filled title or description). The plan drives the work: you build a ticket
with `/factory tasks` (or `/init`), then write its code. Tests, docs, config and
scaffolding are never gated — write the failing test first (THG-A), then the ticket,
then the code. This is FCT-A made a gate at the point of the write, not just a
convention; it is scoped to factory projects so legacy repos are untouched.

## TGR-B — Dispatch the READY QUEUE, never round-robin

The **ready frontier** is every not-done task whose blockers are all `[DONE]`.
Parallel execution runs the frontier, not "all `[TODO]` tasks split N ways":

- `bun ~/.claude/skills/astra/scripts/parallel.ts queue` — running (n/cap), ready in priority order, held (overlap), waiting (on what).
- `bun ~/.claude/skills/astra/scripts/parallel.ts fill` — worktrees for the head of the **ready queue only**, up to the free
  slots (builder cap `max_agents`, default 5, max 10; one task per agent; `start <n>` is the same, clamped); a blocked
  task is never dispatched to an agent (that was the pre-§3.7 round-robin bug — a
  dependent task could start before its blocker finished).
- `bun ~/.claude/skills/astra/scripts/parallel.ts merge` — merge the done branches, mark those tasks `[DONE]`.
- **Re-run `fill`** — the merge freed a slot and may have unblocked tasks; the next
  queued task starts. Repeat until the queue is empty.

The Conductor assigns across the frontier, never onto a blocked task; a task moves
from blocked → ready the moment its last blocker is marked `[DONE]`, not when a whole
wave finishes.

## TGR-C — A cycle is unbuildable — refuse, don't deadlock (HARD)

A cycle in the `**Depends on:**` edges (A blocks B blocks A) or a blocker that
never becomes `[DONE]` means a task is never schedulable. `parallel.ts` detects this
and **refuses with exit 2**, naming the never-ready tasks — it does not spin or
silently drop them. Fix the edges in `STATUS.md` so the graph is acyclic, then retry.
An unknown blocker id (a typo) counts as unsatisfied, so it surfaces rather than
being skipped.

## TGR-D — The frontier subsumes static waves

A plan grouped into **waves** (Wave 2 "starts only after ALL Wave 1 is `[DONE]`") is a
*coarse* frontier — a correct, legible pre-grouping. The frontier is its *dynamic*
form: a Wave-2 task whose own blockers are done runs immediately, without waiting for
the rest of Wave 1. **File overlap still gates concurrency (enforced)** — each brief's
`## Files` is owned exclusively; `parallel.ts` reads those lists and, when two ready
tasks share a path, dispatches the first and **holds the other in the queue**
(reported as `held: … (overlaps …)`). Readiness is necessary, not sufficient. Shared
registration files belong to one `integration` task, so batches never collide (FCT-G).

## TGR-E — Keep the graph honest (same failure mode as a stale doc)

- Mark a task `[DONE]` the moment it is, so the frontier advances; a finished-but-
  still-`[TODO]` task blocks everything downstream for no reason.
- Mark `[BLOCKED]` with the blocker in `## Blockers` when a dependency is external
  (not another task) — the frontier can't resolve what isn't a task edge.
- A changed plan re-draws edges, not just statuses — adding TASK-010 that TASK-003
  now needs is a new edge on TASK-003, declared in the same edit.

---

## Composition

- **conductor** (agent) — reads the graph, dispatches the frontier, orders the merge
  (migrations/config-owning task first); `/parallel` is its frontier scheduler.
- **/spec** (SPEC_DECOMPOSE) — emits tasks in waves with `Depends on:` edges; the
  waves are the coarse frontier (TGR-D).
- **RTM-A..D** (rtm-srs-link) — requirement→task trace; orthogonal to the task→task
  graph here. A task has both: which requirement it satisfies (RTM) and which tasks
  block it (this rule).
- **factory-mode.md (FCT-A..F)** — §4 factory mode, now shipped: "decompose task" is
  emitting these edges; the ready-frontier scheduler is the factory's dispatch loop.
  This rule is the on-ramp FCT-A makes mandatory at project start; `/factory` runs it.
- **ceremony-scaling SE-N** — a handful of independent tasks needs no graph ceremony;
  `Depends on: none` on each and round-robin is fine. The graph earns its keep when
  real task→task blocking exists.

## See also

- `scripts/parallel.ts` — the ready-frontier scheduler (`queue` / `fill` / `start` / `merge`)
- `scripts/hooks/task-required-before-code.sh` — "no ticket → no code" HARD BLOCK (TGR-A / FCT-A)
- `agents/conductor.md` — assigns across the frontier, plans the merge
- `templates/.claude/rules/factory-mode.md` — FCT-A..F (the factory flow this DAG is the on-ramp to)
- `skills/FACTORY.md` — the `/factory` flow (tasks / run / status / ship)
- `skills/ORCHESTRATION.md` — the parallel-execution pattern
- `templates/STATUS.md` — the task block + `**Depends on:**` field
- `templates/.claude/rules/rtm-srs-link.md` — RTM (requirement→task, orthogonal)
- `docs/plans/ASTRA-MATTPOCOCK-GAP-ANALYSIS.md` §3.7 — origin of the rule
