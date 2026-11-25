# UI Test Case Authoring Guide (v7.9.121)

> **This is a guide, not a tracker.**
>
> Per v7.9.121, **all** test cases — API, UI, mobile, desktop, contract,
> anything — live in the single unified tracker at **`qa/TEST_CASES.md`**
> using the 17-column format enforced by the QA-TCF hard-block gate.
>
> This file explains how to encode UI-specific details (screens,
> selectors, screenshots, viewports, Playwright script paths) into
> those 17 columns.

---

## Why one tracker

Before v7.9.121 the framework had two files (`TEST_CASES.md` for API,
`TEST_CASES_UI.md` for UI). That created two problems:

1. **Coverage gates split** — RTM-A / QSC-A / QA-T / QA-U all had to
   parse both files. In practice they only read one, so half the
   coverage silently went unaudited.
2. **Auto-updates skipped UI** — the post-run writer only knew how to
   write back to `qa/TEST_CASES.md`. UI test results never landed in
   the tracker; the file drifted from reality.

**Unified in v7.9.121:** every TC (API or UI) lives in
`qa/TEST_CASES.md`. The hooks (`qa-testcase-tracker-required.sh`,
`qa-testcase-doc-fresh-gate.sh`, `qa-testcase-result-writer.sh`)
fire on the same file. Coverage is one number.

---

## Column mapping — UI concept → 17-column field

| UI concept | Where it goes in TEST_CASES.md | Example |
|------------|--------------------------------|---------|
| Screen name | **Test Scenario** (col 3) | `Login Page /login` |
| Screen URL / route | **Precondition** (col 6) | `App running at http://localhost:3000` |
| Data-testid / role selectors | **Test Steps** (col 7), inline `<br>` between steps | `1. Fill email input<br>Selector: getByLabel('Email')<br>2. Click Login<br>Selector: getByRole('button', name: /log in/i)` |
| Input values | **Test Data** (col 8) | `Email: user@example.com<br>Password: Valid@123` |
| Expected URL after action | **Expected Result** (col 9) | `URL: /dashboard<br>DOM: getByRole('heading', name: /dashboard/i) visible<br>Toast: "Welcome back"` |
| Screenshot path | **Remarks/Bug ID** (col 17), as `Screenshot: qa/reports/screenshots/<TC>.png` | `Screenshot: qa/reports/screenshots/TC-UI-001.png` |
| Playwright script path | **Not stored** — derived from TC-ID annotation in the spec file (existing QA-TC rule). Grep for the TC-ID to find the script. | `qa/tests/e2e/auth.spec.ts` contains `// TC-UI-001` |
| Viewport size (responsive) | **Test Data** (col 8), append line | `Viewport: 375x812 (iPhone 14)` |
| Type (E2E, Visual, Security) | **iso25010** (col 18) mostly resolves this: FUN, SEC, INT, PER | UI-E2E → `INT`, Visual/Responsive → `INT, FLE`, Security → `SEC` |
| Cross-browser matrix | Multiple rows, one per browser combo, OR one row + document in **Remarks** | `Chrome + Firefox + Safari — see Remarks` |

---

## Worked UI examples (17-column rows)

Copy these into your `qa/TEST_CASES.md` under a `### Frontend` sub-heading.

### Login — Happy Path (was TC-UI-001)

```
| FR-SEC-001 | TS-UI-001 | Login Page /login | TC-UI-001 | Login with valid credentials | App running at http://localhost:3000<br>User account 'testuser01' exists and active | 1. Navigate to /login<br>2. Fill email (getByLabel('Email'))<br>3. Fill password (getByLabel('Password'))<br>4. Click Login (getByRole('button', name: /log in/i)) | Email: testuser01@example.com<br>Password: Valid@123 | URL: /dashboard<br>DOM: getByRole('heading', name: /dashboard/i) visible<br>Toast: "Welcome back, testuser01" | <!-- auto --> | Pending | Critical | P1 | Automated | <!-- auto --> | <!-- auto --> | Screenshot: qa/reports/screenshots/TC-UI-001.png | INT, FUN | UC, EQ | POST /api/v1/login |
```

### Login — Wrong Password (was TC-UI-002)

```
| FR-SEC-001 | TS-UI-001 | Login Page /login | TC-UI-002 | Login with wrong password shows error | App running at http://localhost:3000 | 1. Navigate to /login<br>2. Fill email (getByLabel('Email'))<br>3. Fill wrong password<br>4. Click Login (getByRole('button', name: /log in/i))<br>5. Assert stay on /login | Email: testuser01@example.com<br>Password: Wrong@123 | URL: /login (no redirect)<br>DOM: getByRole('alert') visible with error text<br>Login button NOT disabled (user can retry) | <!-- auto --> | Pending | High | P1 | Automated | <!-- auto --> | <!-- auto --> | Screenshot: qa/reports/screenshots/TC-UI-002.png | SEC, INT | EQ, ERROR_GUESS | POST /api/v1/login |
```

### Unauthenticated redirect (was TC-UI-004)

```
| NFR-SEC-004 | TS-UI-002 | Route Guarding | TC-UI-004 | Unauthenticated access to /dashboard redirects to /login | App running; browser has no session cookies | 1. Clear all cookies + sessionStorage<br>2. Navigate directly to /dashboard<br>3. Assert redirected | — | URL: /login<br>DOM: login form visible | <!-- auto --> | Pending | Critical | P1 | Automated | <!-- auto --> | <!-- auto --> | Screenshot: qa/reports/screenshots/TC-UI-004.png | SEC | ERROR_GUESS, CHECKLIST | — |
```

### End-to-end flow (was TC-UI-FLOW-001)

```
| FR-KYC-001 | TS-UI-KYC | Full KYC signup flow | TC-UI-FLOW-001 | New user completes KYC end-to-end | Real test inbox reachable (for OTP delivery — AF-4) | 1. /register → fill form → submit<br>2. Retrieve OTP from real inbox<br>3. Enter OTP → verify<br>4. Fill KYC form → submit<br>5. Assert /dashboard reached | Email: kyc-<runId>@test.example.com<br>Password: Valid@123<br>NIC: 199012345V | Final URL: /dashboard<br>DOM: getByRole('heading', name: /welcome/i) visible<br>Toast: "KYC approved" | <!-- auto --> | Pending | Critical | P1 | Automated | <!-- auto --> | <!-- auto --> | Screenshot: qa/reports/screenshots/TC-UI-FLOW-001-final.png | INT, FUN, REL | UC, STT | POST /api/v1/register<br>POST /api/v1/verify-email<br>POST /api/v1/kyc/submit |
```

### Responsive / Visual (was TC-UI-VIS-001)

```
| NFR-UX-001 | TS-UI-VIS | Responsive Layout | TC-UI-VIS-001 | Login page usable at iPhone 14 viewport | App running at http://localhost:3000 | 1. Set viewport to 375x812<br>2. Navigate to /login<br>3. Assert form visible + submit reachable without scroll | Viewport: 375x812 (iPhone 14) | Form visible + usable<br>No horizontal scroll (scrollWidth ≤ innerWidth)<br>Submit button visible without scroll | <!-- auto --> | Pending | Medium | P3 | Automated | <!-- auto --> | <!-- auto --> | Screenshot: qa/reports/screenshots/TC-UI-VIS-001-mobile.png | INT, FLE, PER | CHECKLIST, EXPLORATORY | — |
```

---

## TC-ID convention (multi-token areas are OK)

The tracker accepts multi-token area names — all of these are valid:

- `TC-AUTH-001` — single-token area (API auth)
- `TC-UI-001` — single-token UI area
- `TC-UI-FLOW-001` — two-token area (UI + FLOW category)
- `TC-UI-VIS-001` — UI + Visual/Responsive category
- `TC-API-AUTH-042` — API + AUTH category

Regex: `TC(?:-[A-Z][A-Z0-9]*){1,4}-\d+`. Up to 4 dash-separated area
tokens, then `-<digits>`. Each token uppercase-alphanumeric starting
with a letter.

Convention: group related UI TCs under a shared **Test Scenario ID**
(e.g. `TS-UI-001` for all Login TCs) so the RTM view groups them.

---

## Automation column values for UI

| Value | Meaning |
|-------|---------|
| `Automated` | Playwright / Maestro / Cypress spec exists at `qa/tests/e2e/**/*.spec.*` with `// TC-XXX-NNN` annotation |
| `Semi-automated` | Spec drives the app + PAUSES for manual OTP paste (per WEB-S / QEF-A). Common for auth flows |
| `Manual` | Human runs the check by hand (e.g. a WCAG contrast pass done in DevTools) |

The tracker-required gate enforces the value is one of these three.

---

## Where UI-specific rich details live

The old `TEST_CASES_UI.md` per-TC code block had extra fields not
present in the 17-col table. They now live here:

| Old field | New home |
|-----------|----------|
| `Status:` (checkbox list) | **Status column** (col 11), one of `Passed / Failed / Blocked / Skipped / Pending` |
| `Preconditions:` (multi-line) | **Precondition column** (col 6) with `<br>` between lines |
| `Selector:` inline in steps | Include in **Test Steps** (col 7) inline like `Selector: getByLabel('Email')` |
| `Screenshot: qa/reports/...` | **Remarks column** (col 17) — `Screenshot: qa/reports/screenshots/<TC>.png` |
| `Playwright script: qa/tests/...` | **Not needed in row** — the spec file has `// TC-XXX-NNN` per QA-TC rule; `grep -r "// TC-XXX-NNN" qa/tests/` finds it |
| `Bug Report: [link]` | Handled by writer — on Failed, appends `Bug: BUG-NNN` referencing `qa/bugs.json` (col 17) |
| `Executed by:` | Auto-filled by writer (col 15) from `AGENTS.md#current_user_name` |
| `Executed on:` | Auto-filled by writer (col 16) in ISO format |

---

## Common UI test types → tag hints

For the `iso25010` and `techniques` metadata columns (18 + 19):

| UI test type | iso25010 | techniques |
|--------------|----------|------------|
| Happy-path login / dashboard render | INT, FUN | UC, EQ |
| Field validation (invalid input) | INT, FUN | EQ, ERROR_GUESS |
| Error state / toast display | INT, REL | ERROR_GUESS, STT |
| Route guard / redirect | SEC | ERROR_GUESS, CHECKLIST |
| Cross-browser / cross-viewport | INT, FLE, COM | CHECKLIST |
| Performance / load time | PER | CHECKLIST |
| WCAG contrast / a11y | INT | CHECKLIST |
| E2E flow (multi-screen) | INT, FUN, REL | UC, STT |

These aren't rigid — pick what genuinely applies. The
`iso25010-coverage.ts` probe reports 7-of-8 characteristic coverage
across the whole tracker (QSC-A / QSC-C).

---

## Hooks that fire on UI test runs

Same three hooks as API tests (unified):

1. **`qa-testcase-tracker-required.sh`** (Pre) — refuses `npx playwright test`,
   `maestro test`, `bash scripts/run-*.sh` until every row in
   `qa/TEST_CASES.md` (API + UI) is valid.
2. **`qa-testcase-doc-fresh-gate.sh`** (Pre) — refuses next run if
   previous run's results didn't update the tracker.
3. **`qa-testcase-result-writer.sh`** (Post) — parses Playwright's
   `qa/reports/**/results.json` (or the equivalent for Cypress /
   Maestro), matches each result to a TC-ID annotation in the spec,
   writes Actual Result / Status / Executed By / Execution Date /
   Remarks/Bug ID.

No UI-specific hooks needed. The universal tracker + writer handle it.

---

## Migration from old TEST_CASES_UI.md

If you have an existing `qa/TEST_CASES_UI.md` in a project:

```bash
# 1. Migrate BOTH files into the unified tracker (script handles both formats)
bun qa/scripts/migrate-testcases-to-v17.ts

# 2. Verify the merged tracker
bun qa/scripts/testcases-validate.ts --strict

# 3. Once verified, delete the old file (optional — the tracker gate
#    doesn't read TEST_CASES_UI.md any more)
mv qa/TEST_CASES_UI.md qa/TEST_CASES_UI.md.deprecated
```

The migration script preserves old TC-IDs (TC-UI-001 → TC-UI-001) and
folds their content into the correct 17-col cells.

---

## Regression suite for UI

Run after every frontend change:

```bash
# Full E2E suite — writes results.json under qa/reports/<ts>/
npx playwright test qa/tests/e2e/

# Auto-writer fires post-run and updates qa/TEST_CASES.md
# — no manual editing needed.

# Sign-off check when done:
bun qa/scripts/testcases-validate.ts --strict
```

---

## Test run history

Per-project run history is materialized in the `astra_qa_runs` table
on the central DB (via `mcp__astra__qa_run_regression`). The
per-project `qa/TEST_CASES.md` "Test Execution Summary" section holds
just the latest rollup — auto-updated by the writer.

Historical drill-down: query the dashboard, not this file.

---

## See also

- `templates/TEST_CASES.md` — the unified tracker template
- `templates/qa/scripts/testcases-validate.ts` — validator (`--strict` / `--report` / `--json`)
- `templates/qa/scripts/testcases-write-results.ts` — post-run writer
- `templates/qa/scripts/migrate-testcases-to-v17.ts` — one-shot migration
- `scripts/hooks/qa-testcase-tracker-required.sh` — PreToolUse HARD BLOCK
- `scripts/hooks/qa-testcase-doc-fresh-gate.sh` — PreToolUse staleness gate
- `scripts/hooks/qa-testcase-result-writer.sh` — PostToolUse writer
- `templates/.claude/rules/qa-patterns.md` — QA-TCF rule set
- `templates/.claude/rules/web-qa.md` — WEB-A..S UI-specific patterns
- `docs/superpowers/specs/2026-08-10-qa-testcase-hardblock-design.md` — design doc
