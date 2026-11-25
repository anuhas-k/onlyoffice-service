# SPEC: ONLYOFFICE editing service (prototype)
_Last updated: 2026-11-25 | Sprint: 0 (prototype) | Owner: anuhas (SE)_

Design decisions and their reasons live in `docs/decisions/001-onlyoffice-editing-service.md`
(cited below as **ADR D1–D8**). This SPEC states *what* is built and how it is accepted; it does
not repeat the reasoning.

---

## Problem Statement

Users of the Bethel platform currently can't edit a Word, Excel or fillable-PDF file without
downloading it, which means the file leaves the platform's protected storage and several people
can't work on it together. We will fix this with an editing service that opens a file in a
self-hosted ONLYOFFICE Document Server inside the browser, lets several users co-edit it live and
see each other, and turns every save into an immutable, fingerprinted version. This prototype
proves the design in `docs/source/Collaborative Editing Dual-Engine Design (...).pdf` works before
it is integrated into Bethel.

---

## Success Criteria

Each criterion is a QA acceptance check. IDs are referenced by tasks and tests.

- [ ] **AC-1 Runs from one command.** `docker compose up` starts `editing-service`,
  `documentserver` and `db`; `GET /healthz` returns 200 with DB and Document Server both `ok`
  within 3 minutes of a cold start.
- [ ] **AC-2 Edit in browser, no download.** A user uploads a `.docx`, opens it from the test UI and
  edits it in the embedded editor. The file is never offered as a browser download during editing.
- [ ] **AC-3 Co-editing.** Two users in two browser windows open the same file; each sees the
  other's cursor and name and the other's typing within 2 s (fast co-editing mode).
- [ ] **AC-4 Save becomes a version.** When all users close the file, exactly one new **milestone**
  version appears in `GET /files/:id/versions` within 10 s, listing both users as participants.
- [ ] **AC-5 Force-save checkpoint.** A force-save during editing creates a **checkpoint** version
  and the live session continues uninterrupted (document key unchanged).
- [ ] **AC-6 Fresh key after save.** After a milestone save, reopening the file serves the new
  content (never a cached copy) under a new document key.
- [ ] **AC-7 No duplicate versions.** Replaying the same status-2 callback (same key, same content)
  returns `{"error":0}` and creates no second version. A save identical to the head creates none.
- [ ] **AC-8 No lost saves — backend down.** With `editing-service` stopped while users close the
  file, the save is recovered after restart (via callback retry or the forgotten-file reconciler)
  as a version within 6 min of restart.
- [ ] **AC-9 Forged callback rejected.** A callback with a missing/invalid JWT, an unknown key, or a
  `url` on any host other than the configured Document Server is rejected and creates nothing.
- [ ] **AC-10 No cross-file access.** A document key or download token issued for file A never
  returns file B's content; an expired (> 5 min) or tampered token returns 401.
- [ ] **AC-11 Lock + lease.** While a session is open the file shows its lock holder; an
  abandoned lock is released within 1 min of its lease expiring once the Document Server no
  longer holds the document.
- [ ] **AC-12 Revoke mid-session.** Revoking a user disconnects them from the editor within 10 s;
  they cannot rejoin with the old config.
- [ ] **AC-13 Size limit.** A file above the limit (25 MB `.docx`, 10 MB `.xlsx`) opens view-only.
- [ ] **AC-14 Crypto-shredding.** `DELETE /files/:id` destroys the file's data key; afterwards no
  version of the file can be decrypted, and its anchor leaves still verify against their roots.
- [ ] **AC-15 Merkle roots.** The hourly batch produces one root per tenant per hour over that
  hour's milestone leaves; `GET /anchor-batches` returns roots and per-leaf proofs that verify.
- [ ] **AC-16 No secrets in logs.** No log line contains a JWT, download token, or callback `url`
  query string (checked by a test that greps captured logs).

---

## Scope — In

- Docker Compose stack: `editing-service`, `documentserver` (pinned `onlyoffice/documentserver`),
  `db` (`postgres:16`) — ADR D8.
- Editing service (TypeScript, Node 20, Fastify, Drizzle) with the 13 endpoints below.
- Lock table with 30-min lease, join-same-session co-editing, sweeper — ADR D4.
- Document-key service (HMAC, rotate only after milestone commit) — ADR D3.
- Version store: immutable encrypted blobs on a local volume, checkpoint vs milestone,
  content-hash dedup — ADR D2, D5.
- Callback reliability: synchronous download + commit, 500-to-retry, idempotency, forgotten-file
  reconciler, outbox — ADR D2.
- `StorageGateway` interface with a local-disk implementation (the Bethel seam) — ADR D1.
- Per-file data keys (AES-256-GCM) wrapped by a master key from env; crypto-shredding delete.
- Merkle batching per tenant per hour with salted leaves; roots stored, not anchored — ADR D5.
- Test UI (static HTML/JS served by `editing-service`): dev login, upload, file list with lock
  state, open editor, version list, revoke button, anchor batch view.
- Formats: `.docx`, `.xlsx` edit; fillable `.pdf` form fill; `.pptx` and images view-only.

---

## Scope — Out

- Microsoft 365 for the web / WOPI / CSPP — needs Microsoft approval; later phase.
- Desktop agent — separate product.
- Own presence service (file-list avatars, "editing in desktop" badge) — editor's built-in cursors
  and names are enough for the prototype.
- On-chain anchoring, wallet, smart contract — roots are computed only.
- Real Bethel storage and auth — behind `StorageGateway` and the token verifier.
- Multiple Document Servers / load balancing — designed in (`shardkey`), not deployed.
- Redis — PostgreSQL covers locks, outbox and idempotency.

---

## Technical Approach

### Data Model

```
tenants        id uuid PK, name
users          id uuid PK, tenant_id FK, display_name, avatar_url          -- dev users (Bethel later)

files          id uuid PK, tenant_id FK, name, ext, size_bytes,
               head_version_id FK versions NULL, created_by FK users,
               created_at, deleted_at NULL
file_keys      file_id PK FK, wrapped_dek bytea, created_at, destroyed_at NULL

versions       id uuid PK, file_id FK, parent_version_id FK NULL,
               kind  enum(initial|checkpoint|milestone|recovered|conflict),
               document_key text, content_sha256 char(64), size_bytes,
               blob_path text, participants jsonb, salt bytea NULL,
               created_at
               UNIQUE (file_id, document_key, content_sha256)          -- idempotency (ADR D2)

locks          file_id PK FK, holder_type enum(onlyoffice|desktop|m365),
               session_key text UNIQUE, base_version_id FK versions,
               lease_expires_at, created_at

doc_keys       key text PK, file_id FK, version_id FK, issued_at,
               closed_at NULL                                          -- key → file lookup (ADR D3)

participants   session_key FK doc_keys, user_id FK, joined_at, left_at NULL, revoked_at NULL

outbox         id bigserial PK, topic text, payload jsonb, created_at,
               processed_at NULL, attempts int

anchor_batches id uuid PK, tenant_id FK, window_start, window_end,
               merkle_root char(64), leaf_count, created_at
               UNIQUE (tenant_id, window_start)
anchor_leaves  version_id PK FK, batch_id FK, leaf_hash char(64), leaf_index int
```

Download tokens are stateless: HMAC-signed `{fileId, versionId, key, exp}` (5 min) — no table.

### API Contracts

All errors use one shape: `{ "error": { "code": "<NamedCode>", "message": "<text>" } }`.
Auth on UI endpoints: `Authorization: Bearer <user JWT>` (claims `sub`, `tenant`, `name`).

```
POST   /dev/token                    body {userId}                 → 200 {token}          (prototype only)
POST   /files            multipart  file                          → 201 {file}
         errors 400 UnsupportedFormat · 413 FileTooLarge
GET    /files                                                     → 200 {files:[{id,name,ext,lock}]}
GET    /files/:id                                                 → 200 {file, lock, participants}
         errors 404 FileNotFound
DELETE /files/:id                                                 → 204
POST   /files/:id/sessions           body {mode: edit|view}       → 200 {documentServerUrl, config}
         config = signed ONLYOFFICE config (document.key, document.url, editorConfig.callbackUrl,
                  editorConfig.user, editorConfig.coEditing.mode = "fast", token)
         mode is downgraded to view when: other holder type has the lock · file over size limit ·
                  format is view-only
         errors 404 FileNotFound · 410 FileDeleted
DELETE /files/:id/sessions/current/participants/:userId          → 204
         errors 404 NoActiveSession
GET    /files/:id/content?t=<token>                               → 200 <bytes>   (Document Server)
         errors 401 InvalidToken
POST   /onlyoffice/callback          ONLYOFFICE callback body     → 200 {"error":0}
         errors 401 InvalidCallbackToken · 404 UnknownDocumentKey · 400 UntrustedDownloadHost
                500 SaveFailed (Document Server retries)
GET    /files/:id/versions                                        → 200 {versions:[...]}
GET    /files/:id/versions/:vid/content?t=<token>                 → 200 <bytes>
GET    /anchor-batches?tenant=&from=&to=                          → 200 {batches:[{root, leaves:[{versionId, proof}]}]}
GET    /healthz                                                   → 200 {db, documentServer} | 503
```

Callback status handling is fixed by ADR D2 (table "Status → Action").

### Key Files

| File Path | Purpose | Assigned to |
|-----------|---------|------------|
| `docker-compose.yml`, `Dockerfile`, `docker/documentserver/local.json` | stack + Document Server config (retries, private-IP download) | SE |
| `src/app.ts`, `src/server.ts`, `src/config.ts` | Fastify wiring, env config | SE |
| `src/db/schema.ts`, `drizzle/` migrations | data model above | SE |
| `src/modules/auth/` | dev token issuer, JWT verify hook | SE |
| `src/modules/files/` | upload, list, get, delete | SE |
| `src/modules/storage/` | `StorageGateway` + local encrypted implementation, key wrapping | SE |
| `src/modules/sessions/` | locks, doc keys, editor config, revoke, sweeper | SE |
| `src/modules/callback/` | callback handler, download, idempotent commit | SE |
| `src/modules/versions/` | version list, version content | SE |
| `src/modules/ds-client/` | Document Server command service client (`info`, `drop`, `forcesave`, forgotten) | SE |
| `src/modules/anchoring/` | outbox worker, Merkle batching, proofs | SE |
| `public/` | test UI | SE |
| `tests/` | unit, integration (real Postgres), PBT | SE / QA |

### Dependencies

- `onlyoffice/documentserver` (Docker, pinned version) — the editing engine.
- `fastify`, `@fastify/multipart`, `@fastify/static` — HTTP server, uploads, test UI.
- `drizzle-orm`, `drizzle-kit`, `pg` — PostgreSQL access and migrations.
- `jose` — JWT signing/verification (Document Server and user tokens).
- `undici` (bundled `fetch`) — callback downloads and command-service calls.
- Node `crypto` — AES-256-GCM, HMAC, SHA-256 (no extra crypto library).
- `vitest`, `fast-check`, `testcontainers` — tests.
- `@playwright/test` — test-UI browser tests (Chromium + Firefox).

### Performance Constraints

- Open → editable: p95 < 3 s on LAN.
- Status-2 callback handled: p95 < 5 s for a 10 MB file.
- Concurrent editors: ≤ 20 per Document Server (Community Edition limit; verify on the pinned version).
- File size for editing: 25 MB `.docx`, 10 MB `.xlsx`; larger → view-only.

---

## Security Requirements

- **Authentication:** every UI endpoint requires a user JWT. `/files/:id/content` and
  `/versions/:vid/content` require a 5-min HMAC token bound to file + key. `/onlyoffice/callback`
  requires the Document Server JWT. `/healthz` and static UI are public. Document Server runs with
  `JWT_ENABLED=true`.
- **Authorization:** users act only on files in their own tenant (checked on every file lookup).
- **Sensitive data:** file contents encrypted at rest per file (AES-256-GCM); master key from env,
  never logged. Plaintext exists only in memory, the temp dir (deleted after commit) and the
  Document Server container — stated trade-off, ADR D1.
- **Input validation:** JSON-schema on every route; upload extension + magic-byte check;
  callback `url` host must equal the configured Document Server host (SSRF).
- **Logging:** a single redactor strips `Authorization`, `token`, `t=` and callback `url` query
  strings before any log write (AC-16).
- **Rate limiting:** not in the prototype (single trusted tester) — `shortcut: no rate limit, add
  before any shared/staging deployment`.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Document Server refuses downloads from private Docker IPs | High | High | `local.json` request-filtering setting; first task verifies end-to-end |
| Callback URL expiry shorter than expected | Med | High | synchronous download; measure actual expiry on pinned version |
| Community Edition connection limit blocks co-edit tests | Low | Med | ≤ 20 connections in tests; Developer Edition if needed |
| Key reuse serves stale or wrong content | Low | High | HMAC keys + key→file table; AC-6, AC-10 tests |
| Zero-knowledge property broken during editing | Certain | High | stated in ADR D1; temp files on encrypted volume; Bethel decision before production |
| Font / Sinhala / Tamil rendering issues | Med | Med | spot-check sample documents; record findings (design doc Q21–22) |

### Fault Isolation Matrix

| If this fails | Still works | Stops |
|---|---|---|
| Document Server down | file list, upload, versions, anchors | opening/editing; `/healthz` 503 |
| `editing-service` down | users already editing keep typing (Document Server holds the session) | opening new sessions; saves retried, then recovered by reconciler (AC-8) |
| Postgres down | live editing in open sessions | open, save commit (callback returns 500 → retry), lists |
| Outbox worker stalled | editing, saving, versions | Merkle batches lag; caught up on next run |
| Version blob volume full | editing | save commit fails → 500 → retry/forgotten; alert |

---

## Explicitly Out of Scope

- Microsoft 365 tier and per-tenant engine routing — only one engine exists in the prototype.
- Desktop-Word conflict resolution UI — the `conflict` version kind exists; no merge UI.
- Customer-managed keys (design doc Q13) and confidential VMs (Q12) — production decisions.
- Mouse-pointer tracking (Q16) — editors don't support it; privacy concern.
- Audit-log UI (Q20) — participants are recorded per version; no activity panel.

---

_Approved by SE: [x] anuhas | Date: 2026-11-25 | Next: /ba srs → /factory tasks_
