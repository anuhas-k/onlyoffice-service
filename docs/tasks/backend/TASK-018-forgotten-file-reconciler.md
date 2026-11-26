# TASK-018 — Forgotten-file reconciler + recovery notice
> **WOPI change (DEC-001 draft, `docs/decisions/003-wopi-primary-editing-path.md`):** **ON HOLD.** Whether the Document Server keeps forgotten files for WOPI sessions, and whether it retries a failed PutFile, was not tested. Do not start this task until a fault-injection run answers both (stop the host during a session, restart, check `getForgottenList` and DS logs). If WOPI sessions are not covered, reduce this task to a recovery path based on forcesave plus the host's own retry.

<!-- One task = one file = one agent. Status and Depends-on live ONLY in STATUS.md (FCT-G). -->

**Category:** backend
**Kind:** batch (2 units)   **Tier:** medium (SE-N)
**Satisfies:** FR-038, FR-039, NFR-004, NFR-005
**Skills:** clean-code, bug-prevention, backend-engineer
**Sabotage:** none — reuses the callback trust and gateway dedup; no new security rule
**Design (callback-era text, valid only if the hold is lifted for the forgotten-file route):** On startup and every 5 min: getForgottenList → for each key resolvable in the session record (no doc_keys under WOPI; map by lock id), getForgotten → download from DS host only → commit kind `recovered` via gateway (dedup makes reruns no-ops). Notice (TBD-002): the recovered version records the last session's participants; a log line `recovered_version` names file + version ids; the UI shows a banner when the head is `recovered`. Unknown keys are logged and skipped.
**Status, dependencies, drop:** see `STATUS.md` → TASK-018

## Sources — the task's knowledge, nothing else
- `docs/SRS.md` § FR-038, FR-039, NFR-004, NFR-005
- `docs/INTERFACE_AGREEMENT.md` § A (Access Map), D (Identifiers), F (Error Catalog)
- `docs/decisions/001-onlyoffice-editing-service.md` § D2.3
- `docs/SRS.md` § 6.3 TBD-002
- `docs/decisions/002-documentserver-verification.md` (forgotten-files support)

## Units
| # | Unit | Contract source | Test |
|---|---|---|---|
| 1 | Reconciler run: list, fetch, commit `recovered`, idempotent (FR-038) | ADR D2.3 | `tests/modules/callback/reconciler.test.ts` |
| 2 | Recovery notice: participants + log line (FR-039) | SRS FR-039 | `tests/modules/callback/recovery-notice.test.ts` |

## Files — owned exclusively by this task
- `src/modules/callback/reconciler.ts` (create)
- `tests/modules/callback/reconciler.test.ts` (create)
- `tests/modules/callback/recovery-notice.test.ts` (create)

## Progress — tick each box the moment it is true (FCT-M); `task.py done` refuses an open box
- [ ] Unit 1 — Reconciler run: list, fetch, commit `recovered`, idempotent: test first · green · committed
- [ ] Unit 2 — Recovery notice: participants + log line: test first · green · committed
- [ ] SE-side QA checklist ticked
- [ ] /astra-code-review --task PASS on a committed head

### Review log
<!-- Round N — <date> — <head sha> — PASS|BLOCK — S1 n · S2 n — fixed: … · open: … -->

## Execution flow — every unit, in order
Follow `~/.claude/skills/astra/templates/tasks/TASK.md` § Execution flow steps 0–9 exactly: load skills → `task.py start TASK-018` → read `.astra/pack/TASK-018.md` → TDD → build → green + commit per unit → /verify → SE-side QA → sabotage (if required) → merge base + full suite → `/astra-code-review --task TASK-018` → `task.py done TASK-018` → commit.

## SE-side QA checklist
- [ ] Every unit has a test and it passes
- [ ] Field contract exact for every unit — nothing missing, nothing added (FCT-H)
- [ ] Every documented status code + error shape returned as documented
- [ ] Negative path + auth tier covered per unit
- [ ] `/verify` evidence written
- [ ] No file outside `## Files` touched; no TODO / placeholder left

## Acceptance
- Service stopped while users close → recovered version ≤ 6 min after restart (fault-injection test)
- Second run creates nothing
- A forgotten document whose file is deleted is skipped and logged, never retried (FR-050, plan-check G6)

## Out of scope
- Job registration (TASK-022)
- UI banner (TASK-021)
