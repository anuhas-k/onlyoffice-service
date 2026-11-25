# INTERFACE_AGREEMENT.md
# Source-of-truth contract between every role on the project. Produced before code is written.
#
# Status: SIGNED OFF (single-person prototype — see Sign-Off)
# Last updated: 2026-11-25
# Project type: backend (API + webhook from ONLYOFFICE Document Server + static test UI)
# Sources: SPEC.md (approved 2026-11-25) · docs/decisions/001-onlyoffice-editing-service.md (D1–D8) · docs/SRS.md v0.1
#
# Error body for every error below: { "error": { "code": "NamedCode", "message": "text" } }
# Exception: the ONLYOFFICE callback success body is exactly {"error":0} (ONLYOFFICE-imposed).

---

## Section A — Access Reference Map

Auth tiers used below:
- **user** — `Authorization: Bearer` user JWT (HS256, claims `sub`, `tenant`, `name`, `exp`); acts only on its own tenant's files.
- **dl-token** — query `t` = HMAC download token bound to {fileId, versionId, key}, 5-minute expiry.
- **ds-jwt** — Document Server JWT (shared secret), in `Authorization` header or body `token`.
- **public** — no auth.

### ENTITY: File

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| Create | `POST /files` (multipart field `file`) | file bytes; ext docx/xlsx/pdf/pptx/png/jpg; ≤ 100 MB | user |
| List | `GET /files` | — (scoped to token tenant) | user |
| Read | `GET /files/:id` | `id` = file uuid | user (same tenant) |
| Delete | `DELETE /files/:id` | `id` | user (same tenant) |
| Read content | `GET /files/:id/content?t=` | `id` + dl-token | dl-token (Document Server) |

### ENTITY: Session (editing session = lock + document key)

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| Open / join | `POST /files/:id/sessions` | body `{ "mode": "edit" or "view" }` | user (same tenant) |
| Revoke a participant | `DELETE /files/:id/sessions/current/participants/:userId` | file `id`, `userId` uuid | user (same tenant) |
| Status updates | `POST /onlyoffice/callback` | ONLYOFFICE callback body (`key`, `status`, `url`, `users`, …) | ds-jwt |

### ENTITY: Version

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| List | `GET /files/:id/versions` | file `id` | user (same tenant) |
| Read content | `GET /files/:id/versions/:vid/content?t=` | `vid` + dl-token bound to that version | dl-token |
| Create | — never by a client; only via callback status 2/6, reconciler, or upload | — | system |

### ENTITY: Anchor batch

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| List roots + proofs | `GET /anchor-batches?tenant=&from=&to=` | `tenant` must equal the token's tenant; ISO times | user |
| Create | — hourly job only | — | system |

### ENTITY: System

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| Health | `GET /healthz` | — | public |
| Dev login | `POST /dev/token` | body `{ "userId": uuid }` | public, only when `DEV_LOGIN=true` |
| Test UI | `GET /` static files | — | public |

**CRITICAL rows**
- `POST /onlyoffice/callback` and both `…/content` routes do **not** take a user JWT — they are called by the Document Server. They are marked public in the router and carry their own check (ds-jwt / dl-token). Every other route is user-auth by default.
- A file of another tenant returns **404 FileNotFound**, never 403 (no existence leak).
- `mode: "edit"` can come back as a **view** config (other holder type, over size limit, view-only format) — the response says which mode was granted.

### Multi-step sequence — one edit session

| Step | Operation | Authorized by | Notes |
|------|-----------|---------------|-------|
| 1 | `POST /files/:id/sessions` | user | creates or joins the lock; returns signed editor config with key K and a dl-token URL |
| 2 | Document Server `GET /files/:id/content?t=` | dl-token | fetches the bytes for key K |
| 3 | callback status 1 (repeated) | ds-jwt | participants updated, lease renewed |
| 4 | callback status 6 (optional) | ds-jwt | checkpoint version; key K kept |
| 5 | callback status 2 | ds-jwt | milestone version; lock released; next open gets a new key |
| 5' | callback status 4 | ds-jwt | no changes; lock released; key K kept |

---

## Section B — Actor / Signer Matrix

| Identity | Held by | Roles / permissions needed | Granted at |
|----------|---------|----------------------------|------------|
| Editor user | person in a tenant | user JWT for own tenant | `POST /dev/token` (prototype); Bethel later |
| Tester / operator | person in a tenant | same as editor (revoke, delete, anchor view) | `POST /dev/token` |
| Document Server | `documentserver` container | ds-jwt secret (`DS_JWT_SECRET`); reaches callback + content routes on the Docker network | compose env |
| editing-service → Document Server | `editing-service` | signs command-service calls with `DS_JWT_SECRET` | compose env |
| editing-service → Postgres | `editing-service` | DB role that does not own the tables (least privilege) | migration |
| Master key holder | `editing-service` env `MASTER_KEY` | wraps per-file data keys; never logged | compose env |

---

## Section C — Entity State Machine

```
FILE
  active ──DELETE──► deleted (data key destroyed; terminal)
  Only `active` files can be opened, downloaded or saved; `deleted` → 410 FileDeleted on open,
  callbacks for its keys → 404 UnknownDocumentKey, content → 401/410.

LOCK (per file, at most one)
  none ──open──► held(onlyoffice, lease 30 min)
  held ──join / status 1──► held (lease renewed)
  held ──status 2 committed──► none (key rotated)
  held ──status 4──► none (key kept)
  held ──lease expired AND Document Server no longer holds key──► none (sweeper)
  held(other holder type) ⇒ new opens get view mode

VERSION (immutable once committed)
  kinds: initial | checkpoint | milestone | recovered | conflict
  committed → never updated; only made unreadable by file deletion (crypto-shred)

PARTICIPANT
  joined ──status 1 without user──► left
  joined ──revoke──► revoked (terminal for this session; reopen refused)

ANCHOR BATCH
  (tenant, hour) open ──hour ends + job runs──► sealed (root fixed; one per tenant-hour)
```

---

## Section D — Identifier Convention

| Role / entity | Identifier field | NOT the identifier |
|---------------|-----------------|--------------------|
| Tenant | `tenant` (uuid) — JWT claim | tenant name |
| User | `sub` / `userId` (uuid) | display name |
| File | `id` (uuid) in the path | file name |
| Version | `vid` / `versionId` (uuid) | content hash, created time |
| Session | document `key` (20-char HMAC string) | file id (one file has many keys over time) |
| Anchor leaf | `versionId` | leaf hash |
| Anchor batch | (`tenant`, `windowStart`) | root |

---

## Section E — Event / Webhook → Consumer Map

| Event / signal | Emitted by | Consumed by | Surface that shows the result |
|---------------|-----------|-------------|------------------------------|
| Callback status 1 | Document Server | callback handler | `GET /files/:id` participants; lock lease |
| Callback status 2 | Document Server | callback handler → version store | `GET /files/:id/versions` (milestone) |
| Callback status 6 | Document Server | callback handler → version store | versions (checkpoint) |
| Callback status 3 / 7 | Document Server | callback handler | log alert; lock stays |
| Callback status 4 | Document Server | callback handler | `GET /files` lock = null |
| Forgotten file | Document Server (`getForgottenList`) | reconciler (startup + 5 min) | versions (recovered) + test-UI banner + log line |
| Outbox `version.milestone` | version commit (same transaction) | outbox worker → hourly batch | `GET /anchor-batches` |
| Revoke | `DELETE …/participants/:userId` | command service `drop` | user's editor disconnects ≤ 10 s |
| Lease expired | sweeper (1 min) | command service `info` | `GET /files` lock cleared |

---

## Section F — Error Catalog

| Error | Code / status | Args | Thrown / returned by | Plain English |
|-------|--------------|------|---------------------|---------------|
| ValidationError | 400 | field path | any route (schema) | request body/query has wrong shape or unknown fields |
| UnsupportedFormat | 400 | ext | `POST /files` | extension not allowed or content doesn't match it |
| Unauthenticated | 401 | — | every user route | user JWT missing, expired or invalid |
| InvalidToken | 401 | — | `…/content` routes | download token missing, expired, tampered or for another file/version |
| InvalidCallbackToken | 401 | — | `POST /onlyoffice/callback` | Document Server JWT missing or invalid |
| FileNotFound | 404 | id | file routes | no such file in your tenant |
| VersionNotFound | 404 | vid | version routes | no such version of that file |
| UnknownDocumentKey | 404 | key | callback | key not issued, session closed, or file deleted |
| NoActiveSession | 404 | id | revoke | file has no open session |
| ParticipantNotFound | 404 | userId | revoke | user is not in the session |
| UntrustedDownloadHost | 400 | host | callback | callback `url` is not on the configured Document Server |
| FileDeleted | 410 | id | open session | file was deleted |
| FileTooLarge | 413 | limit | `POST /files` | upload over 100 MB |
| SaveFailed | 500 | — | callback | save could not be committed; Document Server will retry |
| ServiceUnavailable | 503 | failed parts | `GET /healthz` | DB or Document Server unreachable |

---

## Section G — Endpoint Precondition Matrix

| Endpoint | Precondition | Error if not met |
|----------|--------------|------------------|
| `POST /files` | valid user; ext allowed + magic bytes match; ≤ 100 MB | 401 / 400 UnsupportedFormat / 413 |
| `DELETE /files/:id` | valid user; file in user's tenant | 401 / 404 |
| `POST /files/:id/sessions` | file in tenant and active | 404 / 410 |
| `DELETE …/participants/:userId` | open session; user is a participant | 404 NoActiveSession / 404 ParticipantNotFound |
| `POST /onlyoffice/callback` | ds-jwt valid; key issued + session open + file active; `url` host = Document Server | 401 / 404 / 400 |
| `POST /dev/token` | `DEV_LOGIN=true`; userId is a seeded user | 404 (route absent) / 404 |

---

## Section H — Auth / Approval Matrix

| Role | Email verify? | Phone verify? | Admin approval? | Who approves? |
|------|---------------|---------------|------------------|----------------|
| editor / tester (dev user) | No — prototype dev login | No | No | — (Bethel owns real identity later) |

auth-flow.md AF-1…AF-5 (register / OTP) do not apply: the prototype has no registration; identity is Bethel's (SPEC Scope — Out).

---

## Section I — Specific decisions made during this design pass

| # | Decision | Why | Owner | Date |
|---|----------|-----|-------|------|
| 1 | Callback/content routes are public in the router and carry their own auth | Called by the Document Server, not a user | anuhas | 2026-11-25 |
| 2 | Cross-tenant access answers 404, not 403 | No existence leak (FR-006) | anuhas | 2026-11-25 |
| 3 | Upload limit 100 MB; edit limits 25 MB docx / 10 MB xlsx | SRS TBD-001, ADR D6 | anuhas | 2026-11-25 |
| 4 | Delete during editing: drop all, then shred | SRS TBD-003 | anuhas | 2026-11-25 |
| 5 | Recovery notice = recovered version + log line + UI banner (no new endpoint) | SRS TBD-002 | anuhas | 2026-11-25 |

---

## Sign-Off

Single-person prototype: one engineer holds the producer, consumer (test UI / future Bethel caller) and QA
roles. Each line below is anuhas's own sign-off in that capacity, recorded at their explicit instruction
on 2026-11-25. Before Bethel integration, a Bethel engineer (consumer) and an independent QA must re-sign.

- [x] Producer (SE): anuhas — 2026-11-25 — "I confirm Sections A–F match the system I will ship."
- [x] Consumer (test UI / Bethel integration, acting): anuhas (SE) — 2026-11-25 — "I have read this document. I will use it as the source of truth for every call I make."
- [x] QA (acting): anuhas (SE) — 2026-11-25 — "I have read this document. Bug reports will reference its row numbers, not source code."
