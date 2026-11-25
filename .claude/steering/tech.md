---
inclusion: always
title: "Tech Stack"
description: "Frameworks, libraries, tools, and technical constraints. Always loaded."
---

# Tech Stack

Source of truth for tags: `(doc: <file>)` = named in the client design PDF
(`docs/source/Collaborative Editing Dual-Engine Design ... .pdf`); `(user)` = chosen by the SE in /init;
`(inferred)` = ASTRA default, change freely.

## Architecture

- **Style**: Modular monolith (user) — one deployable, strict module boundaries
- **Modules (doc)**: engine adapters (ONLYOFFICE Docs API + WOPI) over shared internal services:
  authorization, lock/session table, document-key service, versioning pipeline, presence service,
  Merkle/anchoring queue, audit log (doc: Collaborative Editing Dual-Engine Design.pdf §2-4, Q15, Q20)
- **Rule (doc)**: nothing downstream of the adapters knows which engine produced a save

## Language & runtime

- **Language**: TypeScript (user)
- **Runtime**: Node 20 LTS (inferred)
- **Package manager**: pnpm (inferred)

## Frameworks

- **Backend**: Fastify (user — "TypeScript + Fastify/Express")
- **Frontend**: none in this repo (backend project); editors are embedded engines (doc)
- **ORM / DB client**: Drizzle (user)

## Testing

- **Unit**: Vitest (inferred)
- **E2E / browser**: none (backend project)
- **PBT**: fast-check (inferred)

## Code style enforced

- Linter: ESLint (inferred)
- Formatter: Prettier (inferred)
- Rule: No `any` in TypeScript. All exported functions must have explicit return types.

## Key conventions

- Error handling: Typed domain errors mapped to HTTP status at the adapter edge; never leak engine internals.
- Naming: camelCase functions, PascalCase types, SCREAMING_SNAKE_CASE env vars
- File naming: kebab-case for all files, `.ts` extension
- Imports: Absolute imports from `src/` only. No relative `../../`. Modules import each other only via their public `index.ts`.

## Banned patterns

- Never use `any`. Use `unknown` and narrow.
- Never `console.log` in production code. Use the structured logger.
- Never store secrets in code. Read from `process.env`.
- Never reuse an ONLYOFFICE document key across saves; key = fileId + versionId (doc: §4, Q28).
- Never log WOPI/access tokens or full URLs containing them (doc: Q29).
- Never trust an ONLYOFFICE save callback without verifying its JWT and fetching `url` from the configured Document Server host only (doc: Q30).
- Never make saving depend on blockchain availability; anchoring is queued (doc: Q40).

## Infrastructure

- **Database**: PostgreSQL (user) — lock/lease table, version records, audit log
- **Cache**: Redis (user) — presence, idempotency/dedup keys
- **Queue**: Redis-backed job queue, BullMQ (inferred; doc mentions "redis worker" in Q25) — save ingestion + Merkle anchoring jobs
- **Hosting**: Kubernetes pods, deployable in customer region / confidential VMs (doc: §5); cloud TBD (doc)
- **CI**: TBD (no remote yet)
- **Editor engines (doc)**: ONLYOFFICE Document Server (self-hosted, default); Microsoft 365 for the web via WOPI (opt-in, gated on CSPP approval)
- **Chain anchoring (doc)**: Merkle root anchored on-chain; grouping unit TBD (doc: Q8); smart-contract/wallet design TBD (doc: Q41)

## Role Questionnaire

<!-- Set to true after /init questionnaire is completed -->
questionnaire_completed: true
