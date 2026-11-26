# INTERFACE_AGREEMENT.md
# Source-of-truth contract between every role on the project. Produced before code is written.
#
# Status: REWORDED FOR WOPI (DEC-001 draft) — RE-SIGN REQUIRED (IA-4: endpoints, errors and state machine changed). v1 was signed 2026-11-25.
# Last updated: 2026-11-26
# Project type: backend (API + WOPI host for ONLYOFFICE Document Server + static test UI)
# Sources: SPEC.md (approved 2026-11-25) · docs/decisions/001-onlyoffice-editing-service.md (D1–D8) · docs/decisions/003-wopi-primary-editing-path.md · docs/SRS.md v0.2
#
# Error body for every error below: { "error": { "code": "NamedCode", "message": "text" } }
# Exception: WOPI endpoints answer in WOPI's own shapes (status codes and `X-WOPI-*` headers, binary file body); lock conflicts are 409 with `X-WOPI-Lock`.

---

## Section A — Access Reference Map

Auth tiers used below:
- **user** — `Authorization: Bearer` user JWT (HS256, claims `sub`, `tenant`, `name`, `exp`); acts only on its own tenant's files.
- **dl-token** — query `t` = HMAC download token bound to {fileId, versionId}, 5-minute expiry (old-version content only).
- **wopi-token** — `access_token` query parameter or `Authorization: Bearer`; HMAC-signed, bound to {fileId, userId, mode}, 1-hour expiry. The WOPI calls come from the Document Server but are authorised by this token.
- **ds-jwt** — Document Server JWT (shared secret); used only on command-service calls the service makes to the Document Server.
- **public** — no auth.

### ENTITY: File

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| Create | `POST /files` (multipart field `file`) | file bytes; ext docx/xlsx/pdf/pptx/png/jpg; ≤ 100 MB | user |
| List | `GET /files` | — (scoped to token tenant) | user |
| Read | `GET /files/:id` | `id` = file uuid | user (same tenant) |
| Delete | `DELETE /files/:id` | `id` | user (same tenant) |
| WOPI read | `GET /wopi/files/:id` (CheckFileInfo), `GET /wopi/files/:id/contents` (GetFile) | `id` + `access_token` | wopi-token (Document Server) |
| WOPI write | `POST /wopi/files/:id/contents` with `X-WOPI-Override: PUT` (PutFile) | `id`, `X-WOPI-Lock`, `access_token`, file bytes | wopi-token (needs write mode) |
| WOPI lock | `POST /wopi/files/:id` with `X-WOPI-Override` = LOCK / UNLOCK / REFRESH_LOCK / UNLOCK_AND_RELOCK / GET_LOCK | `id`, `X-WOPI-Lock` | wopi-token |

### ENTITY: Session (editing session = lock + lock id)

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| Open / join | `POST /files/:id/sessions` | body `{ "mode": "edit" or "view" }`; returns `{editorUrl, formFields, heartbeatMs, mode, user, title}` | user (same tenant) |
| Revoke a participant | `DELETE /files/:id/sessions/current/participants/:userId` | file `id`, `userId` uuid | user (same tenant) |
| Presence | `POST /wopi-sessions/:id/heartbeat`, `POST /wopi-sessions/:id/leave` | body `{access_token, wait?}` | wopi-token |

### ENTITY: Version

| Action | What to call | Args / identifier | Authorized by |
|--------|--------------|-------------------|---------------|
| List | `GET /files/:id/versions` | file `id` | user (same tenant) |
| Read content | `GET /files/:id/versions/:vid/content?t=` | `vid` + dl-token bound to that version | dl-token |
| Create | — never by a client; only via PutFile, reconciler (on hold), or upload | — | system |

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
- The `/wopi/…` routes, `/wopi-sessions/…` and the version `…/content` route do **not** take a user JWT — they are called by the Document Server or the editing page. They are marked public in the router and carry their own check (wopi-token / dl-token). Every other route is user-auth by default. The `access_token` is a credential: it must never be logged, including inside URLs.
- A file of another tenant returns **404 FileNotFound**, never 403 (no existence leak).
- `mode: "edit"` can come back as a **view** config (other holder type, over size limit, view-only format) — the response says which mode was granted.

### Multi-step sequence — one edit session

| Step | Operation | Authorized by | Notes |
|------|-----------|---------------|-------|
| 1 | `POST /files/:id/sessions` | user | creates or joins the session; returns the editor address and a wopi-token |
| 2 | page form-POSTs the token into the editor iframe | — | Document Server opens the file |
| 3 | Document Server `GET /wopi/files/:id` then `…/contents`; `LOCK` | wopi-token | file information and bytes; lock id L accepted |
| 4 | heartbeat / `REFRESH_LOCK` (repeated) | wopi-token | participants updated, lease renewed |
| 5 | `PutFile` under L (force-save, optional while editing) | wopi-token | checkpoint version; lock kept |
| 6 | last editor leaves → service `forcesave` → `PutFile` → `drop` → `UNLOCK` | wopi-token / ds-jwt (command) | milestone version; lock released (UNLOCK arrives about 2 minutes after drop, measured) |
| 6' | `UNLOCK` with no save | wopi-token | no changes; lock released |

---

## Section B — Actor / Signer Matrix

| Identity | Held by | Roles / permissions needed | Granted at |
|----------|---------|----------------------------|------------|
| Editor user | person in a tenant | user JWT for own tenant | `POST /dev/token` (prototype); Bethel later |
| Tester / operator | person in a tenant | same as editor (revoke, delete, anchor view) | `POST /dev/token` |
| Document Server | `documentserver` container | reaches the WOPI routes on the Docker network and presents the user's wopi-token | compose env |
| editing-service → Document Server | `editing-service` | signs command-service calls with `DS_JWT_SECRET` | compose env |
| editing-service → Postgres | `editing-service` | DB role that does not own the tables (least privilege) | migration |
| Master key holder | `editing-service` env `MASTER_KEY` | wraps per-file data keys; never logged | compose env |

---

## Section C — Entity State Machine

```
FILE
  active ──DELETE──► deleted (data key destroyed; terminal)
  Only `active` files can be opened, downloaded or saved; `deleted` → 410 FileDeleted on open,
  WOPI calls for it → 404 FileNotFound, content → 401/410.

LOCK (per file, at most one)
  none ──open / LOCK──► held(onlyoffice, lock id L, lease 30 min)
  held ──join / REFRESH_LOCK / heartbeat──► held (lease renewed)
  held ──PutFile under L──► held (checkpoint committed)
  held ──UNLOCK after a committed save──► none (milestone)
  held ──UNLOCK with no save──► none
  held ──lease expired AND Document Server no longer holds key──► none (sweeper)
  held(other holder type) ⇒ new opens get view mode

VERSION (immutable once committed)
  kinds: initial | checkpoint | milestone | recovered | conflict
  committed → never updated; only made unreadable by file deletion (crypto-shred)

PARTICIPANT
  joined ──leave / heartbeat missed past the presence TTL──► left
  joined ──revoke──► revoked (terminal for this session; token refused, reopen refused)

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
| Session | WOPI lock id (`X-WOPI-Lock`) | file id (one file has many sessions over time) |
| Anchor leaf | `versionId` | leaf hash |
| Anchor batch | (`tenant`, `windowStart`) | root |

---

## Section E — Event / Webhook → Consumer Map

| Event / signal | Emitted by | Consumed by | Surface that shows the result |
|---------------|-----------|-------------|------------------------------|
| REFRESH_LOCK / heartbeat | Document Server / editing page | WOPI handler | `GET /files/:id` participants; lock lease |
| PutFile at close (after `forcesave`) | Document Server | WOPI handler → version store | `GET /files/:id/versions` (milestone) |
| PutFile while editing | Document Server | WOPI handler → version store | versions (checkpoint) |
| Failed PutFile | WOPI handler | log alert | lock stays |
| UNLOCK | Document Server | WOPI handler | `GET /files` lock = null |
| Leave message / missed heartbeats | editing page / presence sweeper | presence handler → `forcesave` then `drop` | session ends; milestone version |
| Forgotten file (ON HOLD) | Document Server (`getForgottenList`) | reconciler (startup + 5 min) | versions (recovered) + test-UI banner + log line — untested under WOPI |
| Outbox `version.milestone` | version commit (same transaction) | outbox worker → hourly batch | `GET /anchor-batches` |
| Revoke | `DELETE …/participants/:userId` | wopi-token refused + command service `drop` | user's editor disconnects (target ≤ 10 s, unmeasured) |
| Lease expired | sweeper (1 min) | command service `info` | `GET /files` lock cleared |

---

## Section F — Error Catalog

| Error | Code / status | Args | Thrown / returned by | Plain English |
|-------|--------------|------|---------------------|---------------|
| ValidationError | 400 | field path | any route (schema) | request body/query has wrong shape or unknown fields |
| UnsupportedFormat | 400 | ext | `POST /files`, PutFile | extension not allowed or content doesn't match it |
| Unauthenticated | 401 | — | every user route | user JWT missing, expired or invalid |
| InvalidToken | 401 | — | version `…/content` route, `/wopi/…` routes | download token or access token missing, expired, tampered or for another file/version |
| LockMismatch | 409 + `X-WOPI-Lock` | current lock id | PutFile, lock operations | the lock id presented is not the live lock (or the file is not locked) |
| ReadOnlyToken | 403 | — | PutFile, lock operations | access token is in view mode |
| UnsupportedOperation | 501 | — | `POST /wopi/files/:id` | WOPI override not supported |
| FileNotFound | 404 | id | file routes | no such file in your tenant |
| VersionNotFound | 404 | vid | version routes | no such version of that file |
| NoActiveSession | 404 | id | revoke | file has no open session |
| ParticipantNotFound | 404 | userId | revoke | user is not in the session |
| FileDeleted | 410 | id | open session | file was deleted |
| FileTooLarge | 413 | limit | `POST /files` | upload over 100 MB |
| SaveFailed | 500 | — | PutFile | save could not be committed (whether the Document Server retries is untested) |
| ServiceUnavailable | 503 | failed parts | `GET /healthz` | DB or Document Server unreachable |

---

## Section G — Endpoint Precondition Matrix

| Endpoint | Precondition | Error if not met |
|----------|--------------|------------------|
| `POST /files` | valid user; ext allowed + magic bytes match; ≤ 100 MB | 401 / 400 UnsupportedFormat / 413 |
| `DELETE /files/:id` | valid user; file in user's tenant | 401 / 404 |
| `POST /files/:id/sessions` | file in tenant and active | 404 / 410 |
| `DELETE …/participants/:userId` | open session; user is a participant | 404 NoActiveSession / 404 ParticipantNotFound |
| `POST /wopi/files/:id/contents` (PutFile) | wopi-token valid, write mode; live lock id presented; bytes match the file type; file active | 401 / 403 / 409 / 400 / 404 |
| `POST /wopi/files/:id` (lock operations) | wopi-token valid, write mode; for UNLOCK / REFRESH_LOCK the lock id matches | 401 / 403 / 409 / 501 |
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
| 1 | WOPI, presence and version-content routes are public in the router and carry their own auth (wopi-token / dl-token) | Called by the Document Server or the editing page, not a user JWT | anuhas | 2026-11-25 (reworded 2026-11-26, re-sign pending) |
| 6 | WOPI replaces the ONLYOFFICE callback as the primary editing path | DEC-001 draft; ADR-003 | pending | pending |
| 2 | Cross-tenant access answers 404, not 403 | No existence leak (FR-006) | anuhas | 2026-11-25 |
| 3 | Upload limit 100 MB; edit limits 25 MB docx / 10 MB xlsx | SRS TBD-001, ADR D6 | anuhas | 2026-11-25 |
| 4 | Delete during editing: drop all, then shred | SRS TBD-003 | anuhas | 2026-11-25 |
| 5 | Recovery notice = recovered version + log line + UI banner (no new endpoint) | SRS TBD-002 | anuhas | 2026-11-25 |

---

## Sign-Off

Single-person prototype: one engineer holds the producer, consumer (test UI / future Bethel caller) and QA
roles. Each line below is anuhas's own sign-off in that capacity, recorded at their explicit instruction
on 2026-11-25. Before Bethel integration, a Bethel engineer (consumer) and an independent QA must re-sign.

- [ ] Producer (SE): re-sign pending — v1 signed by anuhas 2026-11-25; Sections A–F changed for WOPI
- [ ] Consumer (test UI / Bethel integration, acting): re-sign pending — v1 signed by anuhas (SE) 2026-11-25
- [ ] QA (acting): re-sign pending — v1 signed by anuhas (SE) 2026-11-25
