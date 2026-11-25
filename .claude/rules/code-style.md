---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# code-style — Mandatory AI Rules

## Naming
- Variables and functions: `camelCase`
- Classes and types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Files: `kebab-case` (or match existing project convention)
- Boolean variables: prefix with `is`, `has`, `can`, `should`

## Functions
- One responsibility per function — if it needs an "and" in the name, split it
- Max function length: 40 lines (break longer functions into helpers)
- Prefer pure functions — avoid side effects where possible
- Name functions for what they do, not how: `getUserByEmail`, not `queryDbForUser`

## Comments
- Code explains HOW — comments explain WHY
- No commented-out code in commits
- No `// TODO` without a linked issue number
- Complex algorithms get a one-line doc comment

## No Magic Values
```typescript
// WRONG
if (retries > 3) ...
if (status === 'active') ...

// RIGHT
const MAX_RETRIES = 3;
const STATUS = { ACTIVE: 'active', INACTIVE: 'inactive' } as const;
```

## Immutability Preference
- Prefer `const` over `let`; avoid `var`
- Don't mutate function parameters
- Return new objects/arrays instead of mutating inputs

## What Claude Must Not Do
- Add docstrings/comments to code it didn't change
- Refactor working code beyond what the task requires
- Add unused imports, exports, or helper functions "for the future"
- Change code style in files it's not directly modifying
