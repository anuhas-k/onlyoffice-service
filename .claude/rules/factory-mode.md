---
paths:
  - "STATUS.md"
  - "docs/tasks/**"
  - ".astra/factory.json"
---
# factory-mode.md — the gated software factory: plan → tickets(DAG) → frontier → PR per drop → sign-off → deploy (FCT-A..S)
# Auto-installed for every project.
# Loaded whenever current_user_role ∈ {Conductor, TL, SE, SE-Backend, SE-Frontend,
#   SE-Contract, PM, SD, JD, DevOps}.
#
# Source: docs/plans/ASTRA-FACTORY-MODE.md + Matt Pocock's "Software Factories for
# Real Engineers" (to-tickets + implement-spec). ASTRA fills ONE factory slot — the
# **orchestrator of gated tasks** — and buys the rest (Jira tracker, GitHub host,
# runners). The design note's thesis holds verbatim here: *an accelerator without a
# brake is a slop cannon.* ASTRA built the brake first (108+ HARD BLOCK gates, the
# sign-off matrix); factory mode bolts those brakes onto a task-dispatch loop. This
# rule is the IN-SESSION factory (no remote runner); `/factory` is its entry point.
#
# It composes with — never restates — task-graph.md (TGR, the DAG + frontier),
# autopilot-safety.md (APB, the throttle + trust ramp + retry cap), ceremony-scaling.md
# (SE-N, dispatch only the surface the change touches), and the ship-time gates
# (astra-code-review SCR-A, astra-security-audit SSR-A).

---

## FCT-A — No plan, no tickets, no pipeline. The DAG is created at project start (HARD)

A project that produces code MUST carry a **task DAG** before Phase 4 — `TASK-NNN`
blocks with `**Depends on:**` edges in `STATUS.md` (the shape task-graph.md TGR-A
defines). This is the factory's *input*; without it there is nothing to dispatch and
nothing drives the project toward deploy. A `STATUS.md` whose "Task List" is prose
("see docs/RTM.md") is **not** a DAG — the scheduler reads edges, not paragraphs.

- **When:** the moment `SPEC.md` + `docs/RTM.md` exist (end of planning / Phase 3),
  BEFORE any implementer runs. `/factory tasks` (or `/spec` SPEC_DECOMPOSE) emits it.
- **The fix this closes:** "project created but nothing drives deploy" — a project
  that jumped to code with no DAG has no spine from plan to ship. The DAG *is* the spine.
- RTM (requirement→task) and the DAG (task→task) are **both** required and orthogonal
  (TGR composition) — one says what a task satisfies, the other what blocks it.

## FCT-B — The factory loop = decompose → dispatch the ready frontier → gate → merge → repeat

The in-session factory runs exactly the TGR-B loop, end to end, and stops at a PR:

```
/factory tasks   →  SRS + RTM + API doc → STATUS.md index + docs/tasks/<cat>/TASK-NNN-*.md (FCT-G)
/factory run     →  bun ~/.claude/skills/astra/scripts/parallel.ts queue   (running n/cap, ready in order, held, waiting)
                    bun ~/.claude/skills/astra/scripts/parallel.ts fill    (one worktree + one agent per task, up to the free slots)
                    …each agent: /factory exec TASK-NNN, behind the gates (FCT-D)…
                    bun ~/.claude/skills/astra/scripts/parallel.ts merge   (merge the finished branch, suite green)
                    fill again — the freed slot takes the next queued task; repeat
                 →  a drop's review task [DONE] → task.py drop cut Dn → LDV → PR drop/Dn   (FCT-O, never merge)
                    …the pool keeps building the next drops meanwhile…
/factory ship    →  after SE/TL merges the PR into develop → /land-and-deploy (FCT-E)
```

**Fork → org promotion.** When the team works on a fork (`.astra/factory.json` `ship`), after the
human merges the fork PR, run `python3 ~/.claude/skills/astra/scripts/ship-chain.py next` — it opens the
upstream PR (fork `develop` → upstream `develop`); a hook tells you when it is due. After the human
merges the upstream PR, file ONE deploy card via `/deploy-card` (PR number in the title) and
`python3 ~/.claude/skills/astra/scripts/ship-chain.py record-card`. Claude never merges either PR and never auto-confirms an @mention (DC-4).

The Conductor assigns from the queue (file-overlap still gates concurrency,
TGR-D); a blocked task is never dispatched. Dispatch **only the surface the change
touches** (ceremony-scaling SE-N): no frontend task on a backend-only diff. A task
with nothing to do is **skipped and recorded as skipped**, never run empty.

## FCT-C — Throttled posture: a rolling pool of at most 10, human review on every PR (HARD)

This is a commitment, not a setting — the most conservative posture the model allows:

1. **A rolling pool: 5 builders by default, 10 agents at most.** At most `max_agents`
   builders (default 5, `.astra/factory.json`, 1..10) run at once, each on exactly ONE
   `TASK-NNN`; no two agents share a task. Reviewers and the monitor run beside the
   builders, inside a hard limit of 10 agents in all, so a review never waits for a build
   slot (Project C: 10 builders filled the pool and the reviews that finish tasks were refused). When an agent finishes and its branch
   merges (full suite green) the next queued task takes the freed slot — no waiting for
   the frontier to drain. The builder cap never goes past 10 (APB-C throttle, lifted to
   the task loop). Queue order:
   effective priority (`**Priority:** P0..P3`, default P2, = the min of the task's own
   and every task that depends on it, transitively — login P0 pulls register to P0),
   then depth (roots first), then most downstream dependents, then id. A task whose
   `## Files` overlap a running one is held and keeps its place (TGR-D).
2. **A drop ends by OPENING a PR, never by MERGING one** (one PR per delivery drop, FCT-O). Merge is a human action
   behind `/git` (seven-section body incl. Merge danger) and the sign-off matrix.
3. **The trust ramp** (APB-D): the cap is 10. A failing task snaps the pool to 1 until
   a task passes clean, then it goes back to the cap. The 3-retry cap stays (FCT-D/APB-D).

## FCT-D — Every gate blocks a run; the brake cannot be bypassed (HARD)

Every gate that blocks in-session blocks a factory task — pattern-mapper (PMR-A),
plan-check (PCR-A), TDD (THG-A), `astra-code-review` (SCR-A, blocks handoff on open
S1/S2), `astra-security-audit` (SSR-A, blocks ship), coverage, leanness, injection
safety. A task that trips a HARD BLOCK **ends and files** — it does not override.
The factory's self-repair is the APB-A retry cap: a failing step retries at most 3
times, then hands to a human. No env-var bypass; factory mode adds throughput, never
a bypass.

## FCT-E — The factory stops at the human SE sign-off (HARD)

Each delivery drop ends with ONE PR `drop/Dn` → develop (a project with no drops: ONE PR
`feature/<name>` → develop, FCT-O). A **human SE/TL** reviews and merges it — that is the sign-off. The factory never approves its own work, never
merges, and never runs on develop/main (`parallel.ts` refuses). The QA role is not part
of the coding loop and does not block development; release/deploy gates
(`/land-and-deploy`) keep their own rules.

### Steps run in order (FCT-E)

Steps run in order. Each starts only when the one before it is done — never skip ahead:
spec → feature branch → task briefs → build → per-task review → drop review + 3 gates
→ local deploy verified (contract/backend, FCT-I) → PR → external audit (contract only) → deploy.
The order holds **per drop** (FCT-O): drop D1 runs its review → deploy while D2 still builds. Enforced, not advised: the `parallel.ts`
preflight (`fill`/`start` refuse with no filled SPEC.md, no TASK-NNN briefs, or on
develop/main), `task-required-before-code` (no ticket → no code),
`code-review-required-before-task-done` (no [DONE] without a PASS review),
`flow-order-gate` (no `gh pr create` until the drop's review task + gates PASS on the exact
reviewed code), and
`ship-chain` (upstream PR only after the fork merge; deploy card only after the upstream
merge). No env bypass. The board shows the order: a later step is locked (🔒) until the
earlier one is done, and a step done out of order is flagged ⚠.

## FCT-F — The remote substrate is BOUGHT, not built here (scope boundary)

This rule is the IN-SESSION factory. "Run-outlives-human" autonomy — a tracker
transition triggering a disposable runner that executes headless — is a deliberate
**non-goal** (ASTRA-FACTORY-MODE.md §5): it is the literal inverse of ASTRA's
human-team-in-a-session identity. If cloud mode is ever wanted, the trigger (Jira
transition), the runner (GitHub Actions / Claude Code cloud) and the observability
platform are **bought and wired** per the design note §6 — the orchestrator logic in
this rule lifts onto the runner unchanged, and the brakes (FCT-C/D/E) ride with it.
Until then, `/factory` runs in one human's session, behind every gate, ending at a PR.

## FCT-G — One task = one file = one agent; batch homogeneous work; divide without conflict (HARD)

**Two artifacts, no overlap.** `STATUS.md ## Task List` is the *index* — status, title,
`**Depends on:**`, `**Task:**` link. `docs/tasks/<category>/TASK-NNN-<slug>.md` is the
*brief* — sources, units, owned files, execution flow, SE-side QA checklist
(`templates/tasks/TASK.md`). Status is never written in a brief; detail never in STATUS.
`/factory tasks` creates both; `/factory exec TASK-NNN` runs exactly one brief.

**The brief carries the knowledge.** When a task is created, its `## Sources` points
at the exact doc sections it needs (API doc §, SRS FR-N, PATTERNS analog, IA rows) —
pointers, never copies. `task.py start` cuts them into the build pack
(`.astra/pack/TASK-NNN.md`); the executing agent reads that one file, so it starts
informed and its context stays small.

**Batch, don't enumerate.** A *unit* is one endpoint / component / contract function /
migration. Homogeneous units that follow one pattern are **batched**: one task, one
agent, up to the batch cap (default **10 units**), running the full per-task flow
(TDD → build → `/verify` → SE-side QA → `/astra-code-review` → `[DONE]`) once for the
whole batch. 300 endpoints are ~30 batch tasks, not 300 tasks — and the frontier runs
them N agents wide. Keep a task **individual** when it is `foundation`, `data`
(ordered migrations), security/money/auth (reviewed alone, SE-N), cross-cutting, or
already at the cap by itself.

**Group by owner, so batches never collide.** Batch by resource/module — every unit of
one resource in the same batch while ≤ cap; split a larger resource by sub-resource.
Each task **owns its `## Files` exclusively**. Shared registration points (route index,
app wiring, DI container, shared barrel, nav config) belong to ONE `integration` task
that depends on the batches — batches never edit them. Dependency files (`package.json`, lockfiles) belong to `foundation`. Each task's review goes
to its own `.astra/reviews/TASK-NNN.{json,md}`, never a shared file — so task branches
merge cleanly. Two tasks that must touch the
same file are merged or given a `Depends on` edge. `parallel.ts` enforces it: a ready
task whose files overlap an already-dispatched one is **held in the queue until the overlap clears**,
never co-dispatched.

**Shape of a run** (300-endpoint example):
`foundation` → `data` → 30 × `backend` batches (parallel, N at a time) →
`integration` (registration + contract sweep) → `review` (zero-context
`/astra-code-review` + `/astra-security-audit`, SCR-G) → PR — **once per delivery drop** (FCT-O):
D1 = foundation + data + auth + the first resource, then a few resources per drop. SE-side QA runs
in every task; a human SE/TL signs off each PR (FCT-E).

## FCT-H — A provided API doc is the LOCKED contract: build to it, never edit its shape (HARD)

When an API doc (`docs/api-vX.Y.md` or `docs/openapi-*.{json,yaml}`) exists **before**
the code — contract-first — it is not documentation to maintain, it is the spec:

- **Every documented endpoint is implemented.** The `integration` task's contract sweep
  (`/astra-doc-verify`, DVR-B type A) fails on any endpoint the doc lists and code lacks.
- **Every field exactly.** Names, types, required-ness, enums, status codes, error
  shapes — no missing field, **no added field**. Each unit's test asserts the response
  key set equals the documented key set and that the request rejects unknown fields.
- **Code that disagrees is the defect** — fix the code, never bend the doc to match it.
  Missing or extra field = **S2 contract drift** (SCR-B).
- **The doc only gains real data:** verified example values/responses and evidence
  links. That still moves the version (BE-V). A genuine shape change is the contract
  owner's decision (BA/TL), re-signed in INTERFACE_AGREEMENT — never an implementing
  agent's edit.

No API doc yet (code-first)? Then BE-W applies as written: the doc is produced from
what shipped, verified, and versioned.

## FCT-I — Local deploy verified (LDV): before the PR, before any deploy (HARD)

Before deploy, for a **contract or backend** project, a local deploy is a must. If Docker:
it must run. If chain: a local chain must run and the contracts deploy to it. Then test that
it all works — if there are endpoints, test them all: **every endpoint's success path returns
200** (another 2xx only when the operation documents it, or `expect` says so). The result is
`.astra/local-deploy.json` (`verdict`, `kind`, `commit`, `steps`, `endpoints`, `contracts`, `functions`;
while it runs, the same file is rewritten after every step with `state: running`).
For a **contract**, the deployed contracts are tested too: every zero-input view is called, and every
state-changing function / view-with-inputs needs a success-path call from `.astra/smoke-calls.json`
(`[{contract, function, args, from, value, expect: success|revert:Err}]`, `{{Name}}` / `{{acct:N}}`)
or `script/Smoke.s.sol` (addresses in env as `<CONTRACT_NAME>_ADDRESS`); an uncovered function FAILs.
Inherited OZ/proxy plumbing (`upgradeToAndCall`, `grantRole`, `initialize`, ...) is not required.

- **When:** after the final review task + gates, **before `gh pr create`**, so before any deploy.
- **Fresh for this exact code:** verdict `PASS` and `commit` == `git rev-parse HEAD`. Only
  docs-only commits since (`*.md`, `docs/**`, `.astra/**`) keep an earlier PASS valid.
- **No silent skips:** an endpoint with no usable success-path request FAILs ("add it to
  `.astra/smoke-requests.json`"). A required deploy env var that is missing FAILs naming it.
- **Enforcement:** `flow-order-gate` refuses `gh pr create`, `deploy-card.ts` (without
  `--print`/`--dry-run`) and `land-and-deploy` with "LOCAL DEPLOY NOT VERIFIED (FCT-I)". The
  board shows a 4th gate, "Local deploy", required for the final review step.
- **Files:** `scripts/local-deploy-check.sh` (run: `bash ~/.claude/skills/astra/scripts/local-deploy-check.sh`),
  `scripts/hooks/flow-order-gate.sh`, `dashboard/server.js`, `skills/FACTORY.md`
  (`local_deploy` keys). No env-var bypass.

## FCT-Q — A Haiku monitor watches every run; the board reads progress from facts, not a Stage line (HARD)

**Why.** Project C, 2026-10-30. Ten agents ran. Six had committed their code and ticked every work box,
two had stale reviews, and three had stopped. The board said "Writing tests" for all ten, because the
step came from a `**Stage:**` line that nothing writes. Nobody noticed the stopped agents for nearly
an hour.

**The board** reads where a running task is from what the task already leaves in its worktree:
- every work box ticked in the brief's Progress list, with the code committed → **Built — review
  next**;
- any code commit or ticked box → **Coding**;
- neither → **Writing tests**.

The review box is excluded, because the verdict speaks for itself. A commit that touches only records
(`STATUS.md`, `docs/`, `.astra/`, `qa/`) is not code. Ticked boxes with uncommitted code are still
coding. An explicit `**Stage:**` line still wins.

**The monitor.**
- After every `parallel.ts fill`, launch `astra-monitor` with `model: haiku` and
  `run_in_background: true`.
- It runs `scripts/factory-monitor.py watch`, which polls the board's own snapshot every 60 s at no
  token cost. It returns only on something new: review due, stalled (no commit or file change for
  20 min), blocked, or a free slot.
- Act on each issue it returns, then launch it again. While agents are running, a monitor is always
  running.
- It writes only `.astra/monitor.json`, which the board's Agents card shows. A pass older than
  5 minutes reads "Monitor not running".

See also: `agents/astra-monitor.md` · `scripts/factory-monitor.py` · `dashboard/server.js --snapshot`.

## FCT-R — One builder per task, start to close-out; context is the cost (HARD)

Every turn re-reads the whole context. Project C 2026-10-30, measured from its transcripts: 66 agents read
4 billion context tokens; 18 of them passed 400K and were 81% of that. One foundation task took 12 agents,
3,029 turns and 35% of the run. Every agent also starts near 119K before it does anything. Replayed on the
real run, a 250K cap would have cut 31% of agent tokens and 350K would have cut 54%. But a single 250K stop
then retired builders after one or two units (they start near 140K): on 2026-11-01, 67 builders worked
15 tasks, each restarting from the brief and re-reading its files.

- **One builder owns a task** from Unit 1 to close-out: every unit, the full gates, the verify report, the
  checklists, `## Progress` ticked. The conductor never starts a second builder on a task while its builder
  lives, and the review starts only when the builder reports the task done. A review FIX goes back to the
  **same builder** by `SendMessage` (`task.py next` names its agent id).
- **Two context levels** in `.astra/factory.json` (`agent-budget-gate.sh`; an old `context_budget_k` is read
  as the hard level):
  - `context_soft_k` (default 400): the first tool call past it is refused **once**: commit a checkpoint, tick
    `## Progress`, read less from here — then carry on. The builder keeps its task.
  - `context_hard_k` (default **700, also the ceiling** — a project may set it lower, never higher): the builder finishes the unit it is on; once it has committed and its
    worktree is clean, every code edit and command is refused except ticking `## Progress`, read-only git and
    `task.py`. It hands back `BUDGET: TASK-NNN committed at <sha> — next: <unit>`, and only then does a fresh
    builder take the task (`task.py next` says RESUME). A task that reaches the hard level often is too big —
    split it at planning time, not by switching agents mid-task.
  - The conductor session stays under `session_budget_k` (default 300).
- **The model per task is chosen by measured tokens, not by list price.** Most of a builder's tokens are cache
  reads, and Sonnet 5.5 and Opus 5.5 read cache at the same price; what differs is the turns a model needs.
  `python3 ~/.claude/skills/astra/scripts/model-ledger.py pick <category>` names the model with the lowest median
  tokens per FINISHED task of that category (fix rounds included, review rounds no worse), once two models each
  have 3+ finished tasks; until then it names the default, Sonnet 5.5 for builders. Reviews stay on Opus 5.5 and
  the monitor on Haiku 5.5. `model-ledger.py report` writes `.astra/model-ledger.json` after a run.
- **One Read, then code — the build pack.** `task.py start` writes `.astra/pack/TASK-NNN.md` (`task-pack.py`):
  per unit the contract operation (components once, only this task's error codes), its narrative section,
  every Source line that names it, and the analog's files with their exported signatures. The builder reads
  it once and writes its first test; a Source or analog file is opened only at a line the pack cites, by
  range. Project C 2026-11-02: one builder made 32 read-only calls (73K → 169K context) before its first
  edit; the pack for that task is ~17K tokens.
  The dispatch prompt sends the builder there first ("Step 1: Read `.astra/pack/TASK-NNN.md`"), never
  "read it if useful" or "read the brief and its Sources"; `agent-pool.py` refuses a builder prompt that
  does not name its pack. A builder gets its **parent session's** loaded CLAUDE.md and rules, not the files
  on disk — after `/update` or a CLAUDE.md change, restart the conductor session before dispatching
  (`agent-pool.py` refuses a builder from a session older than those files). Project C 2026-11-02: a session
  started 40 min before the slim CLAUDE.md landed handed TASK-017 the old 41K one + every rule (74K at start).
- **Keep the context small (it is re-read every turn):** read file ranges (`grep -n`, then `sed -n`), not
  whole migrations; after a small edit run only the changed spec — the full suite runs once, before the
  task's last commit; sabotage runs once per task through `sabotage.py` (FCT-S); never a `sleep` polling loop — a long
  run is one foreground call with a timeout, or `run_in_background` with nothing else done until it reports.
  Project C 2026-11-01: one agent spent 72 of 81 minutes in 10-minute `sleep` polls.
- **A checkpoint commit after every unit step** (attack test red · fix · targeted tests green), with the `## Progress` tick. A stalled agent's replacement reads one Progress line and the last
  commit, never a loose diff (Project C 2026-11-01: ~30 min lost re-checking uncommitted work).
- **Load only the skills the task needs (FCT-J).** The SE roles preload clean-code, bug-prevention and
  their core skill; anything else is a Read of `~/.claude/skills/<name>/SKILL.md` when the work reaches
  it, never a Skill call. Seven up-front Skill calls put Project C builders at 260K before any code.
- **The conductor checkpoints and clears.** Past `session_budget_k`, write STATUS.md and `docs/HANDOFF.md`,
  then `/clear`. The run's state is in files; a 1,600-turn session at 468K re-reads all of it each turn.
- **The monitor reports it** as `heavy` (an agent past the soft or hard level) and `session-heavy` (the
  conductor), read from the session transcripts, shown in `.astra/monitor.json` under `context`. It also
  reports `hung-request`: a model request with no reply for 5 minutes — stop that agent and relaunch the task
  from its last checkpoint commit.
- **Rules cost tokens too.** Unscoped `.claude/rules/*.md` load into every agent. A rule that belongs to one
  role or file kind carries `paths:`; the QA rulebook is scoped to `qa/**`, not to `*.spec.*`, which every
  backend unit test matches. A commit that only touches records does not stale a review.

See also: `scripts/factory-monitor.py` (`context_issues`) · `agents/astra-monitor.md`.

## FCT-S — The bugs reviews keep finding are built in, not reviewed in (HARD)

Project C 2026-10-31: 55 of 58 bugs were filed by code review, and the same classes came back task after
task — routes not deny-by-default, revocation timing, data rules written as comments, contract drift,
logs with PII, merges that broke the base. Reviews ran to 7 and 9 rounds. Every one of those checks was
knowable before the first line.

- **The checklist.** `task.py start` (and `progress`) writes `## Bug-class checklist` into the brief:
  the classes in `templates/tasks/BUG_CLASSES.md` for `any` plus the brief's `**Category:**`. The builder
  ticks a box only when a test proves it, or writes `n/a: <why>` after it. `task.py done` refuses an
  open box. Review tasks carry none.
- **It learns.** Every code_review bug carries `class`. A finding no class covers gets a new id plus
  `class_category` and `class_check`; from then on every brief of that category carries it. The commit
  gate (`se-bugfix-record-required.sh`) refuses a code_review bug with no `class`, or a new class with
  no `class_check`.
- **The latest base first.** A committed task that is behind its base gets `SYNC` from `task.py next`
  before `REVIEW`: merge the base, run the FULL suite, commit. Merge breaks across tasks (Project C BUG-076,
  088) are found by the builder, not by the review.
- **What can block.** Only a finding inside the brief's scope (`## Units`, `## Files`, `**Design:**`,
  threat model) or a HARD-rule break is S1/S2. Hardening the brief never asked for is S3 with
  `"follow_up": true`; the owner turns it into a task.
- **Two review rounds, then done.** Project C 2026-11-01: rounds that could raise new blocks reached
  round 3 and kept tasks in review for hours.
  - **Round 1 — the full review.** The reviewer finishes every check before its verdict and lists **every**
    S1/S2 (`"findings"`). That list is the task's complete fix list; what it missed is never a later block.
  - **FIX — the same builder, every finding, one round.** `task.py next` gives `FIX` with the builder's agent
    id: it fixes all S1/S2 findings as classes, each with its test, runs each finding's targeted tests,
    then the full suite once, merges the base and reports. One fixer for the whole round, not one per class.
  - **Round 2 — the fix check only** (`REVIEW … FIX CHECK ONLY`). The reviewer reads
    `git diff <round-1 head>..HEAD` and the round-1 findings, answers `fixed` / `open` for each
    (`"checked"`, `"scope": "fix-check"`), and nothing else. A new problem is S3 with `"follow_up": true`
    for the PR notes — never a block. Every finding fixed → PASS; any open → `HUMAN`. There is no round 3,
    and `task.py next` refuses a fix-check BLOCK whose `checked` is all `fixed`.
- **Sabotage only security rules and guards, once per task — never every rule, never per unit.** Break-testing
  proves a test would catch a rule's removal; it is worth its cost only where a silent removal is a breach:
  - **security rules — every one:** authentication and authorization, database roles / grants / RLS,
    injection and credential safety (INJ-Z ratchets), secrets and TLS, PII redaction, signature and crypto checks;
  - **guards — one per guard kind,** not one per table or column: an immutability / append-only trigger, a
    state-machine entry guard, an outbox guard. The same trigger or function on twenty tables is one kind; a
    catalogue test proves every table carries it, and one sabotage proves the tests catch its removal.
  - **plain data rules are not sabotaged:** foreign keys, NOT NULL, CHECK ranges, defaults, version counters,
    fractional or timestamp bounds. Their generating test (the bad write is refused) is the proof. A brief does
    not carry a sabotage box for them, and a review does not ask for one.
  - **once, at close-out:** after the last unit, list every security rule and guard kind the task added in one
    `mutations.json` and run it once — before the full suite and the review (brief step 6a). Units carry no
    sabotage step or box. A task that adds none (plain data, wiring) runs no sabotage at all.
  - **hard gates (`task.py`):** `done` and the merge check refuse a task whose commits add grants, RLS,
    definer functions, triggers or auth / crypto / signing / secrets files — or whose brief says
    `**Sabotage:** required` — unless `.astra/sabotage/TASK-NNN.json` (written by `sabotage.py --task`) shows
    every mutation caught, on a committed head of this branch, with no such change after it. The commit gate
    refuses a brief with a sabotage step in `## Units` / `## Progress`, and a new brief without a
    `**Sabotage:** required | none — <why>` line.
  Run it with `python3 ~/.claude/skills/astra/scripts/sabotage.py run <mutations.json>`: parallel shards
  (`ASTRA_SABOTAGE_SHARD` picks a test database per shard), only that rule's tests, every file restored,
  `SABOTAGE: n/m caught`. Project C 2026-11-01: a "create the schema" task (TASK-033) break-tested ~70 rules one by
  one and spent ~1.7 h waiting on it.

See also: `templates/tasks/BUG_CLASSES.md` · `scripts/task.py` (`bug_classes`, `next_actions`) · smoke T-BCL-01.

## FCT-P — A routine choice is taken, not asked; only owner decisions stop the run (HARD)

The run is unattended between human gates. When the agent already knows the answer, a question
parks the whole pool until someone looks, which is the wait this factory exists to remove.

- **Routine means it has a recommended option and names no owner decision.** Examples: commit
  this brief and start the next task, extend a brief with a file it now owns, re-run a flaky
  suite, re-dispatch after a fix, pick the next ready task. Take the recommended option, say
  which one in one line, and keep going.
- **Owner decisions are still asked.** These are design or architecture, schema or contract
  shape, scope or requirements, destructive actions, PR merges, deploys and releases, @mentions
  (DC-4), sign-offs and approvals, identity, secrets, licences and cost. Name the decision in
  the question ("Design decision: …"), so the human sees at once why the run stopped.
- **No recommendation means ask.** If the agent cannot tell which option is right, the choice
  is the human's.
- **Every choice taken is logged** to `.astra/auto-decisions.jsonl` (time, question, option
  taken), so the human can read every choice made for them.
- **Enforced by `scripts/factory-ask-gate.py`.** It is a PreToolUse `AskUserQuestion` hook that
  runs only in factory-managed projects. It refuses (exit 2) a question where every part has a
  `(Recommended)` option and none names an owner decision, logs the choice, and fails open.
  Smoke: T-ASK-01.

## FCT-O — Deliver in drops: a reviewed slice reaches QA without waiting for the whole run (HARD)

QA should not wait for the 30th batch to test the 3rd. A **delivery drop** is a slice of the run
that a QA tester can use end to end — D1 is foundation + data + auth (register → login) + the first
resource; each later drop adds a few resources (`.astra/factory.json` `"drop_size": N` batch tasks,
default 3) in priority order. Each drop goes through every later gate on its own, while the pool
keeps building the next drop.

- **Tagged at `/factory tasks`:** every `TASK-NNN` block in STATUS.md carries `**Drop:** Dn`. Each
  drop has its own `integration` task (owns the registration files; depends on that drop's batches
  and on the previous drop's integration, so they never collide) and its own `review` task (brief
  under `docs/tasks/review/`, `**Drop:** Dn`, depends on that integration). The review is
  zero-context over `git diff <previous drop/D(n-1) or develop>...HEAD` (SCR-G).
- **Cut at the reviewed code:** when the drop's review task is `[DONE]`, `task.py next` prints
  `DROP Dn`. `python3 ~/.claude/skills/astra/scripts/task.py drop cut Dn` creates branch `drop/Dn`
  at the review task's own tip (the reviewed code + records, never task merges that landed after)
  in the worktree `../<project>-drop-Dn`, and commits `qa/drops/Dn.md` there — the QA team's
  handoff: every task in the drop with its `## Units`, and what is NOT in it yet. It refuses a drop
  with an unfinished task, no PASS review, or code changed after `reviewed_head`.
- **Then, in that worktree, in order:** `local-deploy-check.sh` (FCT-I, on the drop's exact HEAD) →
  `git push -u origin drop/Dn` → `/git pr` (base develop, head `drop/Dn`; a merge commit, not a
  squash — the next drop builds on it) → `task.py drop record Dn <pr-url>` → after the SE/TL merge,
  `ship-chain.py next` (upstream PR) → deploy card → `/land-and-deploy`. QA tests the deployed drop
  from `qa/drops/Dn.md`.
- **Enforced:** `flow-order-gate` reads the branch — on `drop/Dn` it requires that drop's review task
  `[DONE]` + PASS, and refuses when anything but records (`*.md`, `docs/`, `.astra/`,
  `qa/bugs.json`, `qa/reports/`) changed after its `reviewed_head`; LDV must be PASS for that HEAD.
  On any other branch with drops in use, every review task must be done. The board shows each drop
  (built n/m · in review · cut · PR open). No env-var bypass.
- **No drops** (a small run): no `**Drop:**` lines, one terminal review task, ONE PR — FCT-E as before.

## FCT-N — Every task completes the SE-side QA checklist (HARD, no exception)

No task reaches `[DONE]` or merges unless its brief's `## SE-side QA checklist` is complete.
`task.py done` refuses, and `parallel.ts merge` (`task.py check --merge`) refuses again, when:

- the task has no brief, or the brief has no checklist;
- any of the six items is missing (tests · field contract · status codes · negative + auth ·
  `/verify` evidence · files scope). Deleting an item is not a pass;
- any item is unticked;
- there is no `qa/reports/verify-*.md` naming the task (item 5, checked on disk);
- the task's commits changed a file its `## Files` does not own (item 6, checked with git
  against the main branch). `STATUS.md`, `.astra/`, `qa/reports/`, `qa/bugs.json`,
  `DECISIONS.md`, `.gitignore` and the brief itself are always allowed.

Every task category is covered, review tasks included. Ticks are made by the agent that did the
work, never in bulk. `status-line-guard.sh` blocks the only other way to `[DONE]`, a hand edit.
There is no env-var bypass. Checked by smoke `T-FWT-01`.

## FCT-M — The brief is the live progress record; work is committed as it goes (HARD)

A task ran 6+ hours and 6 review rounds with every file uncommitted, no record in its brief of
what was finished, and a security design discovered one review at a time (Project C TASK-001,
2026-10-29). So:

- **Progress list:** `task.py start` writes `## Progress` into the brief: one box per unit
  (test first · green · committed), the SE-side QA box, and the review box. There is also a
  `### Review log` with one line per round. The agent ticks each box the moment it is true.
  For a task already running, `task.py progress TASK-NNN` adds the list and prints the open
  boxes.
- **Done needs a complete brief:** `task.py done` refuses while any `## Progress` or
  `## SE-side QA` box is open.
- **Commit per unit:** commit each unit when it goes green. A review runs on a committed head,
  and `task.py done` refuses a PASS whose `reviewed_head` ends in `+uncommitted`.
- **The tick rides with the commit:** a commit whose message names `TASK-NNN unit N` must stage the
  brief with `Unit N` ticked; `unit N, part k` needs a ticked `Unit N.k` box (add it when a unit is
  split). `unit-progress-gate.sh` refuses it otherwise (Project C TASK-038: 6 commits, 0 boxes ticked).
- **Units are small:** one unit is one commit of about 300–500 lines — a data unit is one table group
  or migration, not the whole schema. A unit too big for that is split into `Unit N.k` boxes.
- **Security units are designed before they are coded:** the brief's `**Design:**` line states
  the decided design (deny by default: allowlist plus exact value format, never a pattern
  scrubber), and `**Skills:**` carries `security-engineer` and `pbt`.
- **One round per finding class:** a BLOCK finding is fixed as a class, and a security unit
  adds a property/fuzz test that generates that class (other scripts, bidi, zero-width,
  look-alikes) before it asks for the next round. The reviewer reports every bypass class it
  finds in one pass (round 1), and round 2 checks only those findings (FCT-S).
- Enforced in `scripts/task.py` (`start` / `progress` / `done`) and checked by smoke `T-FWT-01`.
  No env-var bypass.

## FCT-L — Task state lives in code: `task.py` is the only writer, the flow is computed (HARD)

A task is finished only when its own line in `STATUS.md` says so and its work is committed.
An agent that wrote code and stopped, leaving the line `[TODO]` and the files uncommitted,
reads as "not started" and gets dispatched again on top of its own work. Rules the model
must remember get forgotten, so the flow is a program (`scripts/task.py`), and hooks push
every step through it.

| Step | Command (in the task's worktree) | Checked by the script |
|---|---|---|
| start | `python3 ~/.claude/skills/astra/scripts/task.py start TASK-NNN` | `[TODO]` → `[IN PROGRESS]` |
| finish | `python3 ~/.claude/skills/astra/scripts/task.py done TASK-NNN`, then commit | refused without a PASS `.astra/reviews/TASK-NNN.json` (SCR-F) |
| cannot finish | `python3 ~/.claude/skills/astra/scripts/task.py block TASK-NNN "why"`, then commit | writes `[BLOCKED]` and a `**Blocked:**` line |
| human undo | `python3 ~/.claude/skills/astra/scripts/task.py reopen TASK-NNN` | back to `[TODO]` |
| orchestrator | `python3 ~/.claude/skills/astra/scripts/task.py next` | prints MERGE / REVIEW / RESUME / WAIT / HUMAN / FILL / PR, in order |

- **Only writer:** `status-line-guard.sh` refuses any hand change to a task's `[STATE]` in a
  factory project's STATUS.md, whether by Edit, Write, or Bash `sed -i`, `>` or `tee`. New
  `[TODO]` lines from `/factory tasks` still pass.
- **No stop on an unrecorded task:** `agent-pool.py stop` (SubagentStop) sends a task agent
  back while `task.py check` gives reasons (line not `[DONE]`/`[BLOCKED]`, or uncommitted
  files). After 3 push-backs (APB-A) it may stop, and the board shows the task BLOCKED.
- **No merge of unfinished work:** `parallel.ts merge` runs `task.py check --merge` and
  merges only clean `[DONE]` worktrees. The rest stay in the pool.
- **Never forgotten:** the UserPromptSubmit hook runs `task.py next --hook` every turn, so the
  orchestrator always sees the next actions computed from disk. It does those and nothing else.
- **Board:** it reads each worktree's line and uncommitted count, and reloads itself when an
  install replaces its code (`/factory board` also replaces a stale server).
- Reviewers (read-only) are exempt. There is no env-var bypass.

## FCT-K — Every client doc reaches the agents that need it (HARD)

`/init` inventories every client doc in `docs/` (`scripts/docs-index.py` →
`.astra/docs-index.json`): its kind and the task categories that must use it — SRS,
interface agreement, glossary → every category; API doc + error contract → backend /
frontend / mobile / integration; workflows + Postman → backend / integration; schemas →
data / backend; deploy docs → infra. `/init` reads all of them before deciding anything.

`/factory tasks` puts each mapped doc in the brief's `## Sources` (path + the section that
applies), and the agent reads them through the build pack before writing code. `agent-pool.py gate` refuses
to dispatch a task agent whose brief leaves out a doc its category needs, naming the docs
(`docs-index.py <project> --check TASK-NNN` shows the same list). Review briefs are exempt;
the gate fails open if the inventory cannot be read. A doc no rule maps (`reference`) is still
read at `/init`, and the planner cites it where it applies.

## FCT-J — Every task agent loads the right skills first (HARD)

Each brief carries a `**Skills:**` line, written by `/factory tasks` from the brief's
category and `## Files`; the dispatched agent's **first action** is a Read of
`~/.claude/skills/<name>/SKILL.md` for each one its role does not already preload, before reading
Sources or writing code. Read, not the Skill tool: Project C 2026-11-01 measured each Skill call at the
skill body plus ~7K of re-attached agent + MCP listing (five extras = +83K per builder); a Read
returns the body alone. The prompt that launches it names those (not the preloaded ones). Every
skill still costs its body in every turn, so a brief names only what its task touches — never a whole
discipline "just in case".

| Brief touches | Skills |
|---|---|
| any code | `clean-code`, `bug-prevention` |
| backend / api routes, services | `backend-engineer` |
| schema, migrations, queries | `database-engineer` |
| `Dockerfile`, `docker-compose*` | `docker-engineer` |
| CI, k8s, Helm, IaC, deploy | `devops-engineer` |
| frontend | `frontend-engineer` |
| mobile (`se-mobile`) | by stack: `pubspec.yaml` → `flutter-engineer` · Xcode → `ios-mobile-engineer` · Gradle → `android-mobile-engineer` |
| contracts | `smart-contract-engineer`, `foundry-solidity` |
| auth, crypto, secrets | `security-engineer` |
| logging, PII, redaction, input sanitising, rate limits | `security-engineer`, `pbt` |
| shared foundation units — logger/redaction, error mapper, validation pipe, body parser, emitted records, config loader | `bug-prevention` (references/foundation.md F-1…F-10, BE-X), `security-engineer`, `pbt` |
| module boundaries / integration task | `architecture-engineer` |

- **Enforcement:** `agent-pool.py` (PreToolUse Agent) refuses a task agent (`TASK-NNN` in its
  description) whose prompt does not name every skill on its brief's `**Skills:**` line —
  "BLOCKED (FCT-J skills): …" with the missing names. A brief with no `**Skills:**` line is
  filled from the table above by its category. Reviewers are exempt (they load their own).
- **Role skills are preloaded (HARD).** Each SE agent's `skills:` frontmatter injects its core set at
  startup: **se-backend** — clean-code, bug-prevention, backend-engineer · **se-frontend** —
  clean-code, bug-prevention, frontend-engineer · **se-contract** — clean-code, bug-prevention,
  smart-contract-engineer, foundry-solidity · **se-mobile** — clean-code, bug-prevention (its stack skill
  comes from the brief) (`ROLE_SKILLS` in `agent-pool.py`, kept equal by
  T-FCTJ-01). The gate asks the prompt for the brief's other skills only. Project C 2026-10-31: seven
  Skill calls per builder (124K → 260K context before any code) was the biggest token cost of the run.

---

## Composition

- **task-graph.md (TGR-A..E)** — the DAG + ready-frontier scheduler this flow runs. FCT-A is TGR-A made mandatory at project start.
- **autopilot-safety.md (APB-A..E)** — the throttle, trust ramp and 3-retry cap FCT-C/D lift to the task loop
  (review rounds have their own, tighter limit: two, FCT-S).
- **ceremony-scaling.md (SE-N)** — dispatch only the change's surface (the FCT-B token brake).
- **conductor** (agent) — reads the DAG, dispatches the frontier, plans the merge order.
- **/factory** (skill) — the entry point: `tasks` / `run` / `exec` / `status` / `ship`.
- **/spec** (SPEC_DECOMPOSE) — writes into the native chain (SRS · ADRs · `/factory tasks`); no parallel `spec/` files.
- **backend-patterns.md BE-W / BE-V** — code-first API docs (BE-W) vs the locked contract (FCT-H); the version moves either way.
- **project-structure.md** — the one standard layout these paths come from.
- **astra-code-review (SCR-A) · astra-security-audit (SSR-A)** — the developer-side gates every run clears before its PR.

## See also

- `docs/plans/ASTRA-FACTORY-MODE.md` — the full design note (slots, the one FILL slot, the §5 non-goal, the §6 first remote slice)
- `templates/.claude/rules/task-graph.md` — TGR (the on-ramp this rule sits on)
- `scripts/parallel.ts` — `queue` / `fill` / `start` / `merge`
- `scripts/task.py` — task state (FCT-L) and `drop status | cut | record` (FCT-O)
- `scripts/factory-ask-gate.py` — routine choices taken, not asked (FCT-P)
- `agents/astra-monitor.md` + `scripts/factory-monitor.py` — the Haiku run monitor (FCT-Q)
- `skills/FACTORY.md` — the `/factory` flow (tasks / run / status / ship)
