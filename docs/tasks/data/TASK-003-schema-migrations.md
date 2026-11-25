# TASK-003 — Schema + migrations (all tables, constraints)
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** data
**Kind:** batch (4 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-024, FR-035, FR-048, FR-053 (uniqueness rules); SRS §3.4 data rules
**Skills:** clean-code, bug-prevention, backend-engineer, database-engineer
**Sabotage:** required — adds the version immutability guard (trigger refusing UPDATE/DELETE of committed version content)
**Status, dependencies, drop:** see `STATUS.md` → TASK-003

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-024, FR-035, FR-048, FR-053 (uniqueness rules); SRS §3.4 data rules
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `SPEC.md` § Technical Approach → Data Model
- `docs/SRS.md` § 3.4 Data Requirements
- `docs/decisions/001-onlyoffice-editing-service.md` § D2.4 (idempotency key); § D3; § D4; § D5

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Migration 1 — tenants, users, files, file_keys (+ seed: 2 tenants, 3 dev users) | SPEC Data Model | `tests/data/identity-files.test.ts` |
| 2 | Migration 2 — versions (kind enum, UNIQUE(file_id, document_key, content_sha256), immutability trigger), doc_keys | SPEC Data Model, ADR D2.4 | `tests/data/versions.test.ts` |
| 3 | Migration 3 — locks (one per file), participants | ADR D4 | `tests/data/locks.test.ts` |
| 4 | Migration 4 — outbox, anchor_batches UNIQUE(tenant_id, window_start), anchor_leaves | ADR D5 | `tests/data/anchoring.test.ts` |

## Files — owned exclusively by this task
- `drizzle.config.ts` (create)
- `src/db/schema.ts` (create)
- `drizzle/` (create — migrations)
- `src/db/seed.ts` (create)
- `tests/data/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Migration 1: test first · green · committed
- [ ] Unit 2 — Migration 2: test first · green · committed
- [ ] Unit 3 — Migration 3: test first · green · committed
- [ ] Unit 4 — Migration 4: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-003` → read `.astra/pack/TASK-003.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-003` → `task.py done TASK-003` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Each uniqueness rule in SRS §3.4 is refused by the database (one test per rule)
- UPDATE of a committed version's content/hash/blob_path is refused by the database
- The immutability trigger still allows `versions.salt` to be set to NULL (crypto-shred, plan-check G5)
- `retention-runs`: n/a — checkpoint purge deferred (SRS TBD-004)

## Out of scope
- Repositories / services (owned by each module task)
