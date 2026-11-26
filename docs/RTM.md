# Requirements Traceability Matrix
Project: word-editor-zkp — ONLYOFFICE editing service (prototype)
Version: 0.1 · Date: 2026-11-25 · Author: BA (with anuhas, SE) · Status: Approved 2026-11-25
Source of requirements: `docs/SRS.md` v0.1 · Task index: `STATUS.md` § Task List · Briefs: `docs/tasks/`

> Requirement → task → test. Task→task edges live only in `STATUS.md` (TGR). QA test-case IDs are filled by QA
> in `qa/TEST_CASES.md` (`req:` tags); until then the Test column names the automated test each brief commits to.
> Status: Planned → Built → Tested (PASS).

| Req | Title | Priority | Verification | Task(s) | Test (planned) | QA TC | Status |
|-----|-------|----------|--------------|---------|----------------|-------|--------|
| FR-001 | Single-command start | Must | Demonstration | TASK-002, TASK-008 | TASK-002 suite<br>`scripts/stack-smoke.sh run` | — | Planned |
| FR-002 | Healthy report | Must | Test | TASK-006, TASK-008 | TASK-008 suite<br>`tests/modules/health/healthz.test.ts` | — | Planned |
| FR-003 | Unhealthy report | Must | Test | TASK-006 | `tests/modules/health/healthz.test.ts` | — | Planned |
| FR-004 | Refuse to start without secrets | Must | Test | TASK-001 | `tests/foundation/config.test.ts` | — | Planned |
| FR-005 | Require a user token | Must | Test | TASK-001, TASK-004, TASK-008 | TASK-001 suite<br>TASK-008 suite<br>`tests/modules/auth/verify.test.ts` | — | Planned |
| FR-006 | Tenant isolation | Must | Test | TASK-004 | `tests/modules/auth/tenant.test.ts` | — | Planned |
| FR-007 | Prototype dev login | Must | Test | TASK-004, TASK-008 | TASK-008 suite<br>`tests/modules/auth/dev-token.test.ts` | — | Planned |
| FR-008 | Upload creates the initial version | Must | Test | TASK-007, TASK-008 | TASK-007 suite<br>TASK-008 suite | — | Planned |
| FR-009 | Reject unsupported or disguised formats | Must | Test | TASK-007 | TASK-007 suite | — | Planned |
| FR-010 | Reject oversized uploads | Must | Test | TASK-007 | TASK-007 suite | — | Planned |
| FR-011 | File list with lock state | Must | Test | TASK-007, TASK-008 | TASK-007 suite<br>TASK-008 suite | — | Planned |
| FR-012 | File details | Must | Test | TASK-007, TASK-008 | TASK-007 suite<br>TASK-008 suite | — | Planned |
| FR-013 | Open for editing | Must | Test | TASK-012, TASK-015 | TASK-015 suite<br>`tests/modules/sessions/open.test.ts` | — | Planned |
| FR-014 | No download during editing | Must | Test + Demonstration | TASK-012, TASK-014 | TASK-014 suite<br>`tests/modules/sessions/editor-launch.test.ts` | — | Planned |
| FR-015 | Join the existing session | Must | Test | TASK-012 | `tests/modules/sessions/open.test.ts` | — | Planned |
| FR-016 | Live co-editing with names | Must | Demonstration | TASK-012, TASK-014 | TASK-014 suite<br>`tests/modules/sessions/editor-launch.test.ts` | — | Planned |
| FR-017 | View-only when another engine holds the lock | Should | Test | TASK-012 | `tests/modules/sessions/mode.test.ts` | — | Planned |
| FR-018 | View-only above the size limit | Must | Test | TASK-012 | TASK-012 suite | — | Planned |
| FR-019 | Format modes | Must | Test | TASK-012 | TASK-012 suite | — | Planned |
| FR-020 | PDF form filling | Must | Demonstration | TASK-012 | TASK-012 suite | — | Planned |
| FR-021 | Refuse to open deleted files | Must | Test | TASK-012, TASK-019 | TASK-012 suite<br>TASK-019 suite | — | Planned |
| FR-022 | Serve content for a valid token (GetFile) | Must | Test | TASK-010, TASK-015 | TASK-010 suite<br>TASK-015 suite | — | Planned |
| FR-023 | Reject bad access tokens | Must | Test | TASK-010 | TASK-010 suite | — | Planned |
| FR-024 | Tokens are unforgeable and bound | Must | Test (property-based) | TASK-003, TASK-010 | TASK-003 suite<br>TASK-010 suite | — | Planned |
| FR-025 | Trust only accepted locks | Must | Test | TASK-010 | TASK-010 suite | — | Planned |
| FR-026 | Verify the access token on every call | Must | Test | TASK-011, TASK-015 | TASK-015 suite<br>`tests/modules/wopi/trust.test.ts` | — | Planned |
| FR-027 | Reject writes without the live lock | Must | Test | TASK-011 | TASK-011 suite | — | Planned |
| FR-028 | Reject bytes that are not the file type | Must | Test | TASK-011 | TASK-011 suite | — | Planned |
| FR-029 | Editing activity keeps the session alive | Must | Test | TASK-011 | `tests/modules/wopi/read.test.ts` | — | Planned |
| FR-030 | Final save becomes a milestone | Must | Test | TASK-011, TASK-015 | `scripts/stack-smoke.sh run`<br>`tests/modules/wopi/milestone.test.ts` | — | Planned |
| FR-031 | Release the lock after a milestone | Must | Test | TASK-011 | `tests/modules/wopi/milestone.test.ts` | — | Planned |
| FR-032 | Force-save becomes a checkpoint | Must | Test | TASK-011 | `tests/modules/wopi/putfile.test.ts` | — | Planned |
| FR-033 | Close without changes | Must | Test | TASK-011 | `tests/modules/wopi/milestone.test.ts` | — | Planned |
| FR-034 | Save errors keep the lock | Must | Test | TASK-011 | `tests/modules/wopi/milestone.test.ts` | — | Planned |
| FR-035 | Ignore duplicate saves | Must | Test | TASK-003, TASK-011 | TASK-003 suite<br>`tests/modules/wopi/idempotency.test.ts` | — | Planned |
| FR-036 | Ignore unchanged content | Must | Test | TASK-011 | TASK-011 suite | — | Planned |
| FR-037 | Fail loudly so the save is retried | Must | Test | TASK-011 | TASK-011 suite | — | Planned |
| FR-038 | Recover forgotten saves (ON HOLD) | Must | Test | TASK-018, TASK-022 | TASK-022 suite<br>`tests/modules/callback/reconciler.test.ts` | — | Planned |
| FR-039 | Notify editors of a recovery | Could | Test | TASK-018, TASK-021 | `tests/modules/callback/recovery-notice.test.ts`<br>`tests/ui/recovery.spec.ts` | — | Planned |
| FR-040 | Late saves become conflicts | Should | Test | TASK-011 | `tests/modules/wopi/conflict.test.ts` | — | Planned |
| FR-041 | Release abandoned locks | Must | Test | TASK-017, TASK-022 | TASK-022 suite<br>`tests/modules/sessions/sweeper.test.ts` | — | Planned |
| FR-042 | Keep locks the Document Server still holds | Must | Test | TASK-017 | `tests/modules/sessions/sweeper.test.ts` | — | Planned |
| FR-043 | Revoke mid-session | Must | Test + Demonstration | TASK-017, TASK-022 | TASK-022 suite<br>`tests/modules/sessions/revoke.test.ts` | — | Planned |
| FR-044 | Revoked users cannot rejoin | Must | Test | TASK-017 | `tests/modules/sessions/rejoin.test.ts` | — | Planned |
| FR-045 | Revoke with no session | Must | Test | TASK-017 | `tests/modules/sessions/revoke.test.ts` | — | Planned |
| FR-046 | Version history | Must | Test | TASK-013, TASK-015 | TASK-013 suite<br>TASK-015 suite | — | Planned |
| FR-047 | Open an old version | Should | Test | TASK-013 | TASK-013 suite | — | Planned |
| FR-048 | Versions are immutable | Must | Test + Inspection | TASK-003, TASK-005 | TASK-003 suite<br>TASK-005 suite | — | Planned |
| FR-049 | Encrypt per file | Must | Test + Inspection | TASK-005 | TASK-005 suite | — | Planned |
| FR-050 | Crypto-shred on delete | Must | Test | TASK-005, TASK-019, TASK-022 | TASK-005 suite<br>TASK-022 suite<br>`tests/modules/files/delete.test.ts` | — | Planned |
| FR-051 | Proofs survive deletion | Must | Test | TASK-005, TASK-020 | TASK-005 suite<br>`tests/modules/anchoring/api.test.ts` | — | Planned |
| FR-052 | Record post-save work atomically | Must | Test | TASK-005, TASK-011, TASK-020 | TASK-005 suite<br>TASK-011 suite<br>`tests/modules/anchoring/outbox.test.ts` | — | Planned |
| FR-053 | Hourly per-tenant roots | Must | Test | TASK-003, TASK-020, TASK-022 | TASK-003 suite<br>TASK-022 suite<br>`tests/modules/anchoring/batch.test.ts` | — | Planned |
| FR-054 | Salted leaves | Must | Test | TASK-005, TASK-020 | TASK-005 suite<br>`tests/modules/anchoring/merkle.test.ts` | — | Planned |
| FR-055 | Roots and proofs on request | Must | Test (property-based) | TASK-020, TASK-022 | TASK-022 suite<br>`tests/modules/anchoring/api.test.ts` | — | Planned |
| FR-056 | Test UI covers the flow | Must | Demonstration | TASK-014, TASK-015, TASK-021, TASK-022 | TASK-014 suite<br>TASK-015 suite<br>TASK-021 suite<br>TASK-022 suite | — | Planned |
| NFR-001 | Performance efficiency: open time | — | Test (timed, ≥ 20 opens) | TASK-012, TASK-023 | `tests/e2e/perf.test.ts`<br>`tests/modules/sessions/open.test.ts` | — | Planned |
| NFR-002 | Performance efficiency: save time | — | Test (timed, ≥ 20 saves) | TASK-011, TASK-023 | TASK-011 suite<br>TASK-023 suite | — | Planned |
| NFR-003 | Performance efficiency: capacity | — | Test | TASK-023 | TASK-023 suite | — | Planned |
| NFR-004 | Reliability: zero lost saves | — | Test (fault injection) | TASK-011, TASK-018, TASK-023 | TASK-011 suite<br>TASK-018 suite<br>`tests/e2e/faults.test.ts` | — | Planned |
| NFR-005 | Reliability: recovery time | — | Test | TASK-018, TASK-023 | TASK-018 suite<br>TASK-023 suite | — | Planned |
| NFR-006 | Reliability: fault isolation | — | Test (stop each component) | TASK-023 | TASK-023 suite | — | Planned |
| NFR-007 | Security: no cross-file or cross-tenant leakage | — | Test (property-based + negative) | TASK-010 | TASK-010 suite | — | Planned |
| NFR-008 | Security: secrets never logged | — | Test (capture all logs over a full end-to-end run; search for every issued secret) | TASK-001, TASK-023 | `tests/e2e/log-secrets.test.ts`<br>`tests/foundation/logger.test.ts` | — | Planned |
| NFR-009 | Security: encryption at rest | — | Test + Inspection | TASK-005 | TASK-005 suite | — | Planned |
| NFR-010 | Security: input validation | — | Test (malformed input per operation) | TASK-001, TASK-023 | `tests/e2e/malformed-input.test.ts`<br>`tests/foundation/errors.test.ts` | — | Planned |
| NFR-011 | Maintainability: storage seam | — | Inspection + Test (gateway contract tests run against the local implementation) | TASK-005 | `tests/modules/storage/contract.test.ts` | — | Planned |
| NFR-012 | Maintainability: test coverage | — | Inspection | TASK-001 | TASK-001 suite | — | Planned |
| NFR-013 | Flexibility: scale-out readiness | — | Test | TASK-006 | `tests/modules/ds-client/command.test.ts` | — | Planned |
| NFR-014 | Compatibility | — | Demonstration | TASK-002 | TASK-002 suite | — | Planned |

## SPEC acceptance check → requirement
See `docs/SRS.md` § 6.2a — every AC-1…AC-16 maps to ≥ 1 requirement above; TASK-023 proves each AC end to end.

## Gap log
- Requirements with no task: **none**
- Tasks with no requirement: **none** — every brief has a `**Satisfies:**` line; review tasks TASK-009/016/024 verify every requirement of their drop.
- Open: TBD-006 (Document Server behaviour on the pinned version) is resolved by TASK-002 before TASK-012 starts.

## Sign-off
| Role | Name | Date | Status |
|------|------|------|--------|
| SE (owner) | anuhas | 2026-11-25 | Approved |
| QA (acting) | anuhas (SE) | 2026-11-25 | Approved |
| BA (acting) | anuhas (SE) | 2026-11-25 | Approved |
