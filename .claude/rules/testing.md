---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# testing — Mandatory AI Rules

## Test-First Rule
- Write the test before writing the implementation (TDD)
- No implementation code without a corresponding test
- Exception: prototypes and spike branches — clearly marked, never merged

## Coverage Targets
- Minimum: 80% line coverage
- Critical paths (auth, payments, data mutations): 100% branch coverage
- New code must not decrease overall coverage

## Test Structure (AAA)
```
Arrange — set up test data and preconditions
Act     — call the unit under test
Assert  — verify the outcome
```

## What to Test
- Happy path (valid inputs, expected behavior)
- Edge cases (empty, null, zero, max values)
- Error paths (invalid input, missing resources, auth failures)
- Boundary conditions (pagination limits, rate limits)

## Test Naming
```
[unit]_[scenario]_[expected]
getUserById_userNotFound_returns404
createOrder_duplicateItem_throwsConflictError
```

## What Claude Must Not Do
- Delete tests to make coverage pass
- Mock the database in integration tests (use test DB instead)
- Write tests after the fact without red-green-refactor cycle
- Ship code with skipped (`it.skip`, `pytest.mark.skip`) tests without a linked issue
