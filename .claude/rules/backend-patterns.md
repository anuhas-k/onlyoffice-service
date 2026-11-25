---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# backend-patterns.md — universal backend rules
# Auto-installed for every project that has a backend (backend / fullstack / api / contract).
# Loaded whenever current_user_role = SE / Senior Engineer / SD.
#
# These rules are the UNIVERSAL portion of the Project A middleware
# retro v2.0 BE-rules — the patterns that apply to any backend, not
# just blockchain middleware. Contract-specific patterns
# (shared provider, nonce manager, eth_call simulation, etc.) live in
# templates/contract/.claude/rules/blockchain-backend.md.

---

## BE-A — Read INTERFACE_AGREEMENT.md Before Writing Any Service Code

`docs/INTERFACE_AGREEMENT.md` must exist and be signed off before any
service code is written. If it doesn't exist, stop and ask the
producer role to run `/interface-agreement`. Do not guess:
- which auth role is required for which endpoint
- which identifier is `arg[0]` / the primary key
- which function/endpoint to call for "approve"
- whether a step is one transaction or two

`interface-agreement-gate.sh` enforces this.

---

## BE-B — No Silent Fallback on Upstream Failure. Hard Rule.

```typescript
// WRONG — silent fallback that hides upstream errors for 10 rounds
async function approveResource(id: string) {
  try {
    await callUpstream(id);
  } catch (err) {
    logger.warn('upstream failed, continuing with DB only', err);
    // ↑↑↑ THIS IS THE BUG — the bug Project A carried for 10 QA rounds
  }
  await db.resource.update({ where: { id }, data: { status: 'approved' } });
  return { success: true, approved: true };  // LIE — not approved upstream
}

// RIGHT — fail loudly, return upstream state in the response
async function approveResource(id: string) {
  const { txHash } = await callUpstream(id);   // throws on failure
  await db.resource.update({ where: { id }, data: { status: 'approved' } });
  return { success: true, data: { approved: true, upstreamVerified: true, txHash } };
}
```

On upstream failure:
- Return HTTP 502 (Bad Gateway) — upstream is the dependency.
- Do NOT update the DB.
- Include `upstreamError` field with the decoded error.
- Log the full error server-side.

`backend-pattern-lint.sh` flags `catch` blocks in approve-class
handlers whose body doesn't `throw` or `return res.status(5xx)`.

---

## BE-C — Approval Endpoint Response Contract

Every `POST /*/approve` endpoint returns this shape — happy path:

```json
{
  "success": true,
  "data": {
    "approved": true,
    "upstreamVerified": true,
    "upstreamRef": "0xabc...123",
    "upstreamError": null
  }
}
```

Failure path (HTTP 502):

```json
{
  "success": false,
  "error": "UpstreamError(...)",
  "errorCode": "<code-or-selector>",
  "data": {
    "approved": false,
    "upstreamVerified": false,
    "upstreamRef": null,
    "upstreamError": "<decoded message>"
  }
}
```

QA asserts on `upstreamVerified` and `upstreamError` — if either
field is missing, the silent-fallback bug (BE-B) is back.

---

## BE-D — Per-Role Schemas with Strict Required Fields

Use a discriminated-union schema (Zod / Joi / Yup) per role:

```typescript
const registerSchema = z.discriminatedUnion('role', [
  z.object({
    role:        z.literal('admin'),
    email:       z.string().email(),
    password:    z.string().min(8),
    permissions: z.array(z.string()).min(1),  // required
  }),
  z.object({
    role:        z.literal('user'),
    email:       z.string().email(),
    password:    z.string().min(8),
    nic:         z.string().min(9),           // required — NOT NULL in DB
  }),
  // ... one branch per role from INTERFACE_AGREEMENT.md Section B
]);
```

Never `z.string().optional()` for a column that is `NOT NULL` in the
DB. The schema must reject what the DB will reject.

---

## BE-E — No Non-Blocking Profile Inserts. Use Transactions.

```typescript
// WRONG
try {
  await db.profile.create({ data: { userId, licenseNo, nic } });
} catch (err) {
  logger.warn('Profile insert failed (non-blocking)', err);   // BUG
}
return { success: true, message: 'User registered' };
//                       ↑ user exists, profile doesn't — permanently broken

// RIGHT — transaction
await db.$transaction(async (tx) => {
  const user = await tx.users.create({ data: { email, password, role } });
  await tx.profile.create({ data: { userId: user.id, licenseNo, nic } });
});
```

A user without its profile is permanently broken. There is no repair
endpoint. Always use a DB transaction. Always fail the whole
registration if any part fails.

---

## BE-F — Single Response Helper. One Shape Forever.

```typescript
// packages/shared/src/responses.ts (or src/lib/responses.ts)
export const ok = (data: unknown) => ({ success: true, data });

export const paginated = (items: unknown[], meta: PaginationMeta) =>
  ({ success: true, data: items, meta });

export const fail = (message: string, code = 400) =>
  ({ success: false, error: { code: 'ERROR', message } });
```

Rules:
- Every list endpoint uses `paginated(items, meta)`.
- `meta` is ALWAYS at root level, NEVER nested inside `data`.
- Gateway/middleware forwards inner-service body byte-for-byte. **No re-wrapping.**
- No service returns `{ data: paginated(...) }` — that double-wraps.

`backend-pattern-lint.sh` flags `data: paginated(`, `res.json(.*paginated`,
and `data:.*data:` patterns.

---

## BE-G — Rate-Limit Headers on Every Response

Configure `express-rate-limit` (or equivalent) to emit:
```
x-ratelimit-limit: 5000
x-ratelimit-remaining: 4987
x-ratelimit-window-ms: 60000
```

QA reads `x-ratelimit-limit` to calculate burst thresholds. Without
it, tests hardcode burst counts that go stale.

---

## BE-H — Body Size Limits

```typescript
app.use(express.json({ limit: '64kb' }));   // JSON endpoints
app.use(express.raw({ limit: '10mb' }));    // file upload endpoints
```

Any request exceeding the limit returns 413. No exceptions.

The universal smoke gauntlet (`scripts/pre-qa-smoke.sh`) verifies
this with a 100KB payload.

---

## BE-I — Startup Health Log Requirements

Within 5 seconds of startup, every service MUST log a line per
upstream dependency, with the resolved value:

```
[db]      connected to postgres://localhost:5432/<dbname>
[redis]   connected to redis://localhost:6379
[s3]      connected to s3://<bucket>
[upstream X] connected to <service-url>
```

If any log is missing, the service started degraded. DevOps must see
all of these before announcing "stack is up".

---

## BE-J — XSS / Injection Rejection at the Edge

```typescript
const safeText = z.string()
  .min(1)
  .max(500)
  .regex(/^[^<>\x00-\x1F]*$/, 'unsafe characters');
```

Any text field accepted from the client uses `safeText` or
equivalent. Reject at validation, not at sanitize-time. The smoke
gauntlet sends `<script>alert(1)</script>` and expects 400.

---

## BE-K — Error Class Hygiene (Project A SE retro §AP-7, R-7)

The HTTP status code tells the caller WHERE the failure came from.
Get it right:

| Cause | Status |
|-------|--------|
| Bad input from client (validation / decode / signature / format) | **400** |
| Upstream rejected our request (contract revert / 4xx) | **400** with decoded reason |
| Upstream unreachable (RPC down / DNS / timeout) | **502** |
| Internal service unreachable from gateway | **503** |
| Genuine bug in our code (uncaught) | **500** — last-resort handler only |

**Hard rule for gateways:** never re-classify a downstream 400 as 503.
If `auth-service` returns 400, the gateway forwards 400.

The smoke gauntlet sends `{"signedTx":"0xdeadbeef"}` to every
broadcast endpoint and asserts **400** with a recognisable error string.

`backend-pattern-lint.sh` flags broadcast/validate/decode handlers
that return 500.

---

## BE-L — Fail-Closed Defaults for Security Middleware (R-8)

For security-critical middleware (rate-limit, auth, RBAC, allow-list,
WAF), the default behaviour when the backing store is unreachable
MUST be **fail closed (deny)** — not fail open (allow).

```typescript
// WRONG — fail open
async function rateLimit(req, res, next) {
  try {
    const n = await redis.incr(`rl:${req.ip}`);
    if (n > LIMIT) return res.status(429).end();
  } catch (err) {
    logger.warn('redis down, skipping rate limit', err);  // BUG
  }
  next();
}

// RIGHT — fail closed with in-memory fallback
async function rateLimit(req, res, next) {
  try {
    const n = await redis.incr(`rl:${req.ip}`);
    if (n > LIMIT) return res.status(429).end();
  } catch (err) {
    logger.error('redis down — enforcing in-memory fallback', err);
    if (!inMemoryRateLimit(req.ip)) return res.status(429).end();
  }
  next();
}
```

Override only via explicit opt-in env var:
```bash
ASTRA_FAIL_OPEN_ON_BACKEND_LOSS=1   # OFF by default
```

---

## BE-M — Single Source of Truth for Runtime Config (R-9)

Every project exposes a runtime config endpoint:

```http
GET /api/v1/system/runtime-config   # any project
GET /api/v1/system/chain-config     # blockchain projects
```

Response:
```json
{
  "version": "1.4.2",
  "chainId": 412346,
  "rpcUrl": "https://...",
  "contracts": { "Hub": "0x...", "DeedManager": "0x..." },
  "abiHashes": { "Hub": "sha256-..." }
}
```

QA seed scripts + frontend code MUST fetch from this endpoint
instead of hardcoding values. Hardcoded `chainId` / `BASE_URL` /
contract addresses in tests are a lint error.

This eliminates the Project A AP-9 class (chain ID drift between
middleware and test scripts).

---

## BE-N — External Dependency Probe at Startup (R-10)

At service startup, every configured external URL is probed. If the
response shape doesn't match expectations (HTML returned when JSON
expected, non-2xx status, etc.), log fatal and either refuse to
start or start degraded.

```typescript
async function probeExternal(name, url) {
  try {
    const r = await fetch(url, { timeout: 3000 });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(`expected application/json, got ${ct}`);
    }
    logger.info(`[${name}] probe OK -> ${url}`);
  } catch (err) {
    logger.error(`[${name}] probe FAILED -> ${err.message}`);
    if (config.strictStartup) process.exit(1);
  }
}
```

At call sites, check `Content-Type` BEFORE parsing.

---

## BE-O — Startup Self-Test (R-11)

At service boot, every external-facing route's handlers must be
resolved. Missing handlers / selectors / dispatch keys = **fatal
startup error**, not silent dead code.

Expose `/api/v1/system/selftest` so QA can re-run the same check
against a live service.

This catches the Project A AP-11 class — dead validation entries that
referenced functions never in the ABI.

---

## BE-Q — Validation Trinity (Type + Format + Range)

Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md §2 — phone-number bug
went through 3 rounds because each fix addressed only one dimension.

Every input field validated at the schema layer MUST check all three:

| Dimension | Question | Example |
|-----------|----------|---------|
| **Type** | What CHARACTERS are allowed? | `[0-9+\-() ]` for phone |
| **Format** | What PATTERN must it match? | `+[1-9][0-9]{6,14}` (E.164) |
| **Range** | What LENGTH / SIZE is valid? | min 7, max 15 digits |

```typescript
// WRONG — type only (Project A round 2)
phone: z.string()

// WRONG — type + format (Project A round 3)
phone: z.string().regex(/^[0-9+\-() ]+$/)

// RIGHT — all three (Project A what-should-have-shipped)
phone: z.string()
  .min(9)                                       // RANGE
  .max(15)
  .regex(/^[0-9+\-() ]+$/, 'invalid chars')     // TYPE
  .refine(p => /^\+?[1-9]\d{6,14}$/.test(p.replace(/[\s\-()]/g, '')),
          'must be E.164 format')               // FORMAT
```

`backend-pattern-lint.sh` warns on `z.string()` (or `Joi.string()` /
`Yup.string()`) without any chained `.min` / `.max` / `.regex` /
`.email` / `.url` / `.uuid` etc.

---

## BE-R — Queue + List-All for Every Approval Workflow

Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md MISTAKE 18.

For every "pending things to approve" UI, the API MUST expose TWO
endpoints:

```
GET /api/v1/<resource>/pending      → only items awaiting decision
GET /api/v1/users?role=<role>       → every item (pending + approved + …)
                                     used for admin dashboards
```

Approval workflows that only build the queue (and not the list) are
incomplete by definition — the moment an item gets approved, it
vanishes from the admin's view. The SE must answer the question
"what does the admin see AFTER approving someone?" before declaring
the endpoint shipped.

See `auth-flow.md` AF-6 for the complete pattern + SQL guidance.

---

## BE-S — Shared Error Handler (One Place, Imported Everywhere)

Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md §5 + MISTAKE 14.

Error handlers MUST live in ONE shared module, imported by every
service. Never copy-paste an error handler.

```typescript
// packages/shared/src/server/errorHandler.ts
import { ZodError } from 'zod';

export function createErrorHandler(serviceName: string) {
  return (error: any, request: any, reply: any) => {
    // Validation errors → 400 (BE-K)
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', issues: error.issues },
      });
    }
    // Known HTTP errors → forward their status
    if (typeof error.statusCode === 'number') {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code ?? 'ERROR', message: error.message },
      });
    }
    // Genuine bugs → 500, with request id
    request.log.error({ err: error, requestId: request.id }, `[${serviceName}] uncaught`);
    return reply.status(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id },
    });
  };
}

// In each service:
app.setErrorHandler(createErrorHandler('auth'));
```

Equivalent shape for Express:
```typescript
export function errorMiddleware(serviceName: string) {
  return (err, req, res, next) => { /* same logic */ };
}
app.use(errorMiddleware('blockchain'));
```

The Project A middleware shipped with each service copying its own
handler — one was missing the `ZodError` branch, so validation
failures came back as 503 instead of 400. Wasted a QA round chasing
"blockchain service is down" when it was actually a missing field.

---

## BE-P — Tests Must Compile (R-12)

A test file that fails to compile for **2+ sessions** is removed or
fixed. CI must enforce `tsc --noEmit` (or equivalent) passes on the
test directory.

Forbidden in committed test files:
- `// @ts-ignore`
- `// @ts-expect-error` (unless paired with a "fix-by" date comment)
- `// @ts-nocheck`
- `xdescribe(...)`, `xit(...)`, `test.skip(...)`, `describe.skip(...)`
  (without a tracked bug number in a comment)

The noise floor of known-broken lines trains everyone to ignore
type-check output, then real errors slip through.

---

## BE-T — Best Algorithm + Right Design Pattern. Hard Rule.

Source: `skills/backend-engineer/SKILL.md` Non-Negotiable Rule 12. Owning
references: `skills/backend-engineer/references/algorithms.md` and
`skills/backend-engineer/references/design-patterns.md` (each has a
"Selection protocol" to run at design time and a "Review checklist" to walk
at review time).

Every non-trivial code path an SE writes MUST have, stated in the design
note (STATUS.md task / PR description / DECISIONS.md row):

| Decision | What must be stated |
|----------|---------------------|
| **n** | the input size *and how it grows* (bounded? per-tenant? unbounded?) |
| **Access pattern** | lookup-by-key / ordered / min-max / prefix / range / membership / FIFO / graph |
| **Data structure** | the one that serves that pattern (Set/Map, heap, sorted, trie, …) — stdlib first |
| **Algorithm + Big-O** | time and space, inside the complexity budget for that n |
| **Pattern trigger** | the axis of variation the pattern isolates — or an explicit "no pattern yet, seam left at `<boundary>`" |

If the code's Big-O or the pattern's trigger cannot be stated, the code is
not done. This does not override "simplest thing that works": the *best*
algorithm for n = 20 is the simple one — stating n is what settles it.

### Algorithm half

```typescript
// WRONG — O(n·m): 50k orders × 20k allowed ids ≈ 10^9 comparisons per request
const visible = orders.filter(o => allowedIds.includes(o.customerId));

// WRONG — sort inside the loop: O(t · e log e), redone for every tenant
for (const tenant of tenants) {
  const latest = events.filter(e => e.tenantId === tenant.id).sort(byDateDesc)[0];
}

// RIGHT — O(n + m): build the lookup once, then a single pass
const allowed = new Set(allowedIds);                 // O(m)
const visible = orders.filter(o => allowed.has(o.customerId));   // O(n)

// RIGHT — group once, O(1) per tenant — or let the DB do it:
//   SELECT DISTINCT ON (tenant_id) … ORDER BY tenant_id, created_at DESC
const latestByTenant = new Map<string, Event>();
for (const e of events) {                            // O(e), single pass
  const cur = latestByTenant.get(e.tenantId);
  if (!cur || e.createdAt > cur.createdAt) latestByTenant.set(e.tenantId, e);
}
```

Fails review (full table: `algorithms.md` §Smells that fail review):
`.includes` / `.indexOf` / `.find` / `.some` on an array inside a loop over
another collection; `.sort` inside a loop; loading a table into memory to
filter or aggregate what the DB can; nested loops to join two lists; hand-
rolled sort / heap / LRU where the stdlib has one; unbounded in-memory
buffers, caches, or recursion; string concatenation in a hot loop; regex
compiled per iteration; any "clever" algorithm with no stated n.

### Pattern half

```typescript
// WRONG — switch-on-provider copy-pasted into charge(), refund(), onWebhook() …
if (tenant.provider === 'stripe') { /* stripe */ }
else if (tenant.provider === 'adyen') { /* adyen */ }
else if (tenant.provider === 'paypal') { /* paypal */ }

// RIGHT — Strategy + Adapter: one interface, one adapter per provider, chosen once
interface PaymentGateway {
  charge(req: ChargeRequest): Promise<Result<Charge, PaymentError>>;
  refund(req: RefundRequest): Promise<Result<Refund, PaymentError>>;
}
const gateways: Record<Provider, PaymentGateway> = {
  stripe: new StripeGateway(), adyen: new AdyenGateway(), paypal: new PaypalGateway(),
};
// pattern: Strategy — payment provider varies per tenant; adding one = one new file
const gateway = gateways[tenant.provider];
```

Fails review (full table: `design-patterns.md` §Anti-patterns that fail
review): switch-on-type repeated in more than one place; God object /
`*Manager` / `*Helper` classes; anemic domain model with all logic in
services; Singleton / global mutable state where DI-scoped instances
belong; Service Locator; copy-pasted providers/clients; ORM entities or SQL
leaking across the API boundary; pass-through layers; a pattern with no
nameable trigger (Abstract Factory for one product, Visitor for two node
types); interface with one implementation and no stated second — unless it
is a deliberate seam and says so.

### Precedence with the other rules

- **Rule 5 (match the codebase) wins:** if the codebase already solves this
  force with a pattern, reuse it — a second pattern for the same force is a
  BE-T violation even if it is "better".
- **Rule 6 (simplest thing) is not in tension:** BE-T asks for the best fit
  *for the stated n and variation*; for small bounded n and one
  implementation, the simple loop and the plain function ARE the best fit.
  What BE-T forbids is not stating n, and shipping the quadratic path
  because nobody asked.
- **Library-first (`architecture.md`)** applies to algorithms too: stdlib
  sort/heap/Set/Map or a vetted library beats a hand-rolled version.

### Enforcement

- `backend-pattern-lint.sh` **WARNs** (strict mode: BLOCK) on the two
  mechanical smells — array membership call inside a loop over another
  collection, and `.sort(` inside a loop. Heuristic; false positives on
  string `.includes` are expected — read the line, then move on.
- `astra-code-review` reports every other BE-T violation at **S3** (rule
  violation) — and at S2 when the quadratic path is on a request handler
  over unbounded input (that is a latency bug in waiting, not a style nit).
- Phase 6 self-review walks both Review checklists (`algorithms.md`,
  `design-patterns.md`); the Definition of Done in
  `skills/backend-engineer/SKILL.md` has the BE-T box.

---

## SE-MEMBER — Membership required before code commits (v7.9.113 HARD BLOCK)

Every SE (backend, frontend, contract, mobile, etc.) working in a
project MUST have an active row in `astra_project_members` for that
project with `role_type='se'` (any role — primary / co-owner /
covering / secondary). Enforced by
`se-assignment-required-before-code.sh` at PreToolUse on
`git commit` / `git push`.

### What this catches

- An SE who was reassigned but never added to the new project's
  member list → git-commit HARD BLOCK with PM-contact message.
- An SE who joined the team mid-sprint before PM ran the dashboard
  add-member flow → blocked until PM opens `/pm/team`.
- An SE trying to bypass the intake flow by cloning repo + committing
  directly → same block.

### Multi-SE support (v7.9.113)

`astra_project_members` supports N SEs per project × lane × role_type.
Two engineers pairing on the same backend land as:
- 1 × `role=primary` (lane owner, only 1 per project × lane × role_type)
- N × `role=co-owner` (equal work, no primary cap)

Bug counts + commit counts scope to the individual `member_email` via
the `[started_at, ended_at)` window — one SE's activity doesn't
inflate the other's stats.

### Bootstrap-safe

The hook skips the ASTRA framework repo itself (detected via
`build-installer.ts + agents/ + scripts/hooks/ + skills/` presence).

### Fail-open

When DB is unreachable, the hook warns to stderr and allows the
commit through — the gate is defense-in-depth, not primary auth.
PM assignment via dashboard IS primary auth.

### CLI for PM

```bash
astra-write member-add \
  --project-id 42 \
  --role-type se \
  --role co-owner \
  --member-email dev@example.com \
  --member-name "Developer Name"
```

Or via dashboard: `/pm/team` → pick project → SE tab → Add member.

### Related

- QA-MULTI (`templates/.claude/rules/qa-patterns.md`) — same table,
  QA-role variant of this rule.
- QA-LOAD (`templates/.claude/rules/qa-patterns.md`) — QAs load
  projects; PMs create them. Same intake gate.
- `scripts/hooks/se-assignment-required-before-code.sh` — the HARD
  BLOCK.
- `scripts/migrations/v7.9.113-generalize-project-members.sql` — the
  schema.

---

## See also

- `templates/.claude/rules/interface-agreement.md`
- `templates/.claude/rules/qa-patterns.md`
- `templates/.claude/rules/devops-patterns.md`
- `templates/.claude/rules/scope-discipline.md` (R-1 .. R-4)
- Contract-specific add-ons: `templates/contract/.claude/rules/blockchain-backend.md`
- `~/.claude/skills/astra/scripts/hooks/backend-pattern-lint.sh`
- `skills/backend-engineer/references/algorithms.md` + `references/design-patterns.md` (BE-T owning references — selection protocols + review checklists)
- `~/.claude/skills/astra/scripts/hooks/se-assignment-required-before-code.sh` (SE-MEMBER)

## BE-U — Parse request scalars strictly; never coerce, never clamp

Four findings in one review, one root cause — and it is a language defect, so it reaches every Node service you will ever write. `Number()`, `parseInt()`, `+x` and
`z.coerce.number()` accept far more than a decimal integer, and Express hands
you `string | string[]`:

```
Number("0x10") === 16    Number("0b11") === 3    Number("1e3") === 1000
Number("7.0")  === 7     Number(" 7")   === 7    Number("+7")  === 7
Number([5])    === 5     <- ONE-element array, silently unwrapped
Number([])     === 0     <- empty array becomes ZERO
```

So `?limit=0x10` returned 16 rows (BUG-001), `?limit[]=5` was swallowed and the
default used instead (BUG-005, BUG-027), and `?limit=1000` was clamped to an
undocumented ceiling of 20 and answered **200** (BUG-025) — a caller paging by
its assumed size then skips 30 records a page with no error anywhere.

**The rule:**

1. Refuse an array, whatever its length. A one-element array that happens to
   parse is still a caller who built the query string wrong.
2. Match `/^[0-9]+$/` **before** `Number()`. The regex is the contract;
   `Number()` is only the arithmetic afterwards.
3. Refuse out-of-range. **Do not clamp.** A clamped request is a lie told with
   a 200, and the caller cannot see it without reading `meta` back.
4. One helper, used by every scalar on the surface — not per-handler.

```ts
function strictInt(raw: unknown, field: string, { min, max }: {min:number;max:number}): number {
  if (Array.isArray(raw) || typeof raw !== "string")
    throw new ValidationError(`${field} must be a single value`);
  if (!/^\d+$/.test(raw))
    throw new ValidationError(`${field} must be a decimal integer`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new ValidationError(`${field} must be between ${min} and ${max}`);
  return n;
}
```

Zod: `z.coerce.number()` has this defect by construction. Use
`z.string().regex(/^\d+$/).transform(Number)` plus an explicit `.refine()`.

**Test every integer parameter, not one.** BUG-001 was found on `limit` and
reproduced on `page`, `offset` and a second endpoint's `limit`. Include a
control that plain decimals still pass — the fix must not over-correct.

Linted by `backend-pattern-lint.sh` (BE-U). This class is statically
detectable, which is why it is a lint and not only a test.

**The prose is benchmark-proven (R-1).** The `query-scalar` case in
`scripts/rule-benchmark-cases.ts` A/B-tests this clause's wording. On a
weaker model (haiku) injecting the rule flips the default
`parseInt(req.query.id)` to the strict guard — **0% → 100%** compliance. A
capable model (sonnet) already writes the `Array.isArray` + `/^\d+$/` guard
unprompted, so the case **ties** on it — which is exactly why the *hook*, not
the wording, is the guarantee on a strong model. The hook was verified
(2026-10-25) to fire on the benchmark's baseline shapes and stay silent on the
guarded one. See `docs/plans/R-1-RULE-BENCHMARK-RESULTS.md`.

## BE-V — An API document carries its version in the FILENAME and INSIDE, and both move together (HARD RULE)

An API document is a contract. A contract with no edition cannot be cited,
and two people cannot establish they are discussing the same revision.

**Both halves are required, and the rule is a hard block:**

| | |
|---|---|
| **Filename** | `api-v2.4.md`, `API.v2.4.0.md`, `openapi-2.4.yaml` |
| **Inside the document** | `**Version:** 2.4.0` near the top, or `version: 2.4.0` in front matter |
| **On every content change** | **both** are bumped, in the same edit |

**Why both, and not one.** A version only in the filename is invisible to
anyone reading a rendered page, a pasted excerpt or a printed copy. A version
only inside the file is invisible to anyone listing a directory, and gives a
reviewer no way to see at a glance which edition a diff touches. Each alone
leaves a reader who cannot tell what they are holding.

**Why the bump is the hard part.** Editing a contract without moving its
version means everybody already holding that version now holds something that
is no longer true, and nothing tells them. This is not hypothetical: in one
review, two documents disagreed about the authentication tier of eleven
endpoints, and when that was corrected the index was fixed while the
per-endpoint sections were not — so the *same* document then disagreed with
itself. Neither could be caught by a reader, because neither carried a version
that moved.

Which digit moves is yours to choose. A removed field, a new required
parameter or a changed status code is not a patch.

**Enforced by** `api-doc-version-gate.sh` (PreToolUse, hard block). It refuses
an edit when:

1. the filename carries no version;
2. the document declares none;
3. the two disagree (`2.4` in the name, `1.9.0` in the text — a rename that
   did not finish);
4. the file already has uncommitted changes and the version has not moved.

Case 4 fires on the *second* edit of a session, not the first — the version a
change will need is not knowable before the change is made, and a gate that
demanded it up front would be guessed at rather than chosen.

Scope is deliberately narrow — filenames containing `api`, `openapi`,
`swagger`, `endpoint` or `contract`, excluding fixtures and `node_modules`. A
README that mentions an endpoint is not a contract, and a gate that blocked
every markdown edit would be switched off within a day, which is how a control
stops being one. `ASTRA_API_DOC_VERSION_GATE=0` disables it for a repository
that versions its API docs another way, such as an OpenAPI `info.version`
under its own lint.

**Keep a stable pointer if tooling needs one** — a symlink or a generated
`api-latest.md`. Generated, never hand-edited: a hand-maintained copy beside a
versioned original is the drift this rule exists to stop, wearing a different
name.

## BE-W — An endpoint is not done until it is verified AND its API doc matches what shipped (HARD RULE)

"Implemented" is not "done." An endpoint whose code compiles but was never run
against is a guess, and an endpoint whose behaviour has drifted from
`docs/api.md` is a contract its consumers cannot trust. Both failures are
invisible in the diff — the code looks finished — and both surface downstream as
a QA round or a broken frontend integration, the most expensive place to find
them.

**The rule, at the moment an endpoint's implementation is complete and before
the task is marked `[DONE]` / handed off / committed:**

1. **Run `/verify`** — launch it and *observe* the endpoint behave: the happy
   path returns what the contract says, and at least one failure path (bad
   input → 4xx, downstream down → 5xx) does too. Tests passing is a necessary
   signal, not this step — `/verify` is *seeing it work*, not reasoning that it
   should (`skills/verify`). It writes its evidence to `qa/reports/verify-*.md`.
2. **Update `docs/api.md`** so every section (method, path, request/response
   schema, status codes, error shapes, auth) matches what actually shipped —
   not what was sketched in Phase 3. If the implementation diverged from the
   design, the doc follows the implementation (IA-5: the deployed artifact is
   the source of truth), and the version moves with it (BE-V).

**Contract-first exception (FCT-H).** When the API doc was *provided* before the
code, step 2 runs the other way: the doc is the locked contract, the code conforms
to every endpoint and every field (none missing, none added), and the doc only
gains real verified data (example values, evidence links — version still moves).
Its shape changes only by the contract owner (BA/TL), re-signed in
INTERFACE_AGREEMENT — never by the implementing agent. Code-first projects follow
step 2 as written.

**The API doc is part of the definition of done.** A stale or unverified
endpoint is NOT done, however green the diff looks. This is the same
believed-but-wrong failure as a drifted version (BE-V) or a drifted glossary
(UBL-D): the artifact everyone trusts, quietly no longer true.

**Why a rule and not a reminder.** The gap between "I wrote the handler" and "I
confirmed it works and wrote down what it does" is where the Project A
silent-fallback bug (BE-B) lived for ten QA rounds, and where every
`docs/api.md` ↔ deployed drift in the PROJECT B review (BE-V) came from. Closing an
endpoint without both steps defers the discovery to QA.

**Scope (ceremony-scaling SE-N).** Fires per endpoint on any change that adds or
alters an endpoint's observable contract — a new route, a changed
request/response shape, a new status code, a changed auth tier. A pure internal
refactor that leaves the contract byte-identical does not re-trigger the doc
update (but still runs `/verify`). A trivial one-line fix that cannot change the
contract is not gated.

**Enforcement.** There is deliberately no new "endpoint complete" detector hook —
"an endpoint is complete" is not reliably decidable from a single Edit, and a
brittle gate that guessed would be switched off within a day (the lesson BE-V's
narrow scope encodes). The teeth are the surfaces that already see the whole
diff:

- `astra-code-review` (`se-adversarial-review.md` SCR-B) reports a new/changed
  endpoint in the diff with no matching `docs/api.md` update as **contract drift
  — S2**, and a completed endpoint task with no `/verify` evidence as an **S3**
  finding (S2 on a security / money path). The closing review of every medium+
  task (SCR-F) is where this lands.
- `api-doc-version-gate.sh` (BE-V) already blocks editing `docs/api.md` without
  moving its version — so when you DO update the doc, the edition moves with it.

## BE-X — Foundation units use the canonical design and pass the attack corpus before the first review (HARD RULE)

Shared code that every request passes through is not an endpoint, so the endpoint-shaped checks
never fire on it. A defect in it is a defect in every endpoint at once. This covers the logger and
redaction, error mapper, validation pipe, body parser, response envelope, emitted records, config
loader, the canonical serialiser behind a hash or signature, time-windowed security state
(revocation / deny lists) and wrapped third-party middleware. For each unit,
`skills/bug-prevention/references/foundation.md` (F-1 … F-10) gives:

- **the canonical design.** Examples:
  - logs are a closed key vocabulary plus a closed set of value shapes, never a pattern scrubber,
    and no caller-supplied regex;
  - the error mapper is an exhaustive table;
  - validation is strict at every depth;
  - emitted records are checked against the API document's schema;
  - the body parser uses strict decoding;
  - the config loader is typed, fails fast, and has no default for a secret;
  - a hashed or signed value is canonicalised from what is stored (I-JSON safe integers, RFC 8785);
  - a revocation / deny list uses one window against both clocks (`lifetime + 2×skew`), is
    monotonic per key, fails closed on overflow, and refuses non-finite times;
  - a wrapped middleware is awaited until `next` fires, never assumed synchronous.
- **an attack corpus.** It runs as one property / fuzz test per unit and must be green before the
  first review.

**Why a hard rule.** On Project C TASK-001 the logger was built as a pattern scrubber. Seven review
rounds each found one more bypass: names, national IDs, phone layouts, salts, UUID corruption,
PII as an object key, and a caller-supplied regex shape. That was eight S2 bugs and about 4,900
lines of logging code. The reviewer's checks were knowable on day one. Running them before the
review turns seven rounds into one.

**Size signal.** A foundation unit past roughly 300 lines of non-test code is patching cases. Go
back to the design.

**Enforced by:**
- `backend-pattern-lint.sh` (BE-X, WARN; strict BLOCK) flags pattern-scrubbing redaction in
  logging / redaction files. It now also covers `libs/*/src`.
- `astra-code-review` walks F-1 … F-10 for every foundation unit in the diff. It reports every
  class in one pass, and reports a missing attack corpus as S2.
