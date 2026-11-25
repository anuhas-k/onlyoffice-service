---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# error-handling — Mandatory AI Rules

## Never Swallow Errors
```typescript
// WRONG
try { doSomething() } catch (_) {}

// RIGHT
try { doSomething() } catch (err) {
  logger.error('doSomething failed', { err, context });
  throw err; // or handle explicitly
}
```

## Error Propagation
- Let errors bubble up to a central handler — don't handle locally unless you can recover
- Catch at boundaries: API handlers, queue consumers, scheduled jobs
- Always log the original error before rethrowing a wrapped error

## Typed Errors
- Define domain error types: `NotFoundError`, `UnauthorizedError`, `ValidationError`
- Never throw raw strings: `throw 'something failed'`
- Map domain errors to HTTP status codes in one place (error middleware)

## External API Failures
- Always set timeouts on external HTTP calls
- Implement retry with exponential backoff for transient failures
- Do NOT retry: payments, email sends, non-idempotent mutations
- Log request/response on failure (sanitize sensitive fields)

## Partial Failures
- If a multi-step operation fails mid-way, clean up partial state
- Use database transactions for operations that must be atomic
- Document which operations are idempotent and which are not

## Logging Standards
```
logger.error — unrecoverable, needs human attention
logger.warn  — recoverable, but worth investigating
logger.info  — normal business events (user created, order placed)
logger.debug — developer context (never in production by default)
```
