# TASK-001 — App skeleton: config, errors, redacting logger, db client
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** foundation
**Kind:** batch (4 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-004, FR-005 (global guard), NFR-008, NFR-010, NFR-012 (real-Postgres test helper + fast-check setup)
**Skills:** clean-code, bug-prevention, backend-engineer, security-engineer, pbt
**Sabotage:** required — adds the global auth guard seam and the log redactor (security rules)
**Design:** Logs: one redactor at the single log exit; a field is kept only if its key is on an allowlist; values of `authorization`, `token`, `t`, `url` query strings and any JWT-shaped value are replaced — deny by default, never a pattern scrubber alone. Routes: one global preHandler refuses every route not explicitly marked public (deny by default). Config: every secret required at boot; missing → exit naming the setting, value never printed.
**Status, dependencies, drop:** see `STATUS.md` → TASK-001

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-004, FR-005 (global guard), NFR-008, NFR-010
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § Technical Approach → Dependencies; § Security Requirements
- `docs/decisions/001-onlyoffice-editing-service.md` § D1 Layering
- `SPEC.md` § API Contracts (error shape line)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Config loader — required env (DB URL, MASTER_KEY, JWT secrets, DS URL), refuse to start (FR-004) | SRS FR-004 | `tests/foundation/config.test.ts` |
| 2 | Error handler — one error shape `{error:{code,message}}`, JSON-schema validation errors → 400 (NFR-010) | SPEC API Contracts | `tests/foundation/errors.test.ts` |
| 3 | Logger + single redactor (NFR-008) — property test over generated secrets | SRS NFR-008 | `tests/foundation/logger.test.ts` |
| 4 | Fastify app factory + deny-by-default auth guard seam + public-route marker + db client (pg pool) + test Postgres helper (testcontainers) | ADR D1 Layering | `tests/foundation/app.test.ts` |

## Files — owned exclusively by this task
- `package.json` (create)
- `package-lock.json` (create)
- `tsconfig.json` (create)
- `vitest.config.ts` (create)
- `.env.example` (create)
- `src/app.ts` (create)
- `src/server.ts` (create)
- `src/config.ts` (create)
- `src/errors.ts` (create)
- `src/logger.ts` (create)
- `src/db/client.ts` (create)
- `src/routes.ts` (create — empty registration stub; integration tasks own it after this)
- `src/jobs.ts` (create — empty job-registration stub; integration tasks own it after this)
- `tests/helpers/pg.ts` (create)
- `tests/foundation/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Config loader: test first · green · committed
- [ ] Unit 2 — Error handler: test first · green · committed
- [ ] Unit 3 — Logger + single redactor: test first · green · committed
- [ ] Unit 4 — Fastify app factory + deny-by-default auth guard seam + public-route marker + db client: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-001` → read `.astra/pack/TASK-001.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-001` → `task.py done TASK-001` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Service exits non-zero naming `MASTER_KEY` when it is unset; output contains no secret value
- A route registered without the public marker returns 401 with the standard error shape
- Property test: no generated JWT / token / URL query string survives the redactor

## Out of scope
- Any business route
- Docker files (TASK-002)
- Schema (TASK-003)
