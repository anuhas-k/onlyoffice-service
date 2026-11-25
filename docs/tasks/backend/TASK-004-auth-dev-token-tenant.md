# TASK-004 — Auth: dev token issuer, user-JWT verify, tenant scoping
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (3 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-005, FR-006, FR-007
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer, pbt
**Sabotage:** required — user-JWT verification and tenant scoping are security rules
**Design:** Deny by default: every non-public route needs a valid HS256 user JWT (`sub`, `tenant`, `name`, `exp`); algorithm pinned, `none` refused. Every file lookup goes through one `findFileForTenant(fileId, tenant)` helper that returns not-found for another tenant's file — no route queries files directly. Dev token issuer exists only when `DEV_LOGIN=true`.
**Status, dependencies, drop:** see `STATUS.md` → TASK-004

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-005, FR-006, FR-007
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § Security Requirements (Authentication, Authorization); § API Contracts (`POST /dev/token`)
- `docs/decisions/001-onlyoffice-editing-service.md` § D1 (Auth paragraph; endpoint 13)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | `POST /dev/token` (WHERE dev login enabled) — FR-007 | SPEC API Contracts | `tests/modules/auth/dev-token.test.ts` |
| 2 | User-JWT verify hook plugged into the foundation guard — FR-005 | SRS FR-005 | `tests/modules/auth/verify.test.ts` |
| 3 | Tenant-scoped file lookup helper — FR-006 (property test: random tenant pairs never cross) | SRS FR-006 | `tests/modules/auth/tenant.test.ts` |

## Files — owned exclusively by this task
- `src/modules/auth/` (create)
- `tests/modules/auth/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — `POST /dev/token`: test first · green · committed
- [ ] Unit 2 — User-JWT verify hook plugged into the foundation guard: test first · green · committed
- [ ] Unit 3 — Tenant-scoped file lookup helper: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-004` → read `.astra/pack/TASK-004.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-004` → `task.py done TASK-004` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Missing / expired / `alg:none` / wrong-secret token → 401
- Another tenant's file id → 404 FileNotFound
- Dev token route absent when DEV_LOGIN is not true

## Out of scope
- Route registration in src/routes.ts (TASK-008 integration)
