---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# Injection and Credential Safety — INJ-A..Z

**Applies to:** SE-Backend, SE-Frontend, SE-Contract, DevOps, QA (verification).
**Load at:** Phase 4 (before writing code), not only at QA sign-off.
**Composes with:** `security-asvs-l1.md` (SAV-A..N, ASVS L1 *verification*),
`backend-patterns.md`, `frontend-patterns.md`, `secrets-management.md`,
`db-safety.md`.

ASVS L1 (SAV) tells QA what to *check*. This file tells the engineer what to
*write*, and every rule below is here because it was found missing in a real
ASTRA repo — the source defect is named so the rule is arguable with evidence
rather than accepted on authority.

The shape of every rule is the same: **make the class impossible in the API,
then install a ratchet that fails on the next instance.** A rule nobody can
check is a comment.

---

## INJ-A — A value never reaches a SQL statement as text

Values go in as `$1` / `%s` parameters. Always. No exceptions for "it's just
an integer", "it's internal", or "it's a CLI".

Three positions cannot take a placeholder, and each has one legal pattern:

| Position | Legal pattern |
|---|---|
| table / column name | a whitelist (`Set.has`) or map lookup, **plus** `quoteIdent()` at the point of use |
| a `LIMIT` / `statement_timeout` that the driver will not bind | `Math.max(1, Math.min(CAP, Math.floor(Number(v))))` — a bounded integer, computed where it is pasted |
| a WHERE fragment | predicates pushed as **string literals** that carry `$N`, joined with `.join(" AND ")` |

**Why this is written as three patterns rather than "be careful":** the audit
of 2026-09-18 found ~34 interpolation sites across 8 services, all safe, each
safe for a *different* reason, and nothing watching any of them. Safety by
individual diligence decays silently.

**Two traps that look safe:**

- `LIMIT ${limit}` where `limit: number` is a TypeScript parameter. A type is
  a compile-time promise; an `any`, a JS caller, or a parsed flag defeats it.
  Coerce at the paste site.
- `Math.max(1, Math.min(500, Number(raw)))` — `Number("abc")` is `NaN`, and
  `Math.max(1, NaN)` is `NaN`. That shipped as `LIMIT NaN` → HTTP 500 for a
  month. Guard with `Number.isFinite` before clamping.

**Ratchet:** `tests/sql-injection-surface.test.ts` — classifies every `${...}`
inside a SQL literal by shape, refuses request-shaped expressions outright
(`req.`, `body`, `query[`, `headers`, `raw*`, `.email`), and requires anything
else to be reviewed **with proof in its own file**. See INJ-Z.

## INJ-B — Dynamic SQL inside the database uses %I / %L, never %s

`EXECUTE format('… %I …', ident)` for identifiers, `%L` for values. `%s`
pastes text.

`t || '_all_policy'` **inside** a `format()` argument is correct — `%I` quotes
the result. What is never acceptable is `EXECUTE 'SELECT … ' || var`, where
nothing quotes anything. A checker that flags the first shape teaches people
to add exceptions, and the exception is the hole.

## INJ-C — A statement must not skip a placeholder

If a statement uses `$1`, `$3`, `$4` and not `$2`, it is wrong however it is
called: either an argument is dead or a placeholder was mistyped. Postgres
answers `could not determine data type of parameter $2` at runtime.

**Why it needs a test:** every unit test that mocks the query helper never
hands the SQL to a planner. 4,182 green tests sat on top of this.

## INJ-D — CSP: measure the artefact, never reason from the framework's docs

Rules, in order of how often they are got wrong:

1. **`'unsafe-inline'` in `script-src` turns CSP off as an XSS control.** It is
   worth removing only if it can actually be removed.
2. **Next.js App Router cannot drop it without nonces.** The RSC payload ships
   as 11–31 per-request inline `<script>self.__next_f.push(…)</script>` blocks
   whose bytes vary with rendered data. Hashes cannot cover them. A nonce can,
   via middleware, at the cost of dynamic rendering on every page — a product
   decision, not a security patch.
3. **CSP-3: a hash or nonce in `script-src` makes browsers IGNORE
   `'unsafe-inline'`.** So "tighten it by also listing our two script hashes"
   silently blocks hydration. Either/or, never both.
4. **`'unsafe-eval'` is almost always removable.** Check the built bundles
   (`grep -rlE '\beval\(|new Function\(' .next/static/chunks/*.js`) rather
   than assuming — it was 0 of 204 files here — and keep it in development
   only, where HMR needs it.
5. `object-src 'none'` and `base-uri 'self'` are free; `default-src` does not
   cover `<object>` in every engine.
6. **A justification comment must be true.** This codebase carried "permissive
   because React has heavy inline event handlers" for months. `onClick={…}` is
   a property React assigns — CSP never sees it. A false reason stops anyone
   re-examining the setting.

**How to verify:** build, serve, fetch a page, hash each inline script you
actually received, and check it against the header you actually sent. Nothing
short of that is evidence.

## INJ-E — XSS: one inventory of raw-HTML sinks, and no user data in any of them

- React escapes by default. The sinks that bypass it are
  `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`,
  `document.write`, and `<svg>` upload/preview.
- A raw-HTML sink may carry **only a named constant from one inventory
  module** — never an inline literal, never interpolated data. One module
  means the CSP/nonce migration has a finite list to carry, and a test can
  refuse anything new.
- Write inline bootstraps as **string literals**. A serialised
  `Function.prototype.toString()` bootstrap was dead-code-eliminated in the
  server bundle, shipping an empty `<script>`, and 13 tests passed on text the
  browser never saw.
- A URL from user input (`href`, `src`, redirect target) must be scheme-checked
  against an allowlist (`https:`, `mailto:`) — `javascript:` in an `href` is
  XSS, and an open redirect is a phishing primitive.
- **A redirect target is judged by the URL parser, never by a prefix test.**
  `raw.startsWith("/") && !raw.startsWith("//")` reads as "a path, not a host"
  and is not what the browser does: WHATWG normalises a **backslash** to a
  forward slash in the authority position and **strips tab / CR / LF** before
  parsing. Measured 2026-09-18 — `/\evil.com`, `/\/evil.com` and
  `/<TAB>/evil.com` each passed that check and each resolved to
  `https://evil.com`. The one correct shape:

  ```ts
  const u = new URL(raw, PROBE_ORIGIN);          // resolve first
  if (u.origin !== PROBE_ORIGIN) return null;    // it named a host
  return u.pathname + u.search + u.hash;         // judged === navigated
  ```

  Write it **once**. The ASTRA dashboard had five copies of the prefix version,
  all wrong the same way, on `/login/verify` and the four enrolment screens —
  the sign-in flow, where every trust signal before the redirect is genuine.
- Rendering user-supplied markdown means a sanitiser (DOMPurify with a strict
  allowlist), not a regex.

## INJ-F — Passwords: NIST SP 800-63B, and enforce where a human CHOOSES

Required:

- **min 12** characters, **max ≥ 64** accepted (cap for cost, not policy).
- **compare against a commonly-used / breach list** (§5.1.1.2). This is the
  rule that stops spraying; a rate limit does not, because spraying makes one
  guess against many accounts.
- Compare **normalised forms**, not the raw string: letters-only, leet-folded
  (`0→o`, `1→i` *and* `1→l`, `@→a`, `3→e`, `$→s`), with leading/trailing digit
  and punctuation runs stripped first, and exact repetition collapsed.
  Worked examples that each defeated a naive implementation:
  `password123` → `password`; `P@ssw0rd!2026` → `password` (the `0` in `2026`
  folds to `o` unless the year comes off first); `astra@2026astra` → `astra`;
  `adm1n` → `admin` (needs `1→i`); and `!`/`|` must be **stripped**, not
  folded to `l`, or `P@ssw0rd!` becomes `passwordl` and passes.
- Refuse the user's own identity: email local part, org, name tokens ≥ 4 chars.
- **No composition rules and no routine expiry** (§5.1.1.2, App. A.3) — they
  produce `Summer2026!` and a sticky note.
- Hash with **Argon2id** (64 MiB / t=3 / p=1 baseline), never a bare SHA.

**Where to enforce — this is the part that gets it wrong:** at the paths where
a *person chooses* a password (change-password, first-admin bootstrap,
reset-with-token). **Not** inside the hashing function, even though that looks
like the tidier chokepoint: its other callers rehash an already-accepted
legacy password on login (refusing there locks out every legacy account) and
hash the provisioning default (refusing there breaks onboarding). A rule
applied where it does not belong gets an escape hatch, and the hatch is what
the next weak password walks through.

Pin the negative too: a test asserting the rehash paths are **not** gated, so
the exclusion stays a decision rather than becoming a discovery.

## INJ-G — Throttle per identifier AND per IP, and know what it does not do

Per-identifier (≈5 / 15 min) stops brute force against one account. Per-IP
(≈20 / 15 min) stops one host walking a user list. Both must be backed by a
shared store (Redis) or a multi-replica deployment multiplies the limit by the
replica count. A throttle that **fails closed** on a store outage converts a
Redis blip into a total login outage — fail open on the *store error*, never
on the *limit*, and log it loudly.

Apply the same throttle to every password oracle, not just `/login`:
change-password verifies the current password, so it is one too.

## INJ-H — Remote inclusion and SSRF: the specifier and the origin are never input

- `import()` / `require()` / `readFile` never take a path derived from a
  request. A variable specifier is acceptable only when it is assigned from a
  string literal in the same function (a legitimate use is dodging a
  compile-time module requirement — write the reason next to it).
- A server-side `fetch` URL must come from config, and a proxy must build its
  target as `new URL(configuredOrigin)` then copy **only** `pathname` and
  `search`. Setting the path cannot change the host; concatenating strings can.
- Set `redirect: "error"` on server-side fetches of internal endpoints.
- No remote image/asset patterns without an explicit host allowlist.
- Any egress an LLM or user can influence needs a localhost/allowlist check
  before the call, and the failure must be loud.

## INJ-I — Command execution: argv arrays, and quote it in the shell too

`spawn(bin, [arg1, arg2])` with no `shell: true`. A list is not a shell, so
metacharacters are inert.

Then the **second-order rule**: every shell script that receives those
arguments must quote them — `"$1"`, not `$1`. Safe argv into an unquoted `$1`
is command injection with extra steps.

Script paths are code constants (`scriptsDir / "literal-name.sh"`), never
assembled from input.

## INJ-J — Every byte a tool prints passes one redactor

A diagnostic that echoes an upstream error prints somebody else's string, and
an upstream error routinely contains the credential that was just sent. Route
all output through one redactor at a single exit, so the audit question is "is
there a second way to print?" rather than "did I sanitise all 40 branches?"

Before running anything near secret material, state what its output will
contain, field by field. `lookup`, `inspect`, `describe`, `status`,
`get -format=json` all print everything they know. Prefer `-field=` over
dumping a record. If a mask is needed, the command was the wrong shape.

## INJ-K — Data protection: prove the control is enforcing, not present

- Sensitive columns are encrypted with envelope encryption under a KEK; the
  key id is stored per row so rotation is possible.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` minimum; session identity in
  the cookie, never in `localStorage` where XSS can read it.
- Responses pass a DLP pass that strips key material and PII that the route
  did not intend to return.
- **Row-level security must be verified as enforcing.** Policies can exist,
  read correctly, and be entirely inert because every service connects as a
  superuser role with `rolbypassrls` — 22 policies over 13 tables were
  decorative here for months. Check `rolbypassrls` on the *connecting* role,
  not the policy list.
- A `SECURITY INVOKER` function that counts RLS-protected rows returns 0 and
  reports clean. Ask "whose rights answer this query?" of every check.

## INJ-Z — The ratchets, and the requirement to break them on purpose

Install these in every project. They are cheap, they run in CI, and each one
exists because a careful human failed to hold the invariant:

| Guard | Refuses |
|---|---|
| `sql-injection-surface` | a value or unreviewed expression inside a SQL literal; `%s` in an `EXECUTE`; `EXECUTE … \|\|` |
| `sql-placeholder-gaps` | a statement that skips a `$N` |
| `csp` | `'unsafe-eval'` in production; a hash/nonce beside `'unsafe-inline'`; an inline `<script>` outside the inventory |
| `password-policy` | the sprayed classics, this repo's own shipped defaults, identity, sequences; and that every chosen-password path calls the policy |
| `secret-redaction` | a print path that bypasses the redactor |

**A passing guard proves nothing until you break the code on purpose and watch
it fail.** Sabotage **one clause at a time** and record which test caught
which — a count of failures is not an attribution. Two clauses broken together
prove only that *at least one* mattered.

Every guard needs a **preflight**: if it cannot see its subject (directory
moved, extension changed, dependency unreachable) it must abort with its own
exit code, never emit a verdict. A check that cannot tell "clean" from "I
could not look" reports clean.

And check the runner actually runs it: `jest.config.ts` with
`testMatch: ["**/*.test.ts"]` silently excluded five `.test.tsx` suites here —
which could not have run anyway, since jsdom and Testing Library were not
installed. Run the new guard **by path** and read the count.
