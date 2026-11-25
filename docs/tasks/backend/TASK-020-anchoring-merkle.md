# TASK-020 — Anchoring: outbox worker, hourly per-tenant Merkle roots, proofs API
<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (4 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-051, FR-052, FR-053, FR-054, FR-055
**Skills:** clean-code, bug-prevention, backend-engineer, pbt
**Sabotage:** none — hashing and batching are proved by property tests; tenant scoping reuses TASK-004's helper
**Status, dependencies, drop:** see `STATUS.md` → TASK-020

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-051, FR-052, FR-053, FR-054, FR-055
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D5 (Anchoring); § D2.6 (outbox)
- `SPEC.md` § API Contracts (`GET /anchor-batches`)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Outbox worker: claim, process, mark, retry with attempts (FR-052) | ADR D2.6 | `tests/modules/anchoring/outbox.test.ts` |
| 2 | Leaf + Merkle tree + proof (property test: every proof verifies; tamper → fails) (FR-054) | ADR D5 | `tests/modules/anchoring/merkle.test.ts` |
| 3 | Hourly batch per tenant, milestones only, idempotent (FR-053) | ADR D5 | `tests/modules/anchoring/batch.test.ts` |
| 4 | `GET /anchor-batches?tenant=&from=&to=` (FR-055) + proofs survive delete (FR-051) | SPEC API Contracts | `tests/modules/anchoring/api.test.ts` |

## Files — owned exclusively by this task
- `src/modules/anchoring/` (create)
- `tests/modules/anchoring/` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Outbox worker: claim, process, mark, retry with attempts: test first · green · committed
- [ ] Unit 2 — Leaf + Merkle tree + proof: test first · green · committed
- [ ] Unit 3 — Hourly batch per tenant, milestones only, idempotent: test first · green · committed
- [ ] Unit 4 — `GET /anchor-batches?tenant=&from=&to=`: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-020` → read `.astra/pack/TASK-020.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-020` → `task.py done TASK-020` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Two tenants in one hour → two roots
- Checkpoint-only hour → no root
- Proof verifies after the file is deleted

## Out of scope
- On-chain anchoring (out of scope)
- Job registration (TASK-022)
