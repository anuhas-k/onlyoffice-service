---
paths:
  - "**/Dockerfile*"
  - "**/docker-compose*.{yml,yaml}"
  - "**/compose*.{yml,yaml}"
  - ".github/**"
  - "**/{infra,k8s,helm,terraform,deploy}/**"
  - "scripts/dev-up.sh"
---
# devops-patterns.md — universal DevOps rules
# Auto-installed for every project.
# Loaded whenever current_user_role = DevOps.

---

## DO-A — Service Startup Order. Each Layer Depends on the Previous Being Healthy.

```
1. Stateful infra (DB, cache, queues, blob storage)
                  → wait for the layer's health check (pg_isready, redis ping, etc.)
2. External infra (chain RPC, identity provider, etc.)
                  → wait for the layer's RPC / OIDC discovery
3. Internal services (auth, blockchain-service, …)
                  → wait for GET /healthz = 200
4. Edge / gateway → wait for GET /healthz = 200
                    (the gateway's health check confirms downstream)
```

`docker-compose.yml` (or k8s manifests) should encode this with
`depends_on: condition: service_healthy` at every layer.

Never start the gateway before downstream services are healthy.

---

## DO-B — Single Source of Truth for `.env`

One `.env` file for all services. `docker-compose.yml` uses
`env_file: .env`. NO `environment:` section in `docker-compose.yml`
that overrides `.env` values.

If a config value appears in two places with different values, the
service that reads the wrong one will fail silently for many QA
rounds. This was the Project A `CHAIN_ID` mismatch class.

Validate at startup — every service must throw if a required env
var is missing or malformed (per `backend-patterns.md` BE-I).

---

## DO-C — Pre-Start Verification

Before announcing "stack is up", run:

```bash
# Universal:
bash scripts/pre-qa-smoke.sh         # 7-check smoke gauntlet

# Project-type add-ons (whichever apply):
bash scripts/verify-role-grants.sh   # blockchain: admin roles on-chain
bash scripts/verify-abi-sync.sh      # blockchain: ABI sync
```

Do NOT announce "stack is up" until every one of these passes.

---

## DO-D — Redis / Cache FLUSHDB on QA Reset

```bash
docker exec $REDIS_CONTAINER redis-cli --no-auth-warning FLUSHDB
```

Without this, stale rate-limit keys / sessions from a previous run
block the next run's first 60 requests. `scripts/full-qa-reset.sh`
includes this step.

---

## DO-E — Reproducible Builds

- All container builds use SHA-pinned base images (no `:latest`).
- Lock files (`bun.lockb`, `package-lock.json`, `Cargo.lock`) are
  committed.
- CI builds from `--frozen-lockfile` / `--locked` only.

Reproducibility is the cheapest way to remove "works on my machine"
from your bug funnel.

---

## DO-F — Secrets Discipline

- Real credentials live in `~/.astra/db.json` or a vault — NEVER in
  tracked files.
- `.env.example` ships with placeholders only.
- `.env` is gitignored.
- Service identities (admin signer / JWT signing key / S3 access key)
  rotate via the IAM layer, not by editing `.env`.

Test environments use throwaway credentials; production uses the
vault. There is no "shared dev credential" pattern.

---

## DO-H — Dev Environment Auto-Setup (Proposal §4)

Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md §4 — three QA rounds
were lost to port conflicts (5432), too-low dev rate limits (100/day),
and CORS not configured for the frontend port.

Before any project's `docker compose up` (or equivalent bring-up)
runs in dev, the framework's universal `scripts/dev-up.sh` checks:

```
1. Port conflict check
   lsof -i :5432,:6379,:3000,:3306 → warn on any local process
   that would collide with the compose definition.

2. Dev-friendly defaults
   - RATE_LIMIT_MAX=10000 (not 100) — prod has its own .env
   - CORS_ORIGINS includes localhost frontend ports
       (http://localhost:3000, :3001, :3003, :5173)
   - LOG_LEVEL=debug for the dev compose only

3. Health check after start
   curl -fsS http://localhost:<port>/healthz
   wait up to 30 s before declaring failure

4. Post-start smoke
   register + login round-trip (BE-G smoke gauntlet's first 3 checks)
   verifies auth path works before the user opens the browser
```

The script lives at `scripts/dev-up.sh` after `/init` runs. Re-run
on demand whenever the dev environment looks broken.

For contract projects, this script also calls `anvil-up.sh` (v7.2)
when Anvil isn't already running.

---

## DO-G — Project-Type Extensions

| Type | Add | Source |
|------|-----|--------|
| Contract | DO-4 faucet pre-funding, DO-7 anvil --state | `templates/contract/.claude/rules/blockchain-devops.md` |
| Backend  | (universal rules cover it) | this file |
| Frontend | static-hosting cache headers, CSP | `templates/frontend/.claude/rules/frontend-devops.md` (future) |

---

## DO-I — The Deploy Card Has One Shape (HARD RULE)

The person reading a deploy card is on call. They want four things — **which
project, which branch, which server, which commands** — and every card puts
them in the same place so finding them costs nothing. A card is not prose
about a deploy; it is the thing somebody acts on at 2am.

**Fixed order, every card:**

```
Title:  <Project> (<ENV>) — deploy <what>

Summary                    one or two sentences
Context                    Project / Branch / Server / Deployment command (run in order)
Acceptance criteria        checkable statements
Inform                     DevOps / PM / QA / Client devs
Other information          only when there is some
For QA test                only when there is some
Linked work items          relates-to links, not just keys in the text
```

| Code | Rule | Why |
|---|---|---|
| **DC-1** | `Branch:` is always `develop` | The card names the branch the server tracks after `git pull` — the integration branch, never the PR branch the work was written on. A PR branch here sends the operator to a ref the server does not have. The PR number is provenance: it goes in the **title**. |
| **DC-2** | The ordered command block is on every card | It is what the reader came for. Nothing to run is still written as a command (`# no action — config only`) so nobody wonders whether it was dropped. |
| **DC-3** | Nobody is assigned | An SD card is a request to a **rota**. Assigning it makes everyone else stop reading, and the assignee is usually whoever was mentioned first. |
| **DC-4** | Every @mention is confirmed one at a time | Before a name goes on, answer *for this deploy*: does it change anything for them, or need anything from them? A roster default is a guess. Mentioning the unaffected teaches them to skim the next card — and the next card is the one that needed them. |
| **DC-5** | Tickets are linked, not named | A key in the title is a string. A link makes the bug's own page say "relates to SD-…", which is where QA looks when asked to retest. Keys are resolved **before** posting: a card naming a ticket it is not linked to is worse than one naming none. |

**Short and sweet.** One sentence per ticket — *what changed*, not *how it was
fixed*. No paragraph that is not load-bearing.

Enforced by `scripts/hooks/deploy-card-format-gate.sh` (DC-1/2/3 and the four
required sections; DC-4 and DC-5 are reminded, not blocked — neither can be
decided from text). Written correctly by `/deploy-card`.

---

## See also

- `templates/.claude/rules/interface-agreement.md`
- `templates/.claude/rules/backend-patterns.md`
- `templates/.claude/rules/qa-patterns.md`
- `templates/contract/.claude/rules/blockchain-devops.md`
