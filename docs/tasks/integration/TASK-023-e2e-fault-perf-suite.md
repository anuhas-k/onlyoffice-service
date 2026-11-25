# TASK-023 — End-to-end, fault-injection, performance and log-secret suite
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** integration
**Kind:** batch (4 units)   **Tier:** medium (SE-N)
**Satisfies:** NFR-001, NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-008, AC-1…AC-16 end to end
**Skills:** clean-code, backend-engineer, docker-engineer, security-engineer
**Sabotage:** none — tests only
**Status, dependencies, drop:** see `STATUS.md` → TASK-023

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § NFR-001, NFR-002, NFR-003, NFR-004, NFR-005, NFR-006, NFR-008, AC-1…AC-16 end to end
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § Success Criteria; § Fault Isolation Matrix; § Performance Constraints
- `docs/SRS.md` § 3.3; § 6.2a

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | E2E against the compose stack: AC-1…AC-16 one test each | SPEC Success Criteria | `tests/e2e/acceptance.test.ts` |
| 2 | Fault injection: stop service / DB / DS per Fault Isolation Matrix (NFR-004–006) | SPEC Fault Isolation Matrix | `tests/e2e/faults.test.ts` |
| 3 | Timing: open p95 < 3 s, save p95 < 5 s, 20 editors (NFR-001–003) | SRS NFR-001–003 | `tests/e2e/perf.test.ts` |
| 4 | Log-secret scan over the whole run (NFR-008 / AC-16) | SRS NFR-008 | `tests/e2e/log-secrets.test.ts` |

## Files — owned exclusively by this task
- `tests/e2e/` (create)
- `scripts/e2e.sh` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — E2E against the compose stack: AC-1…AC-16 one test each: test first · green · committed
- [ ] Unit 2 — Fault injection: stop service / DB / DS per Fault Isolation Matrix: test first · green · committed
- [ ] Unit 3 — Timing: open p95 < 3 s, save p95 < 5 s, 20 editors: test first · green · committed
- [ ] Unit 4 — Log-secret scan over the whole run: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-023` → read `.astra/pack/TASK-023.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-023` → `task.py done TASK-023` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- All 16 SPEC acceptance checks pass against the running stack
- 0 secrets in captured logs

## Out of scope
- Fixing defects (filed against owning tasks)
