---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# security — Mandatory AI Rules

## Input Validation
- Validate ALL user input at system boundaries (API layer, form handlers)
- Never trust client-supplied IDs for authorization — re-check against the authenticated user
- Parameterize ALL database queries — never string-concatenate SQL
- Sanitize output rendered in HTML — prevent XSS

## Secrets Management
- Secrets go in environment variables — never in code or config files
- Never log tokens, passwords, or API keys
- Never return secrets in API responses
- `.env` files are in `.gitignore` — never commit them

## Authentication & Authorization
- Check authorization at every layer — not just the route handler
- Invalidate sessions on logout and password change
- Use short-lived access tokens + refresh token rotation
- Rate-limit auth endpoints

## Dependency Security
- Run `npm audit` / `pip-audit` / `cargo audit` before shipping
- No packages with known CRITICAL vulnerabilities
- Pin dependency versions in production

## Error Messages
- Never expose stack traces, file paths, or internal details to users
- Return generic error messages; log detailed errors server-side
- HTTP 404 vs 403 — don't leak resource existence to unauthorized users
