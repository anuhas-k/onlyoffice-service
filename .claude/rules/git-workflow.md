# git-workflow — Mandatory AI Rules

## Branch Naming
- Feature: `feat/short-description`
- Bug fix: `fix/issue-description`
- Hotfix: `hotfix/description`
- Never commit directly to `main` or `master`

## Commit Format (Conventional Commits)
```
<emoji> <type>(<scope>): <short summary>

<body — explains WHY, not WHAT>

<footer — BREAKING CHANGE, Closes #123, Co-Authored-By>
```
Types: ✨ feat | 🐛 fix | 📝 docs | 🔨 refactor | ✅ test | 🔧 chore |
⚡ perf | 🔒 security | 🚀 ci | 🎨 style | 💥 breaking | 🗑️ remove

Examples:
- `✨ feat(auth): add JWT refresh token rotation`
- `🐛 fix(api): handle null user in profile endpoint`
- `✅ test(users): add edge case for duplicate email`

Subject ≤ 70 chars, imperative mood, no trailing period. The body explains the
motivation and the trade-off — the diff already shows the code. Drop the emoji
only if `git log` shows the project does not use them.

## Pull Request Rules
- One PR per feature/fix — no batching unrelated changes
- Title: `<emoji> <type>(<scope>): <subject> (<TICKET-ID>)`
- Write the body to `docs/PR_BODY.md`, then `gh pr create --body-file docs/PR_BODY.md`.
  Never `--fill`, and never pipe in a whole file (e.g. `STATUS.md`) as the body —
  both discard everything below.
- PR description must include all seven, in order — keep every heading even when the
  answer is `_None._`:
  1. **## What** — 1–3 sentences, then a commit table (one row per commit)
  2. **## Merge danger** — one-way (hard/impossible to reverse once deployed) vs
     two-way (cheap to undo) door + the undo path; blast radius in both clocks
     (test vs prod); the smallest visual / before-after that makes the change clear.
     One-way doors to call out: destructive migration (DBS-A), mainnet deploy,
     public-API/error-contract change (BE-V/APV-A), wallet-derivation change (AAW-B),
     new top-level service (SD-1). One line for a reversible additive change.
  3. **## Why** — ticket, severity, filer, date; symptoms as the real values the
     user saw; spec citations by `§`; root cause **with the offending commit SHA
     and date**; and if a plain revert would not have fixed it, why not
  4. **## How to test** — preconditions, numbered steps, expected result per step,
     at least one **negative assertion** (`→ NOT 404`), then an `Automated:` block
     with real pass counts from a run in this session
  5. **## Deliberately NOT in this PR** — numbered: what's missing, why it's out
     of scope, what would unblock it
  6. **## Notes for reviewers** — deploy caveats, edge cases to flag to PM, retest
     constraints
  7. Footer — `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Verify before opening: every cited SHA resolves (`git cat-file -t`), every `§`
  exists, every path exists, every test count came from an actual run. A fabricated
  pass count or a dead SHA is worse than omitting the line.
- All CI checks must pass before merge
- Squash merge preferred for feature branches
- Delete branch after merge

## What Claude Must Never Do
- `git push --force` to main/master
- `git reset --hard` without explicit user confirmation
- `git branch -D` without confirmation
- Commit secrets, .env files, or credentials
- Skip pre-commit hooks (`--no-verify`)
- Open a PR with `--fill`, or with a dumped file as the body
- Put an unverified SHA, spec `§`, file path, or test count in a PR body
- Commit or open a PR without showing the message/body and getting approval
