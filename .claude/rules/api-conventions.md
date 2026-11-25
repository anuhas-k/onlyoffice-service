---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# api-conventions — Mandatory AI Rules

## REST Resource Naming
```
GET    /users              → list users
GET    /users/:id          → get user by id
POST   /users              → create user
PUT    /users/:id          → replace user (full update)
PATCH  /users/:id          → partial update
DELETE /users/:id          → delete user
```
- Nouns, not verbs: `/orders` not `/getOrders`
- Plural resource names: `/users` not `/user`
- Nested for clear ownership: `/users/:id/orders`

## Request / Response
- Always return `Content-Type: application/json`
- Wrap list responses: `{ "data": [...], "meta": { "total": N, "page": N } }`
- Wrap single resource: `{ "data": {...} }`
- Wrap errors: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`

## HTTP Status Codes
```
200 OK          — successful GET, PATCH
201 Created     — successful POST
204 No Content  — successful DELETE
400 Bad Request — validation failure
401 Unauthorized — no/invalid auth
403 Forbidden   — authenticated but not permitted
404 Not Found   — resource doesn't exist
409 Conflict    — duplicate resource, optimistic lock failure
422 Unprocessable — semantic validation failure
429 Too Many Requests — rate limit hit
500 Internal Server Error — unexpected server failure
```

## Pagination
- All list endpoints MUST be paginated — no unbounded `SELECT *`
- Default page size: 20, max: 100
- Return: `{ total, page, pageSize, hasNext }`

## Versioning
- Version in URL path: `/api/v1/users`
- Never break existing API versions — deprecate, then remove after notice period

## Auth Header
```
Authorization: Bearer <token>
```
- Never accept tokens in query params (logged by proxies)
