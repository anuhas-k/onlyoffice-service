# TASK-025 — WOPI verification spike: Word, close timing, PutFile retry, forgotten files, revoke
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->
> **WOPI change (DEC-001 draft, `docs/decisions/003-wopi-primary-editing-path.md`):** new task added for the WOPI editing path.

**Category:** infra
**Kind:** batch (4 units)   **Tier:** medium (SE-N)
**Satisfies:** AC-4, AC-8, AC-12 (measurement); TBD-006, TBD-007; ASM-003, ASM-004
**Skills:** clean-code, bug-prevention, backend-engineer
**Sabotage:** none — verification record only
**Design:** Run the open questions from ADR-003 against the stack from TASK-002 and record measured results. Nothing here is assumed: each unit ends with a number or a yes/no and the Document Server version it was measured on. Reuse the demo's host (`demo-wopi/`) as the test host where it helps. Results decide AC-4/AC-12 wording, whether FR-038 / TASK-018 is built, and whether DEC-001 is accepted.
**Status, dependencies, drop:** see `STATUS.md` → TASK-025

## Sources — the task's knowledge, nothing else
- `docs/decisions/003-wopi-primary-editing-path.md` § Open before accepting
- `docs/SRS.md` § TBD-006, TBD-007, ASM-003, ASM-004
- `demo-wopi/API-v0.2.1.md` § 12; `demo-wopi/ADD-WOPI-GUIDE.md` § 7, § 11

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | One real Microsoft Word / Office on the web session against a WOPI host: open, edit, save, lock behaviour | ADR-003 open item 1 | `docs/decisions/004-wopi-verification.md` § Word |
| 2 | Close-to-milestone time: Close button and tab close, with forcesave-on-close, over ≥ 10 runs | ADR-003 open item 2 | `docs/decisions/004-wopi-verification.md` § Close timing |
| 3 | Fault injection: stop the host during a session; does the Document Server retry PutFile, and does `getForgottenList` list the WOPI document? | ADR-003 open item 3 | `docs/decisions/004-wopi-verification.md` § Retry and forgotten files |
| 4 | Revoke timing: expire a token and `drop`; time until the editor is disconnected | ADR-003 open item 4 | `docs/decisions/004-wopi-verification.md` § Revoke |

## Files — owned exclusively by this task
- `docs/decisions/004-wopi-verification.md` (create)
- `scripts/wopi-spike.sh` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — One real Microsoft Word / Office on the web session against a WOPI host: open, edit, save, lock behaviour: test first · green · committed
- [ ] Unit 2 — Close-to-milestone time: Close button and tab close, with forcesave-on-close, over ≥ 10 runs: test first · green · committed
- [ ] Unit 3 — Fault injection: stop the host during a session; does the Document Server retry PutFile, and does `getForgottenList` list the WOPI document?: test first · green · committed
- [ ] Unit 4 — Revoke timing: expire a token and `drop`; time until the editor is disconnected: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-025` → read `.astra/pack/TASK-025.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-025` → `task.py done TASK-025` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Negative path covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Each question answered with a measured value or a stated yes/no, the Document Server version and the date
- A line in the record for each of AC-4, AC-12, FR-038 and DEC-001 saying what the result changes
- If Word cannot be tested (no Office on the web access), the record says so and DEC-001 stays a draft

## Out of scope
- Building the fixes the results call for (the owning tasks do that)
