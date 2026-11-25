---
name: deploy
description: Deploy this project — runs ship checklist, pushes branch, opens PR
argument-hint: "[environment]"
---
# /deploy — Project Deploy Command

## What This Does

Runs the full ship checklist for `$ARGUMENTS` environment (default: staging).

## Steps

1. **Sync** — `git fetch origin && git rebase origin/main`
2. **Test** — run full test suite (must be 100% green)
3. **Lint** — run linter (must be clean)
4. **Build** — run production build (must succeed)
5. **Push** — `git push origin HEAD`
6. **PR** — open PR with STATUS.md as description

## Environment Targets

- `staging` — push to staging branch, trigger staging deploy
- `prod` / `production` — requires explicit confirmation, tags release

## Hard Rules

- Never deploy with failing tests
- Never push directly to main — always PR
- Always record the deploy in STATUS.md under Deployments
- Rollback plan must be ready before deploying to prod

## Rollback

```bash
git log --oneline -5    # find last good commit
git revert HEAD         # revert bad commit
git push origin HEAD    # push revert
```
