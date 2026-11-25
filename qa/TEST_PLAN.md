# Test Plan
<!-- ISO/IEC/IEEE 29119-2:2021 §7 structure. All 9 top-level sections -->
<!-- (##1 .. ##9) are HARD BLOCK requirements. Enforced at Phase 5    -->
<!-- entry by qa-test-plan-29119-required.sh (TPS-C).                 -->

| Field | Value |
|-------|-------|
| Project | <!-- from SPEC.md --> |
| Version | <!-- from SPEC.md --> |
| Author | <!-- session role, populated by qa-setup --> |
| Reviewed by | <!-- BA / TL / QA-Lead --> |
| Date | <!-- ISO YYYY-MM-DD --> |
| Standard | ISO/IEC/IEEE 29119-2:2021 §7 |
| Status | Draft / Review / Approved |

---

## 1. Introduction

Purpose of this Test Plan (per 29119-2 §7.2). One paragraph summary of:

- **Product under test.** _(project name + one-line description)_
- **Scope of this plan.** _(release / sprint / milestone this covers)_
- **References.** SPEC.md · SRS.md · INTERFACE_AGREEMENT.md · api.md · UI_SPEC.md
- **Definitions.** Any project-specific vocabulary the reader needs.
- **Version history.** Row-per-revision (date, author, change).

---

## 2. Test Items and Risks

**Test items** (per 29119-2 §7.3) — features / components / endpoints
under test:

| ID | Item | Type | Source | FR/NFR refs |
|----|------|------|--------|-------------|
| TI-1 | _e.g. Login flow_ | Feature | SPEC.md §4.1 | FR-2, FR-4 |
| TI-2 | _e.g. POST /api/v1/register_ | Endpoint | api.md | FR-1 |

**Product risks** (per 29119-2 §7.4) — what could go wrong AND how bad:

| Risk | Probability | Impact | Score | Mitigation |
|------|:-----------:|:------:|------:|------------|
| _Auth bypass in production_ | Low | Critical | 8 | IDOR probe (SEC), pen-test |
| _Payment double-charge_ | Med | High | 9 | Idempotency-Key (IDK-A), soak test |
| _Cross-tenant data leak_ | Low | Critical | 8 | RLS (RLS-A), fixture per tenant |

Scoring: 1–3 low, 4–6 medium, 7–9 high. Every risk ≥ 6 must be tied
to ≥ 1 TC in TEST_CASES.md (via `req:` linkage in RTM_COVERAGE.md).

---

## 3. Test Strategy

**Approach** (per 29119-2 §7.5):

- **Test types covered:** Functional / Performance / Security /
  Compatibility / Interaction Capability / Reliability /
  Maintainability / Flexibility.
- **Test levels:** Unit (SE-owned) · Integration · System · Acceptance.
- **Test techniques:** all 10 ISTQB techniques (BVA / EQ / DT / STT /
  PAIRWISE / ERROR_GUESS / UC / RBT / EXPLORATORY / CHECKLIST).
  Coverage tracked by `bun qa/scripts/technique-coverage.ts` (QA-T).
- **ISO/IEC 25010 characteristics:** 8 characteristics minimum 7-of-8
  covered (QSC-A..H). Coverage tracked by
  `bun qa/scripts/iso25010-coverage.ts`.
- **WCAG 2.2 Level AA** — for frontend layers only, per screen ×
  per SC. Tracked by `bun qa/scripts/wcag-coverage.ts`.
- **OWASP ASVS L1** — for services with any authenticated surface.
  Tracked by `bun qa/scripts/asvs-l1-coverage.ts` (v7.9.117).

**Entry criteria (Phase 5 entry):**

- SE smoke test passed (5 items recorded in `qa/HANDOFF.md`)
- `docs/api.md`, `docs/SRS.md`, `docs/RTM.md` all present + non-placeholder
- `qa/TEST_CASES.md` populated with real TCs (not `[NEEDS_AUTHORING]`)
- Services healthy at every declared env (dev / testnet / mainnet)
- Test accounts seeded, credentials in `qa/.env.test`
- This Test Plan approved (§9 signed)

**Exit criteria (sign-off):**

- All planned TCs executed
- Pass rate ≥ 90% (project may raise threshold in this section)
- **0 open S1/S2 bugs** in `qa/bugs.json`
- `qa/RTM_COVERAGE.md` PASS (RTM-A..D)
- `qa/ISO25010_COVERAGE.md` PASS ≥ 7/8 (QSC-C)
- `qa/WCAG_COVERAGE.md` PASS (frontend layers) (WCG-E,F)
- `qa/reports/security/*` present + < 24h old (QA-SEC)
- `qa/HANDOFF.md` §9 signed by QA + PM

---

## 4. Test Deliverables

Artifacts this plan produces (per 29119-2 §7.6):

| Deliverable | Source | Owner | Frequency |
|-------------|--------|-------|-----------|
| `qa/TEST_CASES.md` | This plan | QA | Once + per-change |
| `qa/RTM_COVERAGE.md` | `rtm-srs-coverage.ts --update` | QA | Auto per sign-off |
| `qa/ISO25010_COVERAGE.md` | `iso25010-coverage.ts --update` | QA | Auto per sign-off |
| `qa/WCAG_COVERAGE.md` | `wcag-coverage.ts --update` | QA | Auto per sign-off (frontend) |
| `qa/TEST_DESIGN_TECHNIQUES.md` | `technique-coverage.ts --update` | QA | Auto per sign-off |
| `qa/API_COVERAGE.md` | `api-coverage.ts --report` | QA | Auto per sign-off |
| `qa/bugs.json` + `qa/BUG_REPORT.md` | Test runs + `bugs-render.sh` | QA | Continuous |
| `qa/reports/<run-id>/execution.log` | Test runners | QA | Per run |
| `qa/reports/ui-ux/screens/<slug>.json` | 6-pillar audit + WCAG walk | QA / Designer | Per sign-off |
| `qa/reports/security/*` | `run-security-checklist.sh` | QA / SecOps | Per sign-off |
| `qa/SIGNOFFS.json` | `astra-write signoff-record` | QA | Per environment |
| `qa/HANDOFF.md` | This plan + all above | QA + PM | End of phase |

---

## 5. Test Tasks and Resources

**WBS** (per 29119-2 §7.7). One row per major task, with effort +
owner + tooling.

| Task | Effort (h) | Owner | Tools |
|------|-----------:|-------|-------|
| Author TCs from SPEC + api.md | _e.g. 8h_ | _name_ | text editor |
| Author WCAG checklist grid | _e.g. 4h_ | _name_ | wcag-coverage.ts |
| Execute smoke gauntlet | _e.g. 2h_ | _name_ | `bash scripts/pre-qa-smoke.sh` |
| Execute regression suite | _e.g. 6h_ | _name_ | Playwright / WDIO / Maestro |
| Execute security checklist | _e.g. 4h_ | _name_ | `run-security-checklist.sh` |
| Execute 6-pillar UI audit | _e.g. 6h_ | _name_ | `run-uiux-audit.sh` |
| File + retest bugs | _e.g. 4h_ | _name_ | `qa-retest.sh` |
| Generate coverage reports | _e.g. 1h_ | _name_ | Coverage `--update` scripts |
| Draft HANDOFF.md + sign-off | _e.g. 2h_ | QA + PM | text editor |

**Team assignments** — role → name → primary/backup:

| Role | Primary | Backup |
|------|---------|--------|
| QA Lead | _name_ | _name_ |
| QA-Web | _name_ | _name_ |
| QA-Mobile | _name_ | _name_ |
| QA-Desktop | _name_ | _name_ |
| SE-Frontend liaison | _name_ | _name_ |
| PM | _name_ | _name_ |

---

## 6. Test Environmental Needs

Environments (per 29119-2 §7.8). One row per environment declared in
the sign-off matrix.

| Env | URL / target | Purpose | Credentials |
|-----|--------------|---------|-------------|
| dev | http://localhost:3000 | Development | `qa/.env.test.dev` |
| testnet | https://testnet.example.com | Internal QA / TestFlight | `qa/.env.test.testnet` |
| mainnet | https://example.com | Production / App Store | `qa/.env.test.mainnet` |

**Test accounts** — from `qa/.env.test` OR seed script:

| Role | Email | Notes |
|------|-------|-------|
| _admin_ | `admin+qa@…` | Auto-approved, MFA off |
| _user_  | `qa-user-${RUN_ID}@…` | Per-run ephemeral |
| _pending-officer_ | `qa-officer+…` | Requires admin approval before login |

**Secrets management:** `qa/.env.test*` files live only on QA laptops
+ CI secrets store. NEVER commit. Rotation cadence: 180 days
(SRL-A). Vault / SM integration per `docs/SECRETS.md` (VAI-A).

**Third-party sandboxes:** _(Stripe test / SendGrid sandbox /
Auth0 dev tenant / etc. + credentials location)._

---

## 7. Test Communication

**Reporting cadence** (per 29119-2 §7.9):

- **Daily** — Slack `#qa-<project>` — pass/fail counters, blockers.
- **Weekly** — PM standup — coverage trend, top-3 risks, sign-off readiness.
- **Per-milestone** — HoE / CTO briefing — HANDOFF.md summary, residual risk.

**Stakeholders:**

| Role | Name | Contact | What they want |
|------|------|---------|----------------|
| PM | _name_ | _email_ | Pass rate, coverage, ship-readiness |
| CTO | _name_ | _email_ | Security posture, blocking risks |
| BA | _name_ | _email_ | RTM completion, requirement drift |
| SE-Frontend | _name_ | _email_ | UI bugs, WCAG failures |
| SE-Backend | _name_ | _email_ | API bugs, contract drift |
| DevOps | _name_ | _email_ | Env health, deploy blockers |

**Escalation path:** QA Engineer → QA Lead → PM → HoE → CTO.

**Dashboard:** _(link to ASTRA dashboard / Grafana / Jira board)_

---

## 8. Risk Register

**Project + schedule risks** (per 29119-2 §7.10). Distinct from product
risks in §2 — those are risks to the SOFTWARE; these are risks to the
TEST PLAN itself.

| Risk | Probability | Impact | Score | Mitigation | Owner |
|------|:-----------:|:------:|------:|------------|-------|
| Test accounts locked mid-run | Med | Med | 4 | Ephemeral accounts per RUN_ID | QA Lead |
| Test env down for > 4h | Low | High | 6 | Fallback to local docker-compose | DevOps |
| OTP delivery lag > 60s | Med | Low | 3 | Bump OTP wait to 300s, document | QA-Web |
| Blocked by dev-side gap mid-sprint | Med | High | 6 | Escalate to PM within 4h; log gap in DOC_DRIFT.md | QA Lead |
| Third-party sandbox rate limits | Med | Med | 4 | Auto-pace requests via QA-D pattern | QA |

---

## 9. Sign-off

Per 29119-2 §7.11 — sign-off block. Each row must be filled by the
literal named human, not inferred.

| Role | Name | Decision | Date | Notes |
|------|------|----------|------|-------|
| QA Lead | _name_ | Approve / Reject with conditions | YYYY-MM-DD | |
| PM | _name_ | Approve / Reject with conditions | YYYY-MM-DD | |
| BA | _name_ | Approve / Reject with conditions | YYYY-MM-DD | |
| Test Manager (opt.) | _name_ | Approve / Reject with conditions | YYYY-MM-DD | |
| CTO (release only) | _name_ | Approve / Reject with conditions | YYYY-MM-DD | |

**Decision options:**

- **Approve** — plan is complete. Phase 5 may proceed.
- **Approve with conditions** — plan is largely complete; list conditions
  under "Notes" (e.g. "add TC-042 before smoke starts").
- **Reject** — plan has structural gaps. List gaps under "Notes".

**Only Approve unlocks Phase 5.** Approve-with-conditions requires
condition-resolution in `qa/HANDOFF.md` before sign-off.

---

## Technique exemptions

_(QA-T — techniques that don't apply to this project. Row format:
`- <TAG>: N/A — <reason>. Reviewed by <name> <YYYY-MM-DD>.` Rare —
default is to cover all 10.)_

## ISO/IEC 25010 exemptions

_(QSC-C — characteristics that don't apply. Row format:
`- **<TAG> (Name):** reason. Reviewed by <name> <YYYY-MM-DD>.`
Framework allows 1 exemption without penalty (7-of-8 rule).)_
