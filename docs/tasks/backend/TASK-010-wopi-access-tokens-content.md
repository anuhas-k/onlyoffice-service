# TASK-010 — WOPI access tokens + version content endpoint
> **WOPI change (DEC-001 draft, `docs/decisions/003-wopi-primary-editing-path.md`):** this brief was rewritten for WOPI. `docs/SRS.md` v0.2 and `docs/INTERFACE_AGREEMENT.md` were reworded to match (both await re-sign).

<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-022, FR-023, FR-024, FR-025, NFR-007
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer, pbt
**Sabotage:** required — HMAC key derivation, token signing/expiry/binding are security rules
**Design:** WOPI has no document key, so the key service is dropped. Access token = HMAC-signed {fileId, userId, mode, exp} (demo: `demo-wopi/src/wopi-tokens.js`, 1 h TTL), compared in constant time; the file id in the path must equal the token's fileId and the token is accepted from `?access_token=` or `Authorization: Bearer`. Expired / tampered / mismatched → 401, zero bytes returned. The `access_token` is a credential: never log it or a URL containing it. Version content (`GET /files/:id/versions/:vid/content?t=`) keeps the short-lived signed-URL form (5 min) for history downloads.
**Status, dependencies, drop:** see `STATUS.md` → TASK-010

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-022, FR-023, FR-024, FR-025, NFR-007
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/003-wopi-primary-editing-path.md` (AC-6, AC-9, AC-10 rows); `docs/decisions/001-onlyoffice-editing-service.md` § D1 (5-min signed URL)
- `demo-wopi/ADD-WOPI-GUIDE.md` § Step 1 (access tokens), § 5 (security checklist)
- `SPEC.md` § API Contracts (`GET /files/:id/versions/:vid/content`)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | WOPI access token: sign, verify, bind to file + user + mode (property test: tamper any byte → refused; expired → refused) | ADD-WOPI-GUIDE Step 1 | `tests/modules/sessions/wopi-token.test.ts` |
| 2 | Version-content download token sign/verify (property test: tamper any byte → refused) | ADR D1 | `tests/modules/sessions/download-token.test.ts` |
| 3 | `GET /files/:id/versions/:vid/content?t=` — decrypted bytes via gateway | SPEC API Contracts | `tests/modules/files/content.test.ts` |

## Files — owned exclusively by this task
- `src/modules/sessions/wopi-token.ts` (create)
- `src/modules/sessions/download-token.ts` (create)
- `src/modules/files/content.routes.ts` (create)
- `tests/modules/sessions/wopi-token.test.ts` (create)
- `tests/modules/sessions/download-token.test.ts` (create)
- `tests/modules/files/content.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — WOPI access token: sign, verify, bind: test first · green · committed
- [ ] Unit 2 — Download token sign/verify: test first · green · committed
- [ ] Unit 3 — `GET /files/:id/versions/:vid/content?t=`: test first · green · committed
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
- Access token for file A on file B's path → 401, no bytes
- Expired or tampered access token → 401
- A log capture of a full open + save contains no `access_token` value (AC-16)

## Out of scope
- Session/lock logic (TASK-012)
- WOPI endpoints that consume the token (TASK-011)
- Document keys and the `doc_keys` table (dropped; WOPI does not use them)
