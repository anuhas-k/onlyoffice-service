# TASK-017 — Revoke mid-session + lock sweeper
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-041, FR-042, FR-043, FR-044, FR-045
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer
**Sabotage:** required — revocation is an authorization rule
**Design:** Revoke: set participants.revoked_at, send command `drop` for that user (≤ 10 s), and refuse that user any new session config for the file while the session lives. Rejoin with an old config: the config JWT is short-lived, and a status-1 callback that lists a revoked user triggers `drop` again (adds to the callback status-1 handler). Sweeper every 60 s: expired lease → command `info`; release only if DS reports the key gone; DS unreachable → keep the lock (fail closed).
**Status, dependencies, drop:** see `STATUS.md` → TASK-017

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-041, FR-042, FR-043, FR-044, FR-045
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D4 (Abandonment); § D1 (revocation via drop)
- `SPEC.md` § API Contracts (`DELETE …/participants/:userId`)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | `DELETE /files/:id/sessions/current/participants/:userId` + drop (FR-043, FR-045) | SPEC API Contracts | `tests/modules/sessions/revoke.test.ts` |
| 2 | Rejoin refused: open refused + status-1 re-drop (FR-044) | SRS FR-044 | `tests/modules/sessions/rejoin.test.ts` |
| 3 | Lock sweeper job (FR-041, FR-042) | ADR D4 | `tests/modules/sessions/sweeper.test.ts` |

## Files — owned exclusively by this task
- `src/modules/sessions/revoke.routes.ts` (create)
- `src/modules/sessions/revoke.service.ts` (create)
- `src/modules/sessions/sweeper.ts` (create)
- `src/modules/callback/status-handlers.ts` (edit — status-1 re-drop of revoked users)
- `tests/modules/sessions/revoke.test.ts` (create)
- `tests/modules/sessions/rejoin.test.ts` (create)
- `tests/modules/sessions/sweeper.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — `DELETE /files/:id/sessions/current/participants/:userId` + drop: test first · green · committed
- [ ] Unit 2 — Rejoin refused: open refused + status-1 re-drop: test first · green · committed
- [ ] Unit 3 — Lock sweeper job: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-017` → read `.astra/pack/TASK-017.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-017` → `task.py done TASK-017` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Revoked user dropped within 10 s; other editors unaffected
- Expired lease with DS still holding → lock kept
- DS unreachable → lock kept

## Out of scope
- Job registration (TASK-022 integration)
