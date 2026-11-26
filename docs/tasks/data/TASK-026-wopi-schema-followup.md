# TASK-026 — Schema follow-up for WOPI: drop doc_keys, re-key idempotency on lock id
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->
> **WOPI change (DEC-001 draft, `docs/decisions/003-wopi-primary-editing-path.md`):** new task added for the WOPI editing path.

**Category:** data
**Kind:** batch (1 units)   **Tier:** small (SE-N)
**Satisfies:** FR-024, FR-025, FR-035 (WOPI wording)
**Skills:** clean-code, bug-prevention, backend-engineer
**Sabotage:** none — schema change; no new security rule
**Design:** TASK-003 creates the callback-era schema (`doc_keys`, `UNIQUE(file_id, document_key, content_sha256)`). This task adds migration 5: drop `doc_keys`; rename `versions.document_key` to `lock_id` and re-create the unique constraint on `(file_id, lock_id, content_sha256)`; `locks.session_key` holds the WOPI lock id; keep `participants` but key it on the file and lock id. It runs after TASK-003 so the in-flight TASK-003 agent is not disturbed. Reversible: provide the down migration.
**Status, dependencies, drop:** see `STATUS.md` → TASK-026

## Sources — the task's knowledge, nothing else
- `docs/decisions/003-wopi-primary-editing-path.md` § Data model
- `SPEC.md` § Data Model; `docs/SRS.md` § FR-035, §3.4

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Migration 5 — drop doc_keys; versions.document_key → lock_id; unique (file_id, lock_id, content_sha256); locks/participants keyed on lock id | ADR-003 Data model | `tests/data/wopi-schema.test.ts` |

## Files — owned exclusively by this task
- `drizzle/` migration 5 (create)
- `src/db/schema.ts` (edit — only the affected tables)
- `tests/data/wopi-schema.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Migration 5 — drop doc_keys; versions.document_key → lock_id; unique (file_id, lock_id, content_sha256); locks/participants keyed on lock id: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-026` → read `.astra/pack/TASK-026.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-026` → `task.py done TASK-026` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Negative path covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Migration applies on a database with TASK-003's schema and rolls back cleanly
- Inserting the same (file, lock id, content hash) twice violates the constraint; a different lock id does not

## Out of scope
- Anything outside the tables named above
