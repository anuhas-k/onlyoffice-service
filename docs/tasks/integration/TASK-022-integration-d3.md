# TASK-022 — Integration D3: register revoke/delete/anchor routes + background jobs, docs/api.md v0.3
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** integration
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-038 (startup run), FR-041 (1-min schedule), FR-053 (hourly), FR-043, FR-050, FR-055, FR-056
**Skills:** clean-code, backend-engineer, architecture-engineer
**Sabotage:** none — wiring only
**Status, dependencies, drop:** see `STATUS.md` → TASK-022

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-038 (startup run), FR-041 (1-min schedule), FR-053 (hourly), FR-043, FR-050, FR-055, FR-056
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § API Contracts
- `docs/decisions/001-onlyoffice-editing-service.md` § D1 (Background jobs)
- `docs/api.md` (v0.2 from TASK-015)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Register D3 routes in `src/routes.ts` | SPEC API Contracts | `tests/integration/d3-routes.test.ts` |
| 2 | Register sweeper (1 min), reconciler (startup + 5 min), outbox/batch (hourly) in `src/jobs.ts` | ADR D1 | `tests/integration/jobs.test.ts` |
| 3 | `docs/api-v0.3.md` + repoint `docs/api.md`; smoke requests for all 13 endpoints | BE-W | `astra-doc-verify` |

## Files — owned exclusively by this task
- `src/routes.ts` (edit)
- `src/jobs.ts` (edit)
- `docs/api-v0.3.md` (create)
- `docs/api.md` (edit)
- `.astra/smoke-requests.json` (edit)
- `tests/integration/d3-routes.test.ts` (create)
- `tests/integration/jobs.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Register D3 routes in `src/routes.ts`: test first · green · committed
- [ ] Unit 2 — Register sweeper: test first · green · committed
- [ ] Unit 3 — `docs/api-v0.3.md` + repoint `docs/api.md`; smoke requests for all 13 endpoints: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-022` → read `.astra/pack/TASK-022.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-022` → `task.py done TASK-022` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- All 13 SPEC endpoints exist and are documented
- Jobs start on boot

## Out of scope
- Business logic
