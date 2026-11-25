---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
  - "docs/decisions/**"
  - "**/{package.json,Dockerfile,docker-compose*.yml}"
---
# scope-discipline.md — universal scope rules
# Auto-installed for every project type.
# Loaded whenever current_user_role ∈ {SE, SC, BA, PM, TL, Senior Engineer, SD, JD}.
#
# Source: Project A SE retro (2026-06-13) — 12 anti-patterns boiled
# down to 4 universal scope rules + a STOP-DOING list.
#
# The single biggest theme of the Project A retro:
#   "ASTRA-as-SE keeps building things the user did not ask for,
#    AND keeps missing things the user did ask for."
#
# Both ends of the same axis. These rules close both ends.

---

## SD-1 — Architecture-Change Gate (R-1)

> Any change that adds a new top-level package, container, or service
> requires an explicit `decision-yes` from PM/CTO recorded in
> `docs/decisions/<NNN>-<topic>.md`. No exceptions. Default scaffold
> is single-service.

### What this catches

- Splitting a working single Bun/Express/Fastify service into
  microservices "for best practice" before there's a single user.
- Adding a separate `gateway/` package because "we'll need it".
- Spinning up a new container for a function call that lives fine
  inside the main process.

### How to comply

1. Default: ONE service. ONE container. ONE deployable.
2. If you genuinely need to split, write the ADR FIRST:
   ```
   docs/decisions/001-split-auth-service.md
     ## Context
     ## Decision
     ## Consequences
   ```
3. THEN add the package.

`architecture-change-gate.sh` warns when a new top-level
package/service/Dockerfile is created without an ADR.

### Lessons from Project A (AP-1)

The project started as a single Bun service. Without explicit ask,
SE split it into 3 microservices (gateway / auth-service /
blockchain-service). Cost: ~200 LOC of inter-service proxy code,
a 503-masking bug, 3 separate test setups. None of this complexity
paid for itself.

---

## SD-2 — Ambiguous Phrase Disambiguation (R-2)

> Any feature description containing one of these phrases requires a
> 1-line clarification from PM/CTO BEFORE any code is written.

| Phrase | Two readings — pick the right one |
|--------|----------------------------------|
| "smart wallet" | (a) backend custodial EOA / managed wallet  vs  (b) frontend non-custodial (Alchemy / Privy / Web3Auth) |
| "gas sponsorship" | (a) Verifying Paymaster + backend signer  vs  (b) on-chain access-control Paymaster |
| "auth" | (a) JWT in backend  vs  (b) OAuth via provider  vs  (c) wallet-based SIWE |
| "session" | (a) server-side session store  vs  (b) JWT  vs  (c) cookie |
| "sso" | (a) we run an IdP  vs  (b) we integrate with one |
| "broadcast" | (a) backend signs+broadcasts  vs  (b) backend prepares calldata, frontend signs+broadcasts |
| "ipfs" | (a) we host a node  vs  (b) we pin via a service  vs  (c) we pin via the wallet |
| "ai integration" | (a) we own the model  vs  (b) we call an API |
| "real-time" | (a) WebSocket  vs  (b) polling  vs  (c) SSE |
| "notifications" | (a) email  vs  (b) push  vs  (c) in-app |

### How to comply

When you see one of these phrases in a spec, ask:

> "When you say 'smart wallet', do you mean (a) the backend holds
> custody and broadcasts on the user's behalf, or (b) the user holds
> custody and the backend just stores the address?"

Wait for the answer. Do not start typing.

### Lessons from Project A (AP-2)

SE wrote `onchain.service.ts` + `wallet.ts` + `updateUserWallet` +
`proxySelfRegisterOnChain` (~400 LOC) to implement backend-managed-EOA.
User had to pull back: "use Alchemy frontend, just store the address".
All deleted.

---

## SD-3 — Default to Less-Backend (R-3)

> When an implementation can either (a) live in a smart contract,
> (b) live in the frontend, or (c) live in a backend endpoint, the
> default is (a) or (b) UNLESS the user explicitly asks for the
> backend path. State the assumption out loud and wait for "yes".

### Triggers

- "Should I add an endpoint for X?" — usually no. Can the frontend
  call the contract / API directly?
- "We need a signing service for Y" — usually no. Can the user's
  wallet / their own credential do it?
- "Let's add a worker that does Z" — usually no. Can we trigger it
  from the existing request flow?

### How to comply

Before adding any backend endpoint, write one sentence:

> "I'm about to add `POST /api/v1/<thing>` because `<reason>`.
> The alternative is `<simpler placement>`. Confirm?"

If you can't articulate why backend wins, do `<simpler placement>`.

### Lessons from Project A (AP-3)

SE began designing `POST /paymaster/sponsor` with a backend signer
keypair. User: "why need this". Endpoint deleted before wired. The
simpler answer was an on-chain access-control Paymaster — no
backend at all.

---

## SD-4 — Doc Whitelist (R-4)

> The agent may create only these docs WITHOUT explicit user ask:
>
> - **Standard repo files:** README.md, CHANGELOG.md, LICENSE, CONTRIBUTING.md
> - **ASTRA-managed:** AGENTS.md, STATUS.md, SPEC.md, SOUL.md,
>   DECISIONS.md, LESSONS.md, CLAUDE.md
> - **docs/:** api.md, SRS.md, RTM.md, GLOSSARY.md, FLOW.md, INTERFACE_AGREEMENT.md,
>   CONTRACT_HANDOVER.md, UI_SPEC.md, CONTRACT-MAP.md, SYNC-REPORT.md, ARCH_SURVEY.md,
>   WAYFINDER.md, HANDOFF.md, QUESTIONNAIRE-<slug>.md, BRD.md, api-vX.Y.md
> - **ADRs:** docs/decisions/<NNN>-<topic>.md
> - **Task briefs:** docs/tasks/<category>/TASK-NNN-<slug>.md (FCT-G) · **inputs as
>   received:** docs/source/** — layout: `.claude/rules/project-structure.md`
> - **All of qa/*.md:** HANDOFF, BUG_REPORT, TEST_PLAN, TEST_CASES,
>   SHIP, HANDOFF_TO_PM, SECRETS, ON_CHAIN_QA, STATIC_ANALYSIS, etc.
> - **Framework dirs:** .claude/rules/, .claude/steering/, .planning/,
>   improvement/, learnings/, issues/, retro/, notes/, teaching/

ANY other `.md` (HANDOFF-X.md, NEW-FEATURE-PLAN.md, PROPOSAL.md,
TECH-DECISION-Y.md, RETRO-Z.md, IMPROVEMENT-W.md outside
improvement/) requires an **explicit ask from the user**.

### How to comply

When you feel "I should write a doc about this", stop and ask:

> "I'd like to create `docs/<filename>.md` because `<reason>`.
> Should I, or would the content fit better in an existing doc?"

`scope-doc-whitelist.sh` warns on every unrequested .md creation.
Use `ASTRA_DOC_WHITELIST_STRICT=1` in CLAUDE.md to upgrade to hard
block.

### Lessons from Project A (AP-4)

SE wrote `SMART-WALLET-HANDOFF.md` (~250 lines, never asked for),
plus `ASTRA-RETRO-SE-AUTOMATION.md`, `tech-decision-microservices.md`,
multiple speculative proposal docs. User repeatedly said "no need".

The framework culture rewarded artifact production. SE optimised for
"produced an MD" over "shipped working code". This rule fixes that.

---

## SD-5 — Reference Project Comparison (Project A SE retro + Proposal §6)

> When you build a feature that already exists in a reference project
> the team has shipped before, READ the reference first. Don't
> "improve" or "simplify" the reference's config — match it exactly,
> diff against it, then ship.

### What this catches

- SMTP rebuilt from scratch with wrong TLS settings — the reference
  project shipped working SMTP with `secure: false` for port 587 and
  `tls.rejectUnauthorized: false` for corporate Outlook. SE
  "simplified" by removing both, took 3 rebuilds to discover why
  emails didn't arrive.
- OAuth client-credential flow rebuilt without the reference's
  retry-on-401 wrapper.
- WebSocket reconnect with exponential backoff omitted because "we
  can add it later".

### How to comply

Before building feature X:

1. Check whether a reference project exists. The user usually points
   you at one ("there's a `reference/` dir" / "compare with how
   `auth-service` does it").
2. Read the reference's implementation for X. The relevant files
   only — config, the wire format, error handling, timeouts.
3. Diff what you're about to write against it. Match shape; don't
   "improve" config.
4. After writing, compare again: `diff -r reference/<feature> ./<feature>`
   on the relevant files. Any non-obvious deviation needs a comment
   explaining why.

### When you CAN deviate

If the reference is genuinely buggy or out of date, you fix it — but
file it as a finding for the reference project, not as a silent
deviation in yours. Future engineers reading both must understand
why they differ.

### Lessons from Project A

3 rebuilds of SMTP because nobody read the reference's
`tls.rejectUnauthorized: false` setting upfront. Cost: ~2 hours per
rebuild + the user time spent saying "email to not came" three
sessions in a row.

---

## SD-6 — Reuse-First Ladder + shortcut debt marker

> **Before writing new code, climb the reuse ladder — in order — and stop at the
> first rung that answers the need:**
>
> 1. **Does it need to exist at all?** The cheapest code is the line you don't write.
> 2. **Is it already in this codebase?** Search first; call the thing that exists.
> 3. **Is it in the language's standard library?**
> 4. **Is it in a dependency we already install?** No new dep for one function.
> 5. **Can it be one line?** Prefer the one-liner over a new abstraction.
> 6. **Otherwise, the minimum code that works** — no speculative generality.
>
> **When you take a shortcut anyway, mark it** so the debt is tracked, never silent:
>
> ```
> shortcut: <limit>, <when to upgrade>
> ```
>
> e.g. `// shortcut: in-memory rate limit, upgrade to Redis when >1 instance`.
> A marker with no upgrade condition is not a marker — it is an untracked shortcut.
>
> **Smallest ≠ cut the gate.** Climbing the ladder reduces what you *write*, never
> what the change *needs*. Making a diff smaller by dropping validation, error
> handling, authorization, or a test is not a rung on this ladder — it is a
> shortcut, and it ships with the `shortcut:` marker above or not at all. The
> framework-wide statement of this lives in `skills/clean-code/SKILL.md`
> (*Smallest Complete Change*), loaded by every engineer role; SD-6 is its
> SE-side enforcement surface.

### What this catches

- Hand-rolling a debounce / deep-clone / UUID / date-diff that the stdlib or an
  already-installed dependency provides (rungs 3–4 skipped).
- Re-implementing a helper that already exists two files over (rung 2 skipped).
- A new dependency pulled in for a one-line need (rung 5 skipped).
- A new abstraction / config layer / generic "framework" added before the simple
  version was tried (rung 1, and STOP-DOING #11).
- A deliberate shortcut shipped with no `shortcut:` marker — the debt nobody can find
  and nobody repays. `/debt` harvests every marker into `docs/DEBT.md`; an unmarked
  shortcut is invisible to that ledger.

### Enforced by

- `shortcut-debt-lint.sh` (PostToolUse, WARN; `ASTRA_SHORTCUT_DEBT_STRICT=1` = BLOCK) —
  flags a `shortcut:` marker missing its `, <when to upgrade>` half.
- `/debt` — harvests all well-formed markers into a ledger (`docs/DEBT.md`).
- Reviewer mirror: `se-adversarial-review.md` SCR-B escalates a reuse-ladder violation
  or an unmarked shortcut on a changed file.

---

## Part 2 — The STOP-DOING List

Direct list — easier to enforce than positive prescriptions. Print
this. Pin it next to where you work.

1. **DO NOT** create `.md` files outside the whitelist (SD-4) without
   an explicit ask.
2. **DO NOT** split a service into microservices without an ADR
   (SD-1).
3. **DO NOT** add backend endpoints when the work can live on-chain
   or on the frontend (SD-3).
4. **DO NOT** silently swallow errors. Every `catch` block names the
   specific error class it handles (BE-L, BE-K).
5. **DO NOT** return 500/503 for client-class errors (BE-K).
6. **DO NOT** fail-open security middleware when its backing store
   is unreachable (BE-L).
7. **DO NOT** hardcode chain ID / contract addresses / `BASE_URL` in
   any test or QA script (BE-M, QA-O).
8. **DO NOT** declare a phase done without the phase's exit gate
   green.
9. **DO NOT** defend a stale ABI / API doc by claiming the canonical
   flow doc is wrong. Always assume the deployed artifact is the
   source of truth and re-sync first.
10. **DO NOT** keep failing-to-compile test files "for later". Delete
    or fix (BE-P).
11. **DO NOT** add complexity (a new dependency, a new pattern, a new
    abstraction) before the simpler version has been tried and shown
    to fail.
12. **DO NOT** assume "best practice" means "requirement". Most best
    practices are situational.
13. **DO NOT** ship a known shortcut without a `shortcut: <limit>, <when
    to upgrade>` marker (SD-6). Untracked debt is never repaid, because
    nobody can find it.
14. **DO NOT** write new code before climbing the reuse ladder (SD-6):
    does it need to exist → already in the codebase → stdlib → an
    installed dep → one line → minimum code.

---

## See also

- `templates/.claude/rules/backend-patterns.md` — BE-K (R-7), BE-L (R-8), BE-M (R-9), BE-N (R-10), BE-O (R-11), BE-P (R-12)
- `templates/.claude/rules/qa-patterns.md` — QA-N, QA-O
- `~/.claude/skills/astra/scripts/hooks/scope-doc-whitelist.sh`
- `~/.claude/skills/astra/scripts/hooks/architecture-change-gate.sh`
- `~/.claude/skills/astra/scripts/hooks/backend-pattern-lint.sh`
- `~/.claude/skills/astra/scripts/hooks/shortcut-debt-lint.sh` (SD-6 marker format)
- `~/.claude/skills/astra/scripts/debt-harvest.sh` + `/debt` (SD-6 ledger)
- improvement/ASTRA-SE-IMPROVEMENT-FRAMEWORK.md (the source retro)
