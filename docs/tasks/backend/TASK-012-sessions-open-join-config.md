# TASK-012 — Sessions: open/join, lock backstop, WOPI editor launch, view-only rules
> **WOPI change (DEC-001 draft, `docs/decisions/003-wopi-primary-editing-path.md`):** reworked for WOPI. The Document Server now drives the lock (LOCK / REFRESH_LOCK / UNLOCK arrive from it, handled in TASK-011); this task owns the host-side session record, the mode rules and the editor launch payload.

<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (4 units)   **Tier:** large (SE-N)
**Satisfies:** FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, NFR-001
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer
**Sabotage:** required — access token issuance (mode and file binding) and lock exclusivity guard
**Design:** Session record per open file (one transaction with `SELECT … FOR UPDATE` on the lock row): no lock → record created (holder `onlyoffice`, lease +30 min); onlyoffice holder → join the same session, renew lease; other holder type → view-only. Mode downgraded to view for: other holder, over size limit (25 MB docx / 10 MB xlsx), view-only format; fillable PDF → form-fill. `POST /files/:id/sessions` returns `{editorUrl, formFields (access_token, …), heartbeatMs, mode, user, title}`: the URL comes from Document Server discovery (`/hosting/discovery`, `wopisrc` uses the server-to-server address, the browser uses the public one), as in `demo-wopi/src/wopi.js`. CheckFileInfo carries `UserCanWrite`, `ClosePostMessage` and `PostMessageOrigin` so the editor's Close button reaches the page. No editor config JWT and no document key. Service exposes renewLease / releaseLock / setParticipants for TASK-011.
**Status, dependencies, drop:** see `STATUS.md` → TASK-012

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, NFR-001
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/003-wopi-primary-editing-path.md`; `docs/decisions/001-onlyoffice-editing-service.md` § D4; § D6 (limits)
- `demo-wopi/ADD-WOPI-GUIDE.md` § Steps 2 and 6 (CheckFileInfo, opening the editor)
- `SPEC.md` § API Contracts (`POST /files/:id/sessions`); § Performance Constraints
- `docs/decisions/002-documentserver-verification.md` (TASK-002 findings)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Lock repo: acquire / join / renew / release (concurrency test: 10 parallel opens → one lock, one key) | ADR D4 | `tests/modules/sessions/locks.test.ts` |
| 2 | Mode rules: holder, size, format, PDF form-fill, deleted file → 410 (FR-017–021) | ADR D4, D6 | `tests/modules/sessions/mode.test.ts` |
| 3 | Editor launch payload: discovery lookup, `wopisrc`, form fields, access token (FR-014, FR-016) | ADD-WOPI-GUIDE Step 6 | `tests/modules/sessions/editor-launch.test.ts` |
| 4 | `POST /files/:id/sessions` (FR-013, FR-015) + open-time measurement (NFR-001) | SPEC API Contracts | `tests/modules/sessions/open.test.ts` |

## Files — owned exclusively by this task
- `src/modules/sessions/sessions.routes.ts` (create)
- `src/modules/sessions/sessions.service.ts` (create)
- `src/modules/sessions/locks.repo.ts` (create)
- `src/modules/sessions/editor-launch.ts` (create)
- `tests/modules/sessions/locks.test.ts` (create)
- `tests/modules/sessions/mode.test.ts` (create)
- `tests/modules/sessions/editor-launch.test.ts` (create)
- `tests/modules/sessions/open.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Lock repo: acquire / join / renew / release: test first · green · committed
- [ ] Unit 2 — Mode rules: holder, size, format, PDF form-fill, deleted file → 410: test first · green · committed
- [ ] Unit 3 — Editor launch payload: test first · green · committed
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
- Second user joins the same session; lease renewed
- 12 MB xlsx → view mode, no lock
- Launch payload has the editor URL, a file-bound access token and no download permission (the effect of CheckFileInfo `DisableExport` is unverified, see ADD-WOPI-GUIDE § 11)
- Discovery unreachable → 502 with a named error, no session created

## Out of scope
- Revoke + sweeper (TASK-017)
- WOPI endpoints and locks (TASK-011)
