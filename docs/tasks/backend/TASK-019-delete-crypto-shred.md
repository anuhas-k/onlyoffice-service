# TASK-019 — Delete file: drop editors, crypto-shred
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (2 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-050, FR-021 (deleted state), TBD-003
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer
**Sabotage:** required — key destruction is a crypto rule
**Design:** TBD-003 decided: if a session is open, send `drop` for every participant, close the session, then destroyKey; mark file deleted. Later WOPI calls for the file (GetFile, PutFile, locks) are refused as file-not-found (file deleted), and its access tokens stop working. Idempotent: deleting twice → 204.
**Status, dependencies, drop:** see `STATUS.md` → TASK-019

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-050, FR-021 (deleted state), TBD-003
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § API Contracts (`DELETE /files/:id`)
- `docs/decisions/001-onlyoffice-editing-service.md` § D5 (crypto-shredding)
- `docs/SRS.md` § 6.3 TBD-003

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | `DELETE /files/:id` — shred (FR-050) | SPEC API Contracts | `tests/modules/files/delete.test.ts` |
| 2 | Delete while editing — drop all, then shred; later save refused | SRS TBD-003 | `tests/modules/files/delete-while-editing.test.ts` |

## Files — owned exclusively by this task
- `src/modules/files/delete.routes.ts` (create)
- `src/modules/files/delete.service.ts` (create)
- `tests/modules/files/delete.test.ts` (create)
- `tests/modules/files/delete-while-editing.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — `DELETE /files/:id`: test first · green · committed
- [ ] Unit 2 — Delete while editing: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-019` → read `.astra/pack/TASK-019.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-019` → `task.py done TASK-019` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- After delete no version decrypts (raw disk + MASTER_KEY)
- Open after delete → 410 FileDeleted

## Out of scope
- Anchor proof survival (TASK-020)
