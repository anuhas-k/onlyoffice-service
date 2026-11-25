# Contributing to word-editor-zkp

Thanks for taking the time to contribute. This document is the contract
between you and the reviewers: follow it and your change lands quickly.

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

---

## Before you write code

1. **Check `SPEC.md`.** Every change must trace back to a requirement or an
   acceptance criterion. If yours does not, open an issue first and get the
   scope agreed before writing code.
2. **Check `STATUS.md`.** It shows the current phase and who owns what. Do
   not start work that is already assigned.
3. **Check `docs/INTERFACE_AGREEMENT.md`.** If your change touches an API
   surface, an event, an error code, or an identifier convention, the
   agreement must be updated and re-signed *before* the implementation.

## Getting set up

```bash
git clone <repo-url>
cd word-editor-zkp
cp .env.example .env      # then fill in the values
npm install
npm test          # everything should pass on a clean checkout
```

If the test suite does not pass on a fresh clone, that is a bug — please
report it before doing anything else.

## Branching

Branch off the default branch. Name the branch after the work:

```
feat/<short-description>      new capability
fix/<short-description>       bug fix
docs/<short-description>      documentation only
refactor/<short-description>  no behaviour change
chore/<short-description>     tooling, deps, CI
```

Never commit directly to the default branch.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body — why, not what>

<footer — BREAKING CHANGE: / Closes #123>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`.

Rules:

- Subject in the imperative mood, no trailing period, ≤ 72 characters.
- One logical change per commit. If you cannot describe it in one line,
  split it.
- Reference the bug or issue ID when fixing something: `fix(auth): reject
  expired refresh tokens (BUG-42)`.

## Pull requests

A pull request is ready for review when **all** of these are true:

- [ ] It does one thing. Unrelated cleanups go in a separate PR.
- [ ] Tests cover the new behaviour — including the failure paths.
- [ ] The full suite passes locally (`npm test`).
- [ ] Lint and typecheck pass (`npm run lint`).
- [ ] Docs are updated: README, API contract, env var table, `CHANGELOG.md`.
- [ ] No secrets, credentials, tokens, private keys, or real customer data
      anywhere in the diff — including test fixtures.
- [ ] The description explains **why**, links the issue, and lists anything
      a reviewer should look at closely.

Reviews focus on correctness, security, and whether the change matches the
spec. Expect questions; they are not an objection to the work.

## Testing

- New behaviour needs a test that fails before the change and passes after.
- Bug fixes need a regression test that reproduces the original report.
- Do not delete or skip a failing test to make a build green. Fix it, or
  explain in the PR why the test itself was wrong.
- Tests must be deterministic. No dependence on wall-clock time, network
  availability, or execution order.

## Reporting bugs

Open an issue with:

1. What you expected to happen.
2. What actually happened, with the exact error output.
3. Minimal steps to reproduce.
4. Environment: OS, runtime version, project version/commit.

Security vulnerabilities do **not** go in the issue tracker — see
[SECURITY.md](SECURITY.md).

## Proposing a feature

Open an issue describing the problem before proposing a solution. Include
who is affected, how often, and what they do today as a workaround. A
feature request that only describes an implementation is hard to evaluate.

## License

By contributing, you agree that your contributions will be licensed under
the Proprietary - All Rights Reserved license that covers this project.
