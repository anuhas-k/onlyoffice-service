# STATUS: word-editor-zkp (collaborative editing backend — ONLYOFFICE + WOPI, Merkle anchoring)
_Sprint: 0 | Branch: develop | Updated: 2026-11-25_

Role: SE (anuhas) | Phase: 4 — Build (SPEC, SRS, RTM, Interface Agreement signed 2026-11-25 by anuhas, single-person prototype) | Mode: offline (ASTRA DB not registered)
Next: /factory run — drop D1 (TASK-001 first).
Decisions: docs/decisions/001-onlyoffice-editing-service.md (D1–D8). Microsoft 365, desktop agent, on-chain anchoring and real Bethel integration are out of scope.

---

## Phase Progress

| Phase | Status | Owner | Completed |
|-------|--------|-------|-----------|
| 1. Spec | ⬜ Todo | PM + TL | — |
| 2. Git + feature branch | ⬜ Todo | DevOps | — |
| 3. Task briefs | ⬜ Todo | TL + SD | — |
| 4. Build per task (test first) | ⬜ Todo | SD + JD | — |
| 5. Per-task code review | ⬜ Todo | SE | — |
| 6. Final review task | ⬜ Todo | SE | — |
| 7. PR → SE/TL sign-off | ⬜ Todo | SE/TL | — |
| 8. External Audit (contract only) | ⬜ N/A | CTO + auditor | — |
| 9. Production Deploy | ⬜ Todo | DevOps | — |

## Review Gates

| Gate | Verdict | Report | Updated |
|------|---------|--------|---------|
| Code review | [PASS / BLOCK / —] | `qa/CODE_REVIEW.md` (`.astra/code-review.json`) | [date] |
| Security audit | [PASS / BLOCK / —] | `qa/SECURITY_AUDIT.md` | [date] |
| Doc verify | [PASS / BLOCK / —] | `qa/DOC_VERIFY.md` | [date] |

> The board reads the `.astra/*.json` verdicts; they are the source of truth, this table only mirrors them.

> Status legend: ⬜ Todo | 🔄 In Progress | ✅ Done | 🚫 Blocked | ⬜ N/A (skip)
>
> SE coding flow (factory-mode FCT-E/G): each task is test-first and gets its own review
> (`.astra/reviews/TASK-NNN`) before it is `[DONE]`; one `review` task covers the whole
> change; a human SE/TL signs off by merging the PR into develop. QA is not a gate in the
> coding loop. Phase 8 applies to the contract mainnet path only.

---

## Baseline (filled in Phase 2)

- Branch: [astra/feature-name-YYYYMMDD]
- Tests at baseline: [X passing / Y total]
- Coverage at baseline: [Z%]
- Branch created: [timestamp]

---

## Task List

> The INDEX — status, title, brief link, edges. Nothing else lives here.
> Created by `/factory tasks`; each brief is `docs/tasks/<category>/TASK-NNN-<slug>.md`
> (sources, units, owned files, flow, SE-side QA — factory-mode.md FCT-G).
> Edges form a DAG via `**Depends on:**` (`none` when independent — silence is not
> `none`). `bun ~/.claude/skills/astra/scripts/parallel.ts` runs the rolling-pool queue (cap 10), one agent per
> brief, holding back any task whose files overlap one in flight (TGR-A..E).
> While a task is `[IN PROGRESS]`, an optional `**Stage:** test|code|review|fix` line tells
> the live board which step it is on; without it the board infers the step.
> An optional `**Priority:** P0|P1|P2|P3` line (default P2) orders the queue; a task inherits
> the best priority of any task that depends on it.

### [TODO] TASK-001 — App skeleton: config, errors, redacting logger, db client
**Task:** docs/tasks/foundation/TASK-001-app-skeleton.md
**Depends on:** none
**Drop:** D1
**Priority:** P0

### [TODO] TASK-002 — Docker Compose stack + Document Server config + verification spike
**Task:** docs/tasks/infra/TASK-002-compose-stack-ds-spike.md
**Depends on:** TASK-001
**Drop:** D1
**Priority:** P0

### [TODO] TASK-003 — Schema + migrations (all tables, constraints)
**Task:** docs/tasks/data/TASK-003-schema-migrations.md
**Depends on:** TASK-001
**Drop:** D1
**Priority:** P1

### [TODO] TASK-004 — Auth: dev token issuer, user-JWT verify, tenant scoping
**Task:** docs/tasks/backend/TASK-004-auth-dev-token-tenant.md
**Depends on:** TASK-001, TASK-003
**Drop:** D1
**Priority:** P1

### [TODO] TASK-005 — StorageGateway + per-file encryption + version commit + shred primitive
**Task:** docs/tasks/backend/TASK-005-storage-gateway-crypto.md
**Depends on:** TASK-001, TASK-003
**Drop:** D1
**Priority:** P1

### [TODO] TASK-006 — Document Server command client + DS JWT helpers + /healthz
**Task:** docs/tasks/backend/TASK-006-ds-client-health.md
**Depends on:** TASK-001
**Drop:** D1
**Priority:** P1

### [TODO] TASK-007 — Files API: upload, list (with lock state), details
**Task:** docs/tasks/backend/TASK-007-files-upload-list-get.md
**Depends on:** TASK-004, TASK-005
**Drop:** D1
**Priority:** P1

### [TODO] TASK-008 — Integration D1: register auth/files/health routes + docs/api.md v0.1
**Task:** docs/tasks/integration/TASK-008-integration-d1.md
**Depends on:** TASK-002, TASK-004, TASK-006, TASK-007
**Drop:** D1
**Priority:** P1

### [TODO] TASK-009 — Review: drop D1
**Task:** docs/tasks/review/TASK-009-review-d1.md
**Depends on:** TASK-008
**Drop:** D1
**Priority:** P1

### [TODO] TASK-010 — Document keys, download tokens, file content endpoint
**Task:** docs/tasks/backend/TASK-010-keys-download-tokens-content.md
**Depends on:** TASK-005, TASK-008
**Drop:** D2
**Priority:** P2

### [TODO] TASK-011 — ONLYOFFICE callback: trust checks + status handling + idempotent saving
**Task:** docs/tasks/backend/TASK-011-callback-trust-and-saving.md
**Depends on:** TASK-006, TASK-010, TASK-012
**Drop:** D2
**Priority:** P2

### [TODO] TASK-012 — Sessions: open/join, locks + lease, editor config, view-only rules
**Task:** docs/tasks/backend/TASK-012-sessions-open-join-config.md
**Depends on:** TASK-002, TASK-007, TASK-010
**Drop:** D2
**Priority:** P2

### [TODO] TASK-013 — Versions API: history list + old version content
**Task:** docs/tasks/backend/TASK-013-versions-list-content.md
**Depends on:** TASK-010
**Drop:** D2
**Priority:** P2

### [TODO] TASK-014 — Test UI: dev login, upload, file list, open editor, version history
**Task:** docs/tasks/frontend/TASK-014-test-ui-core.md
**Depends on:** TASK-008
**Drop:** D2
**Priority:** P2

### [TODO] TASK-015 — Integration D2: register sessions/content/callback/versions + static UI, docs/api.md v0.2
**Task:** docs/tasks/integration/TASK-015-integration-d2.md
**Depends on:** TASK-008, TASK-010, TASK-011, TASK-012, TASK-013, TASK-014
**Drop:** D2
**Priority:** P2

### [TODO] TASK-016 — Review: drop D2
**Task:** docs/tasks/review/TASK-016-review-d2.md
**Depends on:** TASK-015
**Drop:** D2
**Priority:** P2

### [TODO] TASK-017 — Revoke mid-session + lock sweeper
**Task:** docs/tasks/backend/TASK-017-revoke-and-lock-sweeper.md
**Depends on:** TASK-011, TASK-012
**Drop:** D3
**Priority:** P2

### [TODO] TASK-018 — Forgotten-file reconciler + recovery notice
**Task:** docs/tasks/backend/TASK-018-forgotten-file-reconciler.md
**Depends on:** TASK-011
**Drop:** D3
**Priority:** P2

### [TODO] TASK-019 — Delete file: drop editors, crypto-shred
**Task:** docs/tasks/backend/TASK-019-delete-crypto-shred.md
**Depends on:** TASK-005, TASK-017
**Drop:** D3
**Priority:** P2

### [TODO] TASK-020 — Anchoring: outbox worker, hourly per-tenant Merkle roots, proofs API
**Task:** docs/tasks/backend/TASK-020-anchoring-merkle.md
**Depends on:** TASK-011, TASK-019
**Drop:** D3
**Priority:** P2

### [TODO] TASK-021 — Test UI: revoke, anchor batches view, recovery banner
**Task:** docs/tasks/frontend/TASK-021-test-ui-ops.md
**Depends on:** TASK-014, TASK-017, TASK-018, TASK-020
**Drop:** D3
**Priority:** P2

### [TODO] TASK-022 — Integration D3: register revoke/delete/anchor routes + background jobs, docs/api.md v0.3
**Task:** docs/tasks/integration/TASK-022-integration-d3.md
**Depends on:** TASK-015, TASK-017, TASK-018, TASK-019, TASK-020, TASK-021
**Drop:** D3
**Priority:** P2

### [TODO] TASK-023 — End-to-end, fault-injection, performance and log-secret suite
**Task:** docs/tasks/integration/TASK-023-e2e-fault-perf-suite.md
**Depends on:** TASK-022
**Drop:** D3
**Priority:** P2

### [TODO] TASK-024 — Review: drop D3
**Task:** docs/tasks/review/TASK-024-review-d3.md
**Depends on:** TASK-023
**Drop:** D3
**Priority:** P2

---

## Blockers

> Empty = green. Add blockers as they're discovered.

_No blockers._

---

## Decisions Log

> Record mid-sprint decisions so future tasks don't re-litigate them.

| # | Decision | Rationale | Made by | Date |
|---|----------|-----------|---------|------|
| 1 | [What was decided] | [Why] | [Role] | [date] |

---

## Test Results (filled in Phase 5)

- Tests after implementation: [X passing / Y total]
- Coverage after implementation: [Z%]
- Coverage delta: [+/- N%]
- All tests green: [ ]

---

## Review Findings (filled in Phase 6)

> Per-task verdicts live in `.astra/reviews/TASK-NNN.{json,md}`; the final `review`
> task writes `qa/CODE_REVIEW.md`. Record only open S1/S2 here.

- Open S1/S2: [none / list]

---

## Gate Overrides
<!-- Populated automatically by /skip-gate. Empty = all gates respected. -->

---

## Retro Notes (filled in Phase 7)

1. **What slowed us down:**
2. **Which phase caught the most bugs:**
3. **What we'd do differently:**
4. **Pattern to add to SPEC.md template:**

---

_Last updated by: [role] | [timestamp]_
