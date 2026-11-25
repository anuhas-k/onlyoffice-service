# TASK-014 — Test UI: dev login, upload, file list, open editor, version history
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** frontend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-056 (part), FR-014, FR-016 (demonstration)
**Skills:** clean-code, bug-prevention, frontend-engineer
**Sabotage:** none — static dev UI, no security rule of its own
**Status, dependencies, drop:** see `STATUS.md` → TASK-014

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-056 (part), FR-014, FR-016 (demonstration)
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § Scope — In (test UI)
- `docs/api.md` (from TASK-008; D2 endpoints per SPEC § API Contracts)
- `docs/SRS.md` § 2.4 (Chrome + Firefox)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Login (dev user picker) + token storage in memory | SPEC Scope | `tests/ui/login.spec.ts` |
| 2 | Upload + file list with lock holder (polls) | SPEC Scope | `tests/ui/files.spec.ts` |
| 3 | Open editor (loads DS api.js, mounts config) + version history panel | SPEC Scope | `tests/ui/editor.spec.ts` |

## Files — owned exclusively by this task
- `public/index.html` (create)
- `public/app.js` (create)
- `public/styles.css` (create)
- `tests/ui/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Login: test first · green · committed
- [ ] Unit 2 — Upload + file list with lock holder: test first · green · committed
- [ ] Unit 3 — Open editor: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-014` → read `.astra/pack/TASK-014.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-014` → `task.py done TASK-014` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Two browser windows (Chrome, Firefox) can co-edit one file through the UI
- No download control visible during editing

## Out of scope
- Revoke, anchor view, recovery notice (TASK-021)
- Static serving registration (TASK-015 integration owns src/routes.ts)
