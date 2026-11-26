# TASK-011 — WOPI host: CheckFileInfo, GetFile, PutFile, locks, idempotent saving
> **WOPI change (DEC-001 draft, `docs/decisions/003-wopi-primary-editing-path.md`):** this brief was rewritten for WOPI. `docs/SRS.md` v0.2 and `docs/INTERFACE_AGREEMENT.md` were reworded to match (both await re-sign).

<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (7 units)   **Tier:** large (SE-N)
**Satisfies:** FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-040, FR-052, NFR-002, NFR-004
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer, pbt
**Sabotage:** required — access-token check, lock check before write and file-signature check are security rules
**Design:** Reference implementation: `demo-wopi/src/wopi.js` (tested, `.docx` saving only). Order of checks, all before any side effect: (1) access token valid (TASK-010) and bound to the file in the path, else 401; (2) file not deleted, else 404; (3) write operations need a `write` token, else 403. Endpoints: CheckFileInfo `GET /wopi/files/:id`; GetFile `GET …/contents` (decrypts via the gateway); PutFile `POST …/contents` with `X-WOPI-Override: PUT`; lock operations `POST /wopi/files/:id` (LOCK, UNLOCK, REFRESH_LOCK, UNLOCK_AND_RELOCK, GET_LOCK; 409 with `X-WOPI-Lock` and `X-WOPI-LockFailureReason` on mismatch; 501 for anything else). PutFile: `X-WOPI-Lock` must equal the live lock, else 409; the bytes must match the file type signature, else 400; hash + lock id dedup, so a repeat creates nothing; commit via gateway, then 200 with `X-WOPI-ItemVersion`; any failure → 500 with no partial version. Base ≠ head → kind `conflict`. The last save before UNLOCK is promoted to `milestone`. Participants come from `X-WOPI-Editors`. Proof keys run in log-only mode (byte order unconfirmed). Handlers live in `src/modules/wopi/`; TASK-017 adds presence, close detection and revoke.
**Status, dependencies, drop:** see `STATUS.md` → TASK-011

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-040, FR-052, NFR-002, NFR-004
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/003-wopi-primary-editing-path.md`; `docs/decisions/001-onlyoffice-editing-service.md` § D2 (principles only: write before ack, 500 to retry, hash dedup, outbox) and § D4 (late save)
- `demo-wopi/ADD-WOPI-GUIDE.md` § Steps 2–5, § 7 (what WOPI does not give you), § 10 (storage)
- `demo-wopi/API-v0.2.1.md` § 4 (WOPI endpoints), § 12 (measured behaviour)
- `docs/SRS.md` § 4.3 Save sequence

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Trust checks: access token, file binding, write permission (FR-026–028) | ADD-WOPI-GUIDE Step 1, § 5 | `tests/modules/wopi/trust.test.ts` |
| 2 | CheckFileInfo + GetFile (FR-029) | ADD-WOPI-GUIDE Steps 2–3 | `tests/modules/wopi/read.test.ts` |
| 3 | Locks: LOCK / UNLOCK / REFRESH_LOCK / UNLOCK_AND_RELOCK / GET_LOCK, 409 + headers, 501 for the rest (FR-030, FR-031) | ADD-WOPI-GUIDE Step 4 | `tests/modules/wopi/locks.test.ts` |
| 4 | PutFile: lock match, signature check, commit checkpoint (FR-032) | ADD-WOPI-GUIDE Step 5 | `tests/modules/wopi/putfile.test.ts` |
| 5 | UNLOCK promotes the last save to milestone; forcesave-on-close hook for TASK-017 (FR-033, FR-034) | ADR-003 AC-4 | `tests/modules/wopi/milestone.test.ts` |
| 6 | Idempotency + failure → 500 (FR-035–037), property test on repeated PutFile | ADR D2.2, D2.4 | `tests/modules/wopi/idempotency.test.ts` |
| 7 | Conflict version when base ≠ head (FR-040) | ADR D4 | `tests/modules/wopi/conflict.test.ts` |

## Files — owned exclusively by this task
- `src/modules/wopi/wopi.routes.ts` (create)
- `src/modules/wopi/wopi.service.ts` (create)
- `src/modules/wopi/trust.ts` (create)
- `src/modules/wopi/locks.ts` (create)
- `src/modules/wopi/putfile.ts` (create)
- `src/modules/wopi/index.ts` (create)
- `tests/modules/wopi/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Trust checks: access token, file binding, write permission: test first · green · committed
- [ ] Unit 2 — CheckFileInfo + GetFile: test first · green · committed
- [ ] Unit 3 — Locks: test first · green · committed
- [ ] Unit 4 — PutFile: test first · green · committed
- [ ] Unit 5 — UNLOCK promotes milestone: test first · green · committed
- [ ] Unit 6 — Idempotency + failure → 500: test first · green · committed
- [ ] Unit 7 — Conflict version when base ≠ head: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-011` → read `.astra/pack/TASK-011.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-011` → `task.py done TASK-011` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Missing / forged / expired access token, or a token for another file → nothing created, 401
- PutFile without the live lock, or with a wrong lock id → 409 with `X-WOPI-Lock`, nothing created
- PutFile whose bytes are not a valid file of that type → 400, head unchanged
- Repeated PutFile with the same bytes → 200, version count unchanged
- DB down during PutFile → 500; retry after recovery → exactly one version
- PutFile for a 10 MB file handled p95 < 5 s (NFR-002) measured in an integration test
- Unsupported WOPI operation → 501

## Out of scope
- Presence, close detection, forcesave/drop, revoke (TASK-017)
- Forgotten-file reconciler (TASK-018, on hold until WOPI behaviour is tested)
- The ONLYOFFICE callback endpoint (dropped from the primary path, DEC-001)
