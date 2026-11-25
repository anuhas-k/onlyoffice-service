# ADR-001 — ONLYOFFICE editing service: design decisions for the prototype

- **Status:** Accepted for the prototype (2026-11-25). Revisit before production.
- **Source:** `docs/source/Collaborative Editing Dual-Engine Design (...).pdf` — gaps found in review.
- **Scope:** ONLYOFFICE Document Server (Docker) + one editing service + a small test UI.
  Out: Microsoft 365 / WOPI, desktop agent, on-chain anchoring, real Bethel integration.

Facts marked *(verify)* come from ONLYOFFICE community posts, not official docs; the prototype must confirm them.

---

## D1 — Bethel storage stays behind a port (decides gap 1 + 2 for now)

**Problem.** Bethel storage is zero-knowledge, but the engine needs plaintext to render and merge.
The design doc never says who decrypts, where, or how the save goes back.

**Decision.**
- The editing service talks to storage only through a `StorageGateway` interface:
  `openForEdit(fileId, userCtx) → {versionId, stream}` and
  `commitVersion(fileId, baseVersionId, stream, meta) → versionId`.
- Prototype: a local-disk implementation with per-file encryption (D5). Bethel later
  supplies the real one; nothing else in the service changes.
- Decryption happens in the gateway, never in the browser-facing layer. The Document Server
  fetches the file from **our** service through a 5-minute signed URL bound to `fileId + key`
  (not strictly single-use: the Document Server may retry the download) — never from
  Bethel storage directly.
- **Stated trade-off:** while a file is open for editing, plaintext exists in the Document Server
  container and in this service's memory/temp files. The zero-knowledge property does **not** hold
  during an edit session. This must be said to the team plainly (doc §5 says the same).
  Mitigations: temp files on an encrypted volume, deleted on commit; Document Server cache
  cleanup; download URLs expire in 5 minutes and are bound to one file + key.

**Interface styles.**
- Our own API: **REST** over HTTP/JSON (resources: files, versions, sessions, anchor batches).
- Document Server → us: a **webhook** (`POST /onlyoffice/callback`) whose shape ONLYOFFICE dictates.
- Us → Document Server: **RPC** — its command service is one `POST {DS}/command` endpoint with
  the command in the body (`"c": "info" | "drop" | "forcesave" | "getForgottenList" | "getForgotten"`),
  JWT-signed, `?shardkey=<key>`.
- No gRPC: the browser and the Document Server only speak HTTP/JSON.

**Endpoints (prototype).** Rows marked *Bethel-owned later* exist only because the prototype has
no Bethel; in production Bethel provides them.

| # | Endpoint | Caller | Purpose |
|---|---|---|---|
| 1 | `POST /files` (multipart) | UI | upload a file → version 1 (*Bethel-owned later*) |
| 2 | `GET /files` | UI | list files with lock state |
| 3 | `GET /files/:id` | UI | file metadata + lock holder + participants |
| 4 | `DELETE /files/:id` | UI | crypto-shred: destroy data key (*Bethel-owned later*) |
| 5 | `POST /files/:id/sessions` `{mode}` | UI | auth → lock (join or create) → signed editor config |
| 6 | `DELETE /files/:id/sessions/current/participants/:userId` | UI / Bethel | revoke mid-session → command `drop` |
| 7 | `GET /files/:id/content?t=<token>` | Document Server | download current version (token: 5 min, bound to fileId + key) |
| 8 | `POST /onlyoffice/callback` | Document Server | status webhook (D2) |
| 9 | `GET /files/:id/versions` | UI | version list (checkpoints collapsed) |
| 10 | `GET /files/:id/versions/:vid/content?t=<token>` | UI / Document Server | an old version (history view) |
| 11 | `GET /anchor-batches` | UI | Merkle roots per tenant-hour + leaf proofs |
| 12 | `GET /healthz` | Docker | liveness + DB + Document Server reachability |
| 13 | `POST /dev/token` | UI | prototype-only test token issuer (*replaced by Bethel auth*) |

Background jobs (no endpoint): lock sweeper (1 min), forgotten-file reconciler (5 min),
outbox worker (Merkle batching, hourly).

**Layering.** Fastify route (JSON-schema validation, auth hook) → module service → Drizzle
repository / `StorageGateway` / `DocumentServerClient`. Modules: `files`, `sessions` (locks + keys),
`versions`, `callback`, `anchoring`, `ds-client`, `auth`.

Auth: callers present a short-lived JWT (user, tenant, fileId, permission). Prototype uses a dev
issuer; Bethel issues it later. Revocation (Q31) uses the command service `drop` command.

## D2 — Reliable saving (gap 3: Q25, Q26)

**Facts.** The Document Server retries a callback on HTTP 429/5xx, 3 times by default, backoff from
1 s × 2 (`services.CoAuthoring.callbackBackoffOptions`, override in `local.json`). The `url` in a
callback expires — 900 s by default *(verify)*. Unsaved changes go to the server's "forgotten" folder,
listed by command service `getForgottenList` / `getForgotten` (7.5+; 10.0 also does this on shutdown).

**Decision.**
1. **Download inside the request, not from a queue.** The URL is short-lived, so the handler
   downloads it at once, hashes it (SHA-256), and commits the version in one DB transaction —
   then answers `{"error":0}`.
2. **Any failure → HTTP 500.** That makes the Document Server retry. Raise retries to 6
   (≈ 1 min of backoff) in `local.json`.
3. **Reconciler for the backend-down case.** On startup and every 5 min, call
   `getForgottenList`, ingest each forgotten file as a version tagged `recovered`, and notify the
   file's last editors. Users never have to save locally.
4. **Idempotency.** Unique constraint on `(file_id, document_key, content_sha256)`. A duplicate
   callback hits the constraint → answer `{"error":0}`, create nothing. A save whose hash equals
   the current head is acknowledged without a new version.
5. **Keep the document key until status 2 is committed** — rotate only after the commit, so a
   retried callback still matches a known session.
6. **Post-processing goes through an outbox table** (Merkle batching, notifications), written in
   the same transaction as the version. Saving never waits on it.
7. **Callback trust (Q30).** Verify the JWT (header or body `token`), require the key to match an
   open session, and only download from the configured Document Server host (block any other
   host — SSRF). Never log the URL query string or tokens (Q29).

| Status | Action |
|---|---|
| 1 editing | update participants, renew lease |
| 2 ready to save | download → commit **milestone** → release lock → rotate key |
| 3 save error | keep lock, log, alert |
| 4 closed, no changes | release lock, keep key |
| 6 force-save | download → commit **checkpoint**; **do not rotate the key** (session still live) |
| 7 force-save error | log, alert |

**Correction to the design doc §4:** "new key after every save" is right for status 2 only.
Rotating on a force-save (6) would break the live co-editing session.

## D3 — Document keys (Q28)

`key = base64url(HMAC-SHA256(KEY_SECRET, fileId ":" versionId))`, first 20 chars of ONLYOFFICE's
allowed charset (≤ 128). Unique per version, unguessable, and stable for a session. A key → file
lookup table makes cross-file leaks impossible: the service never trusts a key it did not issue.

## D4 — Locks (gap 4: Q6, Q7)

- One lock row per file: `file_id, holder_type, session_key, lease_expires_at, base_version_id`.
- **Co-editors share the lock.** A second ONLYOFFICE user joins the same session (same key) and
  edits live. View-only applies only when the file is held by a *different* holder type
  (desktop / m365 later).
- **Lease 30 min**, the same as the WOPI standard. It is renewed by status-1 callbacks and every
  `POST /sessions` join.
- **Abandonment:** the Document Server closes a session itself after the last user leaves
  (status 2 or 4). The lease is only a safety net: a sweeper (every 1 min) checks expired leases
  with command `info` and releases them only if the server no longer has the document.
- **Late save (Q7), decided now for later:** a save whose `base_version_id` ≠ head is never
  merged automatically. It is stored as a **conflict version** next to the head, and the UI offers both.

## D5 — Immutable versions vs deletion (gap 5: Q8, Q9, Q10)

- **Crypto-shredding.** Each file has its own data key (AES-256-GCM), wrapped by a master key.
  Version blobs are immutable. Deleting a file = destroy its data key, then delete blobs as best effort.
  The data is unreadable the moment the key is gone.
- **Retention:** checkpoints kept 30 days, milestones until the file is deleted.
- **Anchoring (prototype computes roots only, no chain):**
  - Leaf = `SHA-256(salt ‖ content_sha256 ‖ version_id)`, with a per-version random salt stored
    with the version and destroyed with the key. A bare content hash would let anyone confirm a
    guessed document. The salt prevents that, and deletion makes the leaf meaningless.
  - Only **milestones** are anchored (Q9).
  - Trees are **per tenant per hour** (Q8): a proof never exposes another tenant's leaves, and cost
    is bounded by one root per tenant per hour.

## D6 — Measurable targets for the prototype (gap 6)

| Target | Value |
|---|---|
| Concurrent editors on one Document Server | ≤ 20 (Community Edition limit; reportedly removed in 9.4 *(verify)*) |
| Max file size for in-browser editing (Q24) | 25 MB `.docx`, 10 MB `.xlsx` — above → view-only |
| Open → editable | p95 < 3 s on LAN |
| Status-2 callback handled | p95 < 5 s for a 10 MB file |
| Lost saves | **0** under: backend restart mid-callback, duplicate callback, Document Server graceful restart |
| Cross-file leak | **0** — a reused or forged key must never open another file |

Production numbers (availability, regions, editor counts) are open until Bethel's load is known.

## D7 — Scope (gap 7)

**In:** Document Server in Docker Compose, the editing service (Fastify + Drizzle + PostgreSQL),
lock table, key service, versioning with crypto-shredding, callback reliability + reconciler,
Merkle root computation, a test UI with two browser windows.

**Out:** Microsoft 365 / WOPI and CSPP, desktop agent, own presence service (the editor's
built-in cursors and names are enough for the prototype), on-chain anchoring, real Bethel storage,
multi-server clustering. Clustering is designed in, though: every command-service call sends
`shardkey=<document key>` (8.1+), so one file's editors always land on one server (Q42).

Redis is dropped for the prototype: PostgreSQL holds the locks, outbox and idempotency.

## D8 — Packaging: one service, three containers (Docker Compose)

The editing service is a standalone service Bethel calls over HTTP. It runs as one Compose stack:

| Container | Image | Exposed to |
|---|---|---|
| `editing-service` | built from this repo (Node 20, Fastify); also serves the test UI as static files | browser (API + UI), Document Server (callback, download) |
| `documentserver` | `onlyoffice/documentserver` (pinned version), `JWT_ENABLED=true`, `JWT_SECRET` from env | browser (editor iframe + websocket), `editing-service` (command service) |
| `db` | `postgres:16` | `editing-service` only |

- The Document Server must be its own container: it is a large product with its own internal
  processes. It is not built or modified here — only configured (`local.json` mount for callback retries
  and private-IP download).
- Three network paths must work: browser → both public containers; Document Server →
  `editing-service` (callback + file download, Docker network); `editing-service` → Document Server
  (command service). The browser talks to the Document Server directly, so it is not purely internal.
- Data volumes: Postgres data, version blobs, Document Server cache/forgotten files.
- This ADR is the SD-1 decision record for adding these containers.
- Production differences: the Bethel-owned endpoints (upload, list, delete, dev token) move to Bethel;
  the Document Server can scale to several instances behind a load balancer routed by `shardkey`.

## Consequences

- The prototype can be built without Bethel; the gateway is the only seam to replace.
- The zero-knowledge gap during editing is explicit, not hidden.
- Known setup risk *(verify)*: the Document Server may refuse to download from private IPs
  (the Docker network) until its request-filtering settings allow it.

## Sources

- Callback handler — https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler
- Callback backoff — https://api.onlyoffice.com/docs/docs-api/get-started/configuration/server-config/
- Forgotten files — https://api.onlyoffice.com/docs/docs-api/additional-api/command-service/getforgottenlist/
- Shard key — https://api.onlyoffice.com/docs/docs-api/get-started/configuration/shard-key/
- WOPI lock 30 min — https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/plus/coauthoring/wopi-locks
- Key retention until save (third-party) — https://github.com/gtsteffaniak/filebrowser/pull/3011
- URL expiry 900 s (community) — https://community.onlyoffice.com/t/download-security/18722
- CE 20-connection limit — https://community.onlyoffice.com/t/what-exactly-is-document-server-20-connection-limit/4481
