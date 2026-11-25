# TASK-011 — ONLYOFFICE callback: trust checks + status handling + idempotent saving
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (7 units)   **Tier:** large (SE-N)
**Satisfies:** FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-040, FR-052, NFR-002, NFR-004
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer, pbt
**Sabotage:** required — callback JWT check, known-key check and download-host allowlist (SSRF) are security rules
**Design:** Order of checks, all before any side effect: (1) DS JWT valid (header or body token) else 401; (2) key in doc_keys with an open session and file not deleted else 404 UnknownDocumentKey; (3) `url` parsed with WHATWG URL, scheme http/https, host+port exactly equal to the configured DS host else 400 UntrustedDownloadHost — no redirects followed. Status 2/6: download inside the request (timeout, size cap), commit via gateway, then answer `{"error":0}`; any exception → 500 SaveFailed with no partial version. Duplicate / unchanged → `{"error":0}`, nothing created. Base ≠ head → kind `conflict`. Key rotation and lock release only after a status-2 commit. Status handlers live in `src/modules/callback/status-handlers.ts` (TASK-017 extends status 1).
**Status, dependencies, drop:** see `STATUS.md` → TASK-011

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-040, FR-052, NFR-002, NFR-004
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D2 (all, incl. Status → Action table); § D4 (late save)
- `SPEC.md` § API Contracts (`POST /onlyoffice/callback`)
- `docs/SRS.md` § 3.2 (callback interface); § 4.3 Save sequence

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Trust checks: JWT, known key, download host (FR-026–028) | ADR D2.7 | `tests/modules/callback/trust.test.ts` |
| 2 | Status 1 — participants + lease renew (FR-029) | ADR D2 table | `tests/modules/callback/status-1.test.ts` |
| 3 | Status 2 — download, milestone commit, release + rotate (FR-030, FR-031) | ADR D2.1, D2.5 | `tests/modules/callback/status-2.test.ts` |
| 4 | Status 6 — checkpoint, key kept (FR-032) | ADR D2 table | `tests/modules/callback/status-6.test.ts` |
| 5 | Status 3/4/7 (FR-033, FR-034) | ADR D2 table | `tests/modules/callback/status-other.test.ts` |
| 6 | Idempotency + failure → 500 (FR-035–037), property test on replays | ADR D2.2, D2.4 | `tests/modules/callback/idempotency.test.ts` |
| 7 | Conflict version when base ≠ head (FR-040) | ADR D4 | `tests/modules/callback/conflict.test.ts` |

## Files — owned exclusively by this task
- `src/modules/callback/callback.routes.ts` (create)
- `src/modules/callback/callback.service.ts` (create)
- `src/modules/callback/trust.ts` (create)
- `src/modules/callback/status-handlers.ts` (create — TASK-017 later extends status 1)
- `src/modules/callback/download.ts` (create)
- `src/modules/callback/index.ts` (create)
- `tests/modules/callback/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Trust checks: JWT, known key, download host: test first · green · committed
- [ ] Unit 2 — Status 1: test first · green · committed
- [ ] Unit 3 — Status 2: test first · green · committed
- [ ] Unit 4 — Status 6: test first · green · committed
- [ ] Unit 5 — Status 3/4/7: test first · green · committed
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
- Forged JWT / unknown key / foreign host → nothing created, foreign host never contacted
- Callback for a key whose file is deleted → 404 UnknownDocumentKey (not 500), so the Document Server stops retrying (FR-050, plan-check G6)
- Replayed status-2 → `{"error":0}`, version count unchanged
- DB down during status 2 → 500; retry after recovery → exactly one version
- Status-2 for a 10 MB file handled p95 < 5 s (NFR-002) measured in an integration test

## Out of scope
- Reconciler (TASK-018)
- Revoked-user re-drop on status 1 (TASK-017 adds it)
