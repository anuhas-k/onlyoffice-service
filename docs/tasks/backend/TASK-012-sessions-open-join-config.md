# TASK-012 — Sessions: open/join, locks + lease, editor config, view-only rules
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (4 units)   **Tier:** large (SE-N)
**Satisfies:** FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, NFR-001
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer
**Sabotage:** required — signed editor config (DS JWT) and lock exclusivity guard
**Design:** Lock acquire/join is one transaction with `SELECT … FOR UPDATE` on the lock row: no lock → create (holder onlyoffice, lease +30 min, key from key service); onlyoffice holder → join same key, renew lease; other holder type → view-only. Mode downgraded to view for: other holder, over size limit (25 MB docx / 10 MB xlsx), view-only format; fillable PDF → form-fill. Config: coEditing.mode fast, permissions.download=false, print=false, user {id,name}, short-lived JWT signed with DS secret. Service exposes renewLease / releaseLock / rotateKey / setParticipants for the callback task.
**Status, dependencies, drop:** see `STATUS.md` → TASK-012

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, NFR-001
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D4; § D3; § D6 (limits)
- `SPEC.md` § API Contracts (`POST /files/:id/sessions`); § Performance Constraints
- `docs/decisions/002-documentserver-verification.md` (TASK-002 findings)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Lock repo: acquire / join / renew / release (concurrency test: 10 parallel opens → one lock, one key) | ADR D4 | `tests/modules/sessions/locks.test.ts` |
| 2 | Mode rules: holder, size, format, PDF form-fill, deleted file → 410 (FR-017–021) | ADR D4, D6 | `tests/modules/sessions/mode.test.ts` |
| 3 | Editor config builder + signing (FR-014, FR-016) | SRS §3.2 | `tests/modules/sessions/editor-config.test.ts` |
| 4 | `POST /files/:id/sessions` (FR-013, FR-015) + open-time measurement (NFR-001) | SPEC API Contracts | `tests/modules/sessions/open.test.ts` |

## Files — owned exclusively by this task
- `src/modules/sessions/sessions.routes.ts` (create)
- `src/modules/sessions/sessions.service.ts` (create)
- `src/modules/sessions/locks.repo.ts` (create)
- `src/modules/sessions/editor-config.ts` (create)
- `tests/modules/sessions/locks.test.ts` (create)
- `tests/modules/sessions/mode.test.ts` (create)
- `tests/modules/sessions/editor-config.test.ts` (create)
- `tests/modules/sessions/open.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Lock repo: acquire / join / renew / release: test first · green · committed
- [ ] Unit 2 — Mode rules: holder, size, format, PDF form-fill, deleted file → 410: test first · green · committed
- [ ] Unit 3 — Editor config builder + signing: test first · green · committed
- [ ] Unit 4 — `POST /files/:id/sessions`: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-012` → read `.astra/pack/TASK-012.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-012` → `task.py done TASK-012` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Second user gets the same key; lease renewed
- 12 MB xlsx → view config, no lock
- Config has download disabled and coEditing fast

## Out of scope
- Revoke + sweeper (TASK-017)
- Callback handling (TASK-011)
