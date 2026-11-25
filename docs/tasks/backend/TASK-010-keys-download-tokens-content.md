# TASK-010 — Document keys, download tokens, file content endpoint
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-022, FR-023, FR-024, FR-025, NFR-007
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer, pbt
**Sabotage:** required — HMAC key derivation, token signing/expiry/binding are security rules
**Design:** Key = base64url(HMAC-SHA256(KEY_SECRET, fileId:versionId)) cut to 20 chars of the DS charset; recorded in doc_keys; any key not found in doc_keys for that file is refused. Download token = HMAC-signed {fileId, versionId, key, exp=+5 min}, compared in constant time; file id in the path must equal the token's fileId. Expired / tampered / mismatched → 401 InvalidToken, zero bytes returned.
**Status, dependencies, drop:** see `STATUS.md` → TASK-010

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-022, FR-023, FR-024, FR-025, NFR-007
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D3; § D1 (5-min signed URL)
- `SPEC.md` § API Contracts (`GET /files/:id/content`)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Key service: derive, record, resolve key→file (property test: no collisions, charset, ≤128) | ADR D3 | `tests/modules/sessions/keys.test.ts` |
| 2 | Download token sign/verify (property test: tamper any byte → refused) | ADR D1 | `tests/modules/sessions/download-token.test.ts` |
| 3 | `GET /files/:id/content?t=` — decrypted bytes via gateway | SPEC API Contracts | `tests/modules/files/content.test.ts` |

## Files — owned exclusively by this task
- `src/modules/sessions/keys.ts` (create)
- `src/modules/sessions/download-token.ts` (create)
- `src/modules/files/content.routes.ts` (create)
- `tests/modules/sessions/keys.test.ts` (create)
- `tests/modules/sessions/download-token.test.ts` (create)
- `tests/modules/files/content.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Key service: derive, record, resolve key→file: test first · green · committed
- [ ] Unit 2 — Download token sign/verify: test first · green · committed
- [ ] Unit 3 — `GET /files/:id/content?t=`: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-010` → read `.astra/pack/TASK-010.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-010` → `task.py done TASK-010` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Token for file A on file B's path → 401, no bytes
- Token older than 5 min → 401

## Out of scope
- Session/lock logic (TASK-012)
