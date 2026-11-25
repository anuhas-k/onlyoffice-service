# word-editor-zkp

Backend for collaborative document editing: routes each file to one editing engine (ONLYOFFICE by default, Microsoft 365 via WOPI as an opt-in tier), keeps a shared lock table, normalizes every save into one version record, and anchors Merkle roots of version records on-chain.

![License](https://img.shields.io/badge/license-proprietary-blue.svg)

---

## Overview

<!-- Two or three paragraphs: what this project does, who it is for, and
     what problem it solves. Pull the short version from SPEC.md §1
     (Problem Statement) — do not paste the whole spec here. -->

**Status:** early development
**Type:** backend

## Quick start

```bash
npm install
npm run dev
npm test
```

## Configuration

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | Primary datastore connection string |
| `BASE_URL` | yes | Base URL the app is served from |

<!-- Add every variable the app actually reads. An undocumented env var is
     a bug: it is the first thing that breaks a new machine. -->

## Project layout

```
SPEC.md          product specification — what we are building and why
STATUS.md        current phase, task list, open blockers
docs/            design docs, API contract, interface agreement
src/             application source
tests/           automated tests
```

## Development

```bash
# run the test suite
npm test

# lint + typecheck before every commit
npm run lint
```

Read `CONTRIBUTING.md` before opening a pull request — it covers branch
naming, commit format, and the review gates this repo enforces.

## Documentation

| Document | Purpose |
|----------|---------|
| [SPEC.md](SPEC.md) | Product specification and acceptance criteria |
| [docs/INTERFACE_AGREEMENT.md](docs/INTERFACE_AGREEMENT.md) | Producer ↔ consumer contract, signed before code |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to propose and land a change |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Expected behaviour in this community |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md),
and note that participation is governed by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Do **not** open a public issue for a security problem. Follow the private
reporting process in [SECURITY.md](SECURITY.md).

## License

Released under the Proprietary - All Rights Reserved license. See [LICENSE](LICENSE) for the
full text.
