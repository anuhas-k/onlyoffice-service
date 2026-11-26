# TASK-006 — Document Server command client + DS JWT helpers + /healthz
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-002, FR-003, NFR-013
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer
**Sabotage:** required — DS JWT signing/verification helpers are signature checks
**Design:** One client for `POST {DS}/command` with commands info/drop/forcesave (the close path needs forcesave then drop) and getForgottenList/getForgotten (on hold with TASK-018); every call JWT-signed and carries `?shardkey=<shard key>` (the WOPI file id; the demo's command client is `demo-wopi/src/ds-command.js`). DS JWT helpers: HS256 only, secret from config, used to sign command calls. WOPI requests are authorised by the access token (TASK-010), not this JWT; the verify helper stays only for the optional callback path. Timeouts on every call; DS unreachable → typed error, never a hang.
**Status, dependencies, drop:** see `STATUS.md` → TASK-006

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-002, FR-003, NFR-013
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D1 (Interface styles — RPC command service); § D7 (shardkey)
- `SPEC.md` § API Contracts (`GET /healthz`); § Fault Isolation Matrix
- `docs/SRS.md` § 3.2 External Interface Requirements

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | DS JWT sign/verify helpers | SRS §3.2 | `tests/modules/ds-client/jwt.test.ts` |
| 2 | Command client: info, drop, forcesave, getForgottenList, getForgotten (+ shardkey) — NFR-013 | ADR D1, D7 | `tests/modules/ds-client/command.test.ts` |
| 3 | `GET /healthz` — 200 {db, documentServer} or 503 naming the failed part (FR-002, FR-003) | SPEC API Contracts | `tests/modules/health/healthz.test.ts` |

## Files — owned exclusively by this task
- `src/modules/ds-client/` (create)
- `src/modules/health/` (create)
- `tests/modules/ds-client/` (create)
- `tests/modules/health/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — DS JWT sign/verify helpers: test first · green · committed
- [ ] Unit 2 — Command client: info, drop, forcesave, getForgottenList, getForgotten: test first · green · committed
- [ ] Unit 3 — `GET /healthz`: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-006` → read `.astra/pack/TASK-006.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-006` → `task.py done TASK-006` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Every recorded command call carries shardkey
- DS down → /healthz 503 with documentServer failed and db ok

## Out of scope
- WOPI endpoints (TASK-011)
- Route registration (TASK-008)
