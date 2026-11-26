# TASK-017 — Revoke mid-session, close detection, lock sweeper
> **WOPI change (DEC-001 draft, `docs/decisions/003-wopi-primary-editing-path.md`):** reworked for WOPI. The Document Server sends no editor-left signal and no PutFile on Save, so this task adds close detection and forcesave-on-close. Behaviour measured on 8.2.2: drop → UNLOCK after about 2 minutes; forcesave → PutFile in seconds.

<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-041, FR-042, FR-043, FR-044, FR-045
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer
**Sabotage:** required — revocation is an authorization rule
**Design:** Revoke: set participants.revoked_at, expire that user's access token for the file (every later WOPI call → 401) and send command `drop` for the user; revoke timing is **unmeasured** (the demo has no revoke path), so the 10 s target in AC-12 is a hypothesis to test in unit 1. Refuse that user a new session for the file while the session lives. Close detection (from `demo-wopi/src/wopi.js`): the page sends a heartbeat and a leave beacon; `UI_Close` calls leave with `wait`; the sweeper treats a missing heartbeat past the presence TTL as left. On last-user-left: `forcesave` (PutFile arrives in seconds), promote to milestone, then `drop` so the Document Server unlocks. Backstop sweeper every 60 s: expired lease → command `info`; release only if DS reports the document gone; DS unreachable → keep the lock (fail closed).
**Status, dependencies, drop:** see `STATUS.md` → TASK-017

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-041, FR-042, FR-043, FR-044, FR-045
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/003-wopi-primary-editing-path.md` (AC-4, AC-11, AC-12 rows); `docs/decisions/001-onlyoffice-editing-service.md` § D4 (Abandonment); § D1 (revocation via drop)
- `demo-wopi/ADD-WOPI-GUIDE.md` § 7 (what WOPI does not give you; command service)
- `demo-wopi/API-v0.2.1.md` § 12 (measured timings)
- `SPEC.md` § API Contracts (`DELETE …/participants/:userId`)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | `DELETE /files/:id/sessions/current/participants/:userId` + drop (FR-043, FR-045) | SPEC API Contracts | `tests/modules/sessions/revoke.test.ts` |
| 2 | Rejoin refused: open refused + token expired + re-drop on the next heartbeat (FR-044) | SRS FR-044 | `tests/modules/sessions/rejoin.test.ts` |
| 3 | Close detection: heartbeat, leave, presence sweep, forcesave → milestone → drop; lock backstop sweeper (FR-041, FR-042) | ADR D4, ADR-003 AC-4 | `tests/modules/sessions/sweeper.test.ts` |

## Files — owned exclusively by this task
- `src/modules/sessions/revoke.routes.ts` (create)
- `src/modules/sessions/revoke.service.ts` (create)
- `src/modules/sessions/sweeper.ts` (create)
- `src/modules/wopi/presence.ts` (create — heartbeat, leave, presence sweep)
- `tests/modules/sessions/revoke.test.ts` (create)
- `tests/modules/sessions/rejoin.test.ts` (create)
- `tests/modules/sessions/sweeper.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — `DELETE /files/:id/sessions/current/participants/:userId` + drop: test first · green · committed
- [ ] Unit 2 — Rejoin refused: open refused + token expired + re-drop: test first · green · committed
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
- Revoked user's next WOPI call → 401 and the editor is dropped; the measured time is recorded (target 10 s, unverified); other editors unaffected
- Last user closes → one milestone version; measured close-to-milestone time recorded (replaces the 10 s claim in AC-4 until measured)
- Tab closed without Close → sweeper ends the session after the presence TTL
- Expired lease with DS still holding → lock kept
- DS unreachable → lock kept

## Out of scope
- Job registration (TASK-022 integration)
