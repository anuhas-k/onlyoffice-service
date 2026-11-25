# TASK-009 — Review: drop D1
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** review
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** all D1 requirements
**Skills:** none — reviewers load their own
**Sabotage:** none — read-only review
**Status, dependencies, drop:** see `STATUS.md` → TASK-009

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § all D1 requirements
- `docs/INTERFACE_AGREEMENT.md` § all
- `git diff develop...HEAD`
- `docs/SRS.md`
- `SPEC.md` § Security Requirements

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Zero-context `/astra-code-review` over the D1 diff (SCR-G) | — | `qa/CODE_REVIEW.md` |
| 2 | `/astra-security-audit` (SSR-A) | — | `qa/SECURITY_AUDIT.md` |
| 3 | `/astra-doc-verify` on docs/api.md | — | `qa/DOC_VERIFY.md` |

## Files — owned exclusively by this task
- `qa/CODE_REVIEW.md` (create)
- `qa/SECURITY_AUDIT.md` (create)
- `qa/DOC_VERIFY.md` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Zero-context `/astra-code-review` over the D1 diff: test first · green · committed
- [ ] Unit 2 — `/astra-security-audit`: test first · green · committed
- [ ] Unit 3 — `/astra-doc-verify` on docs/api.md: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-009` → read `.astra/pack/TASK-009.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-009` → `task.py done TASK-009` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- No open S1/S2
- All three gates PASS

## Out of scope
- Fixing code (findings go back to the owning task)
