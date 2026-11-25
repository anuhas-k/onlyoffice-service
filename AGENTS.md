# AGENTS.md — ASTRA v5 Agent Configuration
# Place in your project root. Claude Code reads this automatically.

## Framework
ASTRA v5 Team Framework. Skills: ~/.claude/skills/astra/
Org: CEO → CTO → Head of Engineering → EM + TL → SE + BA + SD + JD → QA + DevOps + Designer

## Current Session User
# HARD GATE — Claude must ASK the user at session start (never infer from
# email, git config, or any other side channel). identity-gate.sh enforces
# this — Auto-Mode does NOT override it.
#
# Filled by Claude only after the user explicitly states their name and role.
# Anything but a literal, user-supplied value here will keep the gate active.
current_user_name: "anuhas"
current_user_role: "SE"        # one of: PM | CTO | Head of Engineering | EM | TL | SE | BA | SD | JD | QA | DevOps | Designer | Smart Contract
identity_verified: true
identity_verified_at: "2026-11-25"     # ISO date set by the agent after the user confirms

## Team Members (fill in your actual team)
team:
  - name: [Name]
    role: [Role]
    focus: [What they work on]

## Mandatory
1. /ctx load at start of every session
2. Never skip phases. Never code before Phase 5 (TDD).
3. Update STATUS.md after every task and phase.
4. Run /self-eval after every phase output.

## Project Stack — FILL THESE IN
language: typescript
framework: fastify
test_runner: vitest
lint: eslint
build: "npm run build"
language_pack: typescript  # typescript|go|rust|ios|android|data|terraform
architecture: modular-monolith
database: postgresql
orm: drizzle
cache_queue: redis

## Test Commands
test: npm test
coverage: npm test -- --coverage
lint: npm run lint
build: npm run build

## Model Routing — coding=sonnet · reasoning/review=opus · mechanical=haiku
# You never run /model. Stay on Opus in the main session; coding is routed to
# the Sonnet-pinned se-backend/se-frontend/se-contract subagents (a hook cannot
# switch the interactive session's model). scripts/model-router.sh injects a
# "delegate to the Sonnet subagents" directive on the coding phase — never blocks.
# See skills/MODEL_ROUTING.md.
discovery:      opus     # brainstorm / plan / architecture — "other"
architecture:   opus
implementation: sonnet   # Phase 4 — CODING
review:         opus      # QA / code review — review ≠ coding
atomic_tasks:   haiku
context:        haiku
docs:           haiku
devops:         haiku

## MCP Integrations (uncomment what you have)
# mcp_github: enabled
# mcp_linear: enabled
# mcp_sentry: enabled
# mcp_datadog: enabled
# mcp_slack: enabled

## Observability
metrics_file: .astra/metrics.json
track_cost: true
track_time: true
track_coverage: true

## Handoff Agent
# Auto-fires when all Phase 4 tasks are [DONE]
# Writes qa/HANDOFF.md with: changed files, risk flags, acceptance criteria checklist
# Blocks if any Phase 4 task is not [DONE] or S1/S2 bugs are open
handoff_agent: enabled
handoff_output: qa/HANDOFF.md
handoff_block_on_open_bugs: true

## Cost Tracker Agent
# Auto-fires at session end and every phase gate pass
# Records phase status, model used, task counts, eval scores to .astra/metrics.json
# Silent — one-line confirmation only
cost_tracker: enabled
cost_tracker_output: .astra/metrics.json

## Parallel
parallel_enabled: true
max_agents: 4

## Command Allowlist
# Claude runs these automatically — no approval needed
auto_approve:
  - git status
  - git diff
  - git log
  - git add
  - git commit
  - npm test
  - npm run lint
  - npm run build
  - bun test
  - bun run lint
  - cargo test
  - cargo clippy
  - npx playwright test
  - npx tsc --noEmit

# Claude MUST ask before running these
always_ask:
  - git push
  - git push --force
  - git reset --hard
  - git branch -D
  - rm -rf
  - DROP TABLE
  - database migrations (bun run db:migrate, prisma migrate deploy)
  - npm publish
  - any production deployment
  - gh release create

## Do Not Touch
- .env files
- package-lock.json
- Database migrations once merged
- SPEC.md once approved
- .astra/chromium.token
- .astra/cookies.json
