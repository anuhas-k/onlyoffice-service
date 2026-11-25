---
inclusion: always
title: "Project Structure"
description: "File organisation, naming conventions, and architecture patterns. Always loaded."
---

# Project Structure

## Directory layout

```
src/
  api/          ← route handlers (thin — delegate to services)
  services/     ← business logic (no HTTP knowledge)
  models/       ← data types and DB schemas
  middleware/   ← auth, logging, error handling
  utils/        ← pure functions, no side effects
  config/       ← env var loading and validation

tests/
  unit/         ← isolated function tests (no DB, no network)
  integration/  ← tests with real DB (test database only)
  e2e/          ← Playwright end-to-end tests
  pbt/          ← property-based tests (/pbt generated)

spec/
  requirements.md   ← EARS acceptance criteria (/spec)
  design.md         ← architecture + data model (/spec)
  tasks.md          ← parallel wave task breakdown (/spec)

steering/
  product.md    ← always loaded: product context
  tech.md       ← always loaded: tech stack
  structure.md  ← always loaded: this file
  [domain].md   ← fileMatch: loaded only for matching files
```

## Architecture rules

- **Route handlers** must not contain business logic — delegate to services
- **Services** must not import from `api/` — only models and utils
- **Models** are pure data types — no business logic, no HTTP
- **Utils** are pure functions — same input always produces same output

## Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `user-service.ts` |
| Classes | PascalCase | `UserService` |
| Functions | camelCase | `createUser()` |
| Constants | SCREAMING_SNAKE | `MAX_PAGE_SIZE` |
| DB tables | snake_case | `user_sessions` |
| API routes | kebab-case | `/api/user-sessions` |
| Env vars | SCREAMING_SNAKE | `DATABASE_URL` |

## Import rules

- Use absolute imports from `src/` — never relative `../../`
- Third-party imports go above internal imports
- Never circular imports between services

## Test file placement

- Unit test for `src/services/user.ts` → `tests/unit/services/user.test.ts`
- Integration test for `src/models/user.ts` → `tests/integration/models/user.test.ts`
- PBT tests always in `tests/pbt/`

## New file checklist

Before creating any new file:
- [ ] Does a similar file already exist? (RAG check: `/rag "existing [thing]"`)
- [ ] Does it belong in the right directory per this structure?
- [ ] Is the naming convention followed?
- [ ] Does it need a corresponding test file?
