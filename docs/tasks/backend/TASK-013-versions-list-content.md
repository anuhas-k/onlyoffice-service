# TASK-013 — Versions API: history list + old version content
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (2 units)   **Tier:** small (SE-N)
**Satisfies:** FR-046, FR-047
**Skills:** clean-code, bug-prevention, backend-engineer
**Sabotage:** none — read-only routes; token rules sabotaged in TASK-010
**Status, dependencies, drop:** see `STATUS.md` → TASK-013

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-046, FR-047
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § API Contracts (`GET /files/:id/versions`, `/versions/:vid/content`)
- `docs/decisions/001-onlyoffice-editing-service.md` § D1 endpoints 9–10

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | `GET /files/:id/versions` — newest first, checkpoints grouped, participants | SPEC API Contracts | `tests/modules/versions/list.test.ts` |
| 2 | `GET /files/:id/versions/:vid/content?t=` — token bound to that version | SPEC API Contracts | `tests/modules/versions/content.test.ts` |

## Files — owned exclusively by this task
- `src/modules/versions/` (create)
- `tests/modules/versions/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — `GET /files/:id/versions`: test first · green · committed
- [ ] Unit 2 — `GET /files/:id/versions/:vid/content?t=`: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-013` → read `.astra/pack/TASK-013.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-013` → `task.py done TASK-013` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- V1 token never returns V2 bytes
- Checkpoints between milestones collapse into one group

## Out of scope
- Version creation (TASK-005/011)
