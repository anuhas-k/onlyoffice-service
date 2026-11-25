# TASK-015 — Integration D2: register sessions/content/callback/versions + static UI, docs/api.md v0.2
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** integration
**Kind:** batch (3 units)   **Tier:** small (SE-N)
**Satisfies:** FR-013, FR-022, FR-026, FR-030, FR-046, FR-056 (part)
**Skills:** clean-code, backend-engineer, architecture-engineer
**Sabotage:** none — wiring only
**Status, dependencies, drop:** see `STATUS.md` → TASK-015

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-013, FR-022, FR-026, FR-030, FR-046, FR-056 (part)
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § API Contracts
- `docs/api.md` (v0.1 from TASK-008)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Register D2 routes + static `public/` in `src/routes.ts` (callback and content routes public-marked, own auth) | SPEC API Contracts | `tests/integration/d2-routes.test.ts` |
| 2 | `docs/api-v0.2.md` + repoint `docs/api.md`; smoke requests for D2 endpoints | BE-W | `astra-doc-verify` |
| 3 | Stack smoke: open → edit in two windows → close → milestone in history | SRS FR-030 | `scripts/stack-smoke.sh run` |

## Files — owned exclusively by this task
- `src/routes.ts` (edit)
- `docs/api-v0.2.md` (create)
- `docs/api.md` (edit)
- `.astra/smoke-requests.json` (edit)
- `tests/integration/d2-routes.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Register D2 routes + static `public/` in `src/routes.ts`: test first · green · committed
- [ ] Unit 2 — `docs/api-v0.2.md` + repoint `docs/api.md`; smoke requests for D2 endpoints: test first · green · committed
- [ ] Unit 3 — Stack smoke: open → edit in two windows → close → milestone in history: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-015` → read `.astra/pack/TASK-015.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-015` → `task.py done TASK-015` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Every D2 endpoint documented and present
- Local deploy check passes for D2

## Out of scope
- Background jobs (TASK-022)
