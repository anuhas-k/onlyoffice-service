# TASK-008 — Integration D1: register auth/files/health routes + docs/api.md v0.1
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** integration
**Kind:** batch (3 units)   **Tier:** small (SE-N)
**Satisfies:** FR-001, FR-002, FR-005, FR-007, FR-008, FR-011, FR-012
**Skills:** clean-code, backend-engineer, architecture-engineer
**Sabotage:** none — wiring only; the guard it relies on is sabotaged in TASK-001/004
**Status, dependencies, drop:** see `STATUS.md` → TASK-008

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-001, FR-002, FR-005, FR-007, FR-008, FR-011, FR-012
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § API Contracts
- `docker-compose.yml` (TASK-002)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Register D1 routes in `src/routes.ts` | SPEC API Contracts | `tests/integration/d1-routes.test.ts` |
| 2 | `docs/api-v0.1.md` + `docs/api.md` pointer — D1 endpoints, from code (BE-W) | SPEC API Contracts | `astra-doc-verify` |
| 3 | Stack smoke: compose up → /healthz 200 → dev token → upload → list | SRS FR-001 | `scripts/stack-smoke.sh run` |

## Files — owned exclusively by this task
- `src/routes.ts` (edit)
- `docs/api-v0.1.md` (create)
- `docs/api.md` (create)
- `tests/integration/d1-routes.test.ts` (create)
- `.astra/smoke-requests.json` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Register D1 routes in `src/routes.ts`: test first · green · committed
- [ ] Unit 2 — `docs/api-v0.1.md` + `docs/api.md` pointer: test first · green · committed
- [ ] Unit 3 — Stack smoke: compose up → /healthz 200 → dev token → upload → list: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-008` → read `.astra/pack/TASK-008.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-008` → `task.py done TASK-008` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Every D1 endpoint in docs/api.md exists in code and vice versa
- Local deploy check passes for D1

## Out of scope
- Business logic changes
