# TASK-021 — Test UI: revoke, anchor batches view, recovery banner
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** frontend
**Kind:** batch (3 units)   **Tier:** small (SE-N)
**Satisfies:** FR-056 (rest), FR-039 (UI notice)
**Skills:** clean-code, bug-prevention, frontend-engineer
**Sabotage:** none — static dev UI
**Status, dependencies, drop:** see `STATUS.md` → TASK-021

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-056 (rest), FR-039 (UI notice)
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § Scope — In (test UI)
- `docs/api.md`
- `docs/SRS.md` § 6.3 TBD-002

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Revoke button per participant | SPEC Scope | `tests/ui/revoke.spec.ts` |
| 2 | Anchor batches view with client-side proof check | SPEC Scope | `tests/ui/anchors.spec.ts` |
| 3 | Recovery banner when head version is `recovered` | SRS FR-039 | `tests/ui/recovery.spec.ts` |

## Files — owned exclusively by this task
- `public/ops.js` (create)
- `public/index.html` (edit — ops panel + script tag)
- `tests/ui/revoke.spec.ts` (create)
- `tests/ui/anchors.spec.ts` (create)
- `tests/ui/recovery.spec.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Revoke button per participant: test first · green · committed
- [ ] Unit 2 — Anchor batches view with client-side proof check: test first · green · committed
- [ ] Unit 3 — Recovery banner when head version is `recovered`: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-021` → read `.astra/pack/TASK-021.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-021` → `task.py done TASK-021` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Full SPEC walk-through possible from the UI (FR-056)

## Out of scope
- Backend changes
