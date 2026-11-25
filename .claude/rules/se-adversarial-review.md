---
paths:
  - "qa/CODE_REVIEW.md"
  - "qa/HANDOFF.md"
  - "qa/SECURITY_AUDIT.md"
  - ".astra/reviews/**"
  - "**/CODE_REVIEW*.md"
---
# se-adversarial-review.md — SE-side adversarial review + security audit (v7.9.69)
# Auto-installed for every project.
# Loaded whenever current_user_role ∈ {SE, SE-Backend, SE-Frontend,
#   SE-Contract, TL, CTO, Senior Engineer}.
#
# Source: docs/plans/ASTRA-GSD-GAP-ANALYSIS.md §2.4 + §2.5.
# Closes the SE-side pre-QA gap.

---

## SCR — SE Code Review (adversarial pass before QA)

### SCR-A — Phase 4 completion demands a code review before handoff (HARD BLOCK)

`code-review-required-before-handoff.sh` HARD BLOCKS writes to
`qa/HANDOFF.md` when:

1. `qa/CODE_REVIEW.md` is missing, OR
2. `.astra/code-review.json` verdict != `PASS`, OR
3. `qa/CODE_REVIEW.md` older than newest src/** file mtime.

**Bypass:** `/astra-code-review` after resolving S1/S2 findings.
No env-var override.

### SCR-B — Review dimensions (8 severity-classed)

**S1 — Critical (auto-file bug, blocks handoff):** Security, data
loss, auth bypass.

**S2 — High (auto-file bug, blocks handoff):** BE-K error class,
silent fallback (BE-B), contract drift (response ≠ api.md — including a
new or changed endpoint in the diff with no matching `docs/api.md` update,
**BE-W**; and, against a provided API doc, any missing or added request/response
field — **FCT-H**), broken transactions (BE-E).

**S3 — Medium (advisory):** Rule violations of FE-A / FE-B / FE-E /
FE-J / BE-Q / BE-R / BE-T / BE-U (best algorithm + right design pattern
— quadratic loop smells, switch-on-type, God class, pattern with no
trigger, a request scalar coerced with `Number()` / `parseInt()`
instead of matched against `/^\d+$/` first; escalates to S2 on a
request handler over unbounded input — a coerced `req.query` / `req.params`
scalar always is). BE-U is also hook-enforced (`backend-pattern-lint.sh`)
and its prose is R-1-benchmarked (`docs/plans/R-1-RULE-BENCHMARK-RESULTS.md`).
Plus pattern drift, N+1 / perf smell, and SD-6 reuse-ladder violations
(re-implementing what the codebase / stdlib / an already-installed dep already
provides — a hand-rolled debounce / clone / UUID / date-diff, a new dependency
for a one-liner). An **unmarked shortcut** — a shipped shortcut missing its
`shortcut: <limit>, <when to upgrade>` marker, so `/debt` can never surface it —
is an S3 finding on a changed file, escalating to **S2** when the shortcut sits
on a security or data path. SD-6 is also hook-enforced
(`shortcut-debt-lint.sh`); the ledger is `/debt` → `docs/DEBT.md`. A completed
endpoint task with no `/verify` evidence in `qa/reports/verify-*.md` (**BE-W** —
an endpoint is not done until it is verified and its `docs/api.md` matches what
shipped) is an S3 finding on the changed file, escalating to **S2** on a
security or money path.

**S4 — Low (advisory):** Typos, dead imports, style nits.

### SCR-C — Auto-file S1/S2 to qa/bugs.json

Every S1 and S2 finding lands in `qa/bugs.json` with:
`category: "code_review"`, `assignee: <se-backend|se-frontend|
se-contract>`, evidence `<file>:<line>`. Deduped by exact title.

### SCR-D — Fixer mode (`--fix`)

`/astra-code-review --fix` applies patches for findings marked
`Auto-fixable: yes` (S3 nits primarily). Each fix commits
atomically. S1/S2 require human confirmation. Contract code
(`src/**.sol`) never auto-fixes without an ADR.

### SCR-E — Follow-up hooks section

Every review report ends with a "Follow-up Hooks" section — findings
that an existing hook SHOULD have caught. Feeds continuous
hook-strengthening. Each follow-up becomes a `category: "hook_gap"`
bug against the hook maintainer.

### SCR-F — Code review runs at the END of every medium+ dev task, not only before handoff

SCR-A gates `qa/HANDOFF.md`. But the handoff write is not the only place a
coding task ends — a medium-tier backend/frontend task can be finished, marked
`[DONE]`, and committed without ever reaching a HANDOFF.md write, and then no
adversarial pass ever ran. SCR-F closes that: **the closing step of any
backend / frontend / developer code task of tier `medium` or `large` is
`/astra-code-review`.** It runs *before* the role declares the task complete,
marks it `[DONE]` in STATUS.md, or commits — not deferred to the handoff.

- **Which tasks (ceremony-scaling SE-N):** `medium` (31–150 LOC, 4–10 files,
  or any security/schema touch) and `large` (new feature / new capability /
  Phase 4). `trivial` and `small` SKIP the agent — a one-line fix is not
  grilled (SE-N; running a subagent on a typo is the ceremony-bloat the user
  reverted). Security touches and new features upgrade the tier, so they are
  always reviewed. The `astra-code-review` agent self-checks the tier and
  no-ops at trivial/small.
- **What it produces:** `qa/CODE_REVIEW.md` + `.astra/code-review.json`
  (verdict), exactly as SCR-A/B/C describe. S1/S2 findings auto-file to
  `qa/bugs.json` and must be resolved or exempted before the task is "done".
- **The task is not done while the verdict is `BLOCK`.** A `BLOCK` verdict on
  the closing review is the same stop signal as an open S1 — fix the findings,
  re-run `/astra-code-review`, then close the task.
- **Endpoint completeness (BE-W) is part of the closing pass.** For a task that
  added or changed an endpoint, the review confirms `docs/api.md` matches the
  shipped contract (undocumented / drifted → **S2** contract drift) and that
  `/verify` evidence exists in `qa/reports/verify-*.md` (missing → **S3**, S2 on
  a security / money path). An endpoint is not done until it is verified and
  documented — `templates/.claude/rules/backend-patterns.md` §BE-W.
- **Enforcement — two arms.** (1) `code-review-required-before-task-done.sh`
  (v7.9.134, the per-task arm) HARD BLOCKS the `STATUS.md` write that flips a
  medium+ `TASK-NNN` to `[DONE]` unless a fresh passing review covers its diff (in
  factory runs: that task's own `.astra/reviews/TASK-NNN.json`) —
  so **`[DONE]` ⟺ reviewed**, and a task cannot unblock queued tasks or
  reach the PR past an un-reviewed change. This is what makes the factory's
  auto-continue safe (factory-mode.md FCT-B/D). (2) `code-review-required-before-handoff.sh`
  (SCR-A) HARD BLOCKS the `qa/HANDOFF.md` write as the backstop. Trivial/small
  non-security tasks skip both (SE-N). SCR-F is the discipline that makes the
  role run the review as the closing step; the two hooks make skipping it
  impossible — at the task-close, not only at handoff.

The SE agents carry this in their POST-FLIGHT / Definition of Done; the
`backend-engineer` / `frontend-engineer` skills carry it in their
ceremony-scaling table and DoD. This rule is the one they cite.

### SCR-G — The review runs zero-context, not in the authoring session

`astra-code-review` reviews the diff **as a fresh reader**, not as the engineer who
wrote it. It is spawned as a subagent whose context is the **diff + the docs the diff
cites** (`docs/api.md`, SPEC/SRS, `INTERFACE_AGREEMENT.md`, the rule sets) — and
**NOT** the authoring conversation, a summary of what the author intended, or "here's
what I was going for". The author holds the whole change in their head; the reviewer
who never heard the reasoning catches the assumption the author baked in and can no
longer see — which is the entire point of a second pass. This is the zero-context
review discipline in `templates/.claude/rules/grilling.md` (GRL-F), and the severity
mapping is the same contract both directions: a **Blocker / Major / Nit** is ASTRA's
**S1 / S2 / S3** (SCR-B). The review also leads with what is wrong, missing, or risky
before any merit — no validating adjectives for the code under review, every asserted
claim met with its strongest counter-argument (GRL-F, critique-first). If the harness
cannot give the reviewer a fresh context, say so: a review run inside the authoring
session is not a zero-context review and inherits the blind spot it was meant to catch.

---

## SSR — SE Security Audit (threat mitigation verification)

### SSR-A — Ship demands a passing security audit (HARD BLOCK)

`security-audit-required-before-ship.sh` HARD BLOCKS ship commands
(`git push origin main`, `gh pr create`, `gh release create`,
`git tag`, `git push --tags`, `npm/bun/yarn/pnpm publish`,
`cargo publish`, `forge script --broadcast`, `docker push`) when:

1. `qa/SECURITY_AUDIT.md` is missing, OR
2. `.astra/security-audit.json` verdict != `PASS`, OR
3. Audit is older than newest src/** modification.

**Bypass:** `/astra-security-audit` after mitigating findings.
No env-var override.

### SSR-B — Threat sources

The audit combines two sources:

1. **SPEC.md §5 Risks** — each `R-N` entry with its "Mitigate:"
   clause. Every threat gets a MITIGATED / PARTIAL / MISSING verdict.
2. **Universal surface scans** — 20+ auto-checks that fire on every
   audit regardless of SPEC.md:

**Auth surface:** write endpoints have auth · no Bearer over
non-HTTPS · JWT signature verified (not just decoded) · passwords
hashed with argon2id / bcrypt cost >= 10 · session cookies flagged
Secure + HttpOnly + SameSite=Lax|Strict.

**Input surface:** file uploads with MIME sniff + size limit ·
parameterised SQL · no shell/exec/eval on user input.

**Data surface:** no secrets in source (gitleaks compose) · no PII
in logs · rate limits on register / login / verify-email /
verify-phone / password-reset / magic-link-request · CORS not `*`
on auth endpoints.

**Crypto surface:** no Math.random for tokens · no MD5/SHA1 for
password / integrity · no hardcoded IV / nonce.

### SSR-C — Verdict shape

Each threat → `MITIGATED | PARTIAL | MISSING`. Audit verdict is
PASS only when every threat is MITIGATED OR explicitly EXEMPTED
with a written reason in the Exemptions section of
qa/SECURITY_AUDIT.md.

Exemption row shape:
```markdown
- **R-4 (2026-07-01, by @reviewer):** No CSRF token on /api/v1/log
  is intentional — it's an unauthenticated write-only telemetry
  endpoint. Rate-limited, cannot mutate user state.
```

An exemption without an author + ISO date + business reason is
invalid — the audit hook will refuse.

### SSR-D — Composes with existing security hooks (does not replace)

- `slither-gate.sh` — Solidity-specific. security-audit reads its
  verdict; doesn't re-run slither.
- `secret-scan.sh` (gitleaks) — auto-surface scan trusts gitleaks.
- `sast-semgrep.sh` — auto-surface scan trusts Semgrep findings.
- `dep-vuln-scan.sh` (osv-scanner) — the audit lists open HIGH+ CVEs
  from the last run in the "Follow-up hooks" section.
- `license-compliance.sh` — same treatment.

### SSR-E — What DOES NOT fire the audit

- Local dev commits.
- `git push` to feature branches (only `origin main`/`master` fires).
- CI-only automated commits (bot-authored).
- PRs opened for discussion (only `gh release`, tags, and mainline
  pushes trigger the gate).

---

## Composition — where these two agents fit

```
[se-*]  finish Phase 4 tasks
    ↓  every task [DONE]
[astra-code-review]      SCR-A gate — writes qa/CODE_REVIEW.md
    ↓  verdict=PASS
[astra-security-audit]   SSR-A gate — writes qa/SECURITY_AUDIT.md
    ↓  verdict=PASS
[handoff]  writes qa/HANDOFF.md    ← blocked by SCR-A
    ↓
[qa-reviewer + qa-*]  runtime QA
    ↓
[devops (Phase 7 ship)]            ← blocked by SSR-A
```

## See also

- `agents/astra-code-review.md`
- `agents/astra-security-audit.md`
- `scripts/hooks/code-review-required-before-handoff.sh` (SCR-A — handoff backstop)
- `scripts/hooks/code-review-required-before-task-done.sh` (SCR-F — per-task arm, blocks [DONE] without a passing review)
- `scripts/hooks/security-audit-required-before-ship.sh`
- `docs/plans/ASTRA-GSD-GAP-ANALYSIS.md` §2.4 + §2.5
- Sister rules: `pattern-mapper.md` (PMR-A..E),
  `plan-check.md` (PCR-A..E),
  `grilling.md` (GRL-F — the zero-context review discipline SCR-G cites)
