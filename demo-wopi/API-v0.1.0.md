# Demo slice — API and integration guide

**Version:** 0.1.0 · **Date:** 2026-11-25 · **Branch:** `demo/slice` · **Status:** spike (never merged; the production service is the factory build on `feature/onlyoffice-prototype`)

This guide is for a developer who wants to run the co-editing demo on their own machine and call its API. Every example response below was captured from the running demo.

---

## 1. Run it locally

### Prerequisites
- Docker Engine 24+ with Compose v2 (`docker compose version`)
- About 4 GB of free RAM and 5 GB of disk (the ONLYOFFICE image is about 3 GB)
- Free host ports **3000** (demo app) and **8080** (ONLYOFFICE)
- `openssl` and `curl` (used by `up.sh`)
- Node 20, only if you want to run the unit tests outside Docker

### Start

```bash
git clone https://github.com/anuhas-k/onlyoffice-service.git
cd onlyoffice-service
git switch demo/slice
cd demo
./up.sh
```

`up.sh` does three things:
1. On first run, writes `demo/.env` with two random 32-byte hex secrets. The file is gitignored and the secrets are never printed.
2. Runs `docker compose up -d --build`. This builds the `app` image from `demo/Dockerfile` and pulls `onlyoffice/documentserver:8.2.2`.
3. Polls `http://localhost:8080/healthcheck` until ONLYOFFICE answers `true`. The first start takes 1–2 minutes.

When it prints `ready`, open **http://localhost:3000**.

### Stop / reset

```bash
docker compose down        # stop, keep files and versions
docker compose down -v     # stop and delete all data volumes
```

### Containers

| Service | Image | Host port | Internal address | Purpose |
|---|---|---|---|---|
| `app` | built from `demo/Dockerfile` (`node:20-alpine`, non-root) | 3000 | `http://app:3000` | Web UI + REST API + ONLYOFFICE callback |
| `documentserver` | `onlyoffice/documentserver:8.2.2` | 8080 | `http://documentserver` | Editor engine (browser loads it; it calls `app` back) |

Volumes: `demo-data` (files and versions, under `/data` in `app`), and `ds-data` and `ds-cache` (ONLYOFFICE state).

### Configuration (`app` environment)

| Variable | Required | Example | Meaning |
|---|---|---|---|
| `DS_JWT_SECRET` | yes, ≥ 32 chars | from `.env` | Shared with ONLYOFFICE (`JWT_SECRET`); signs editor configs and verifies callbacks |
| `APP_SECRET` | yes, ≥ 32 chars | from `.env` | App-only; signs document keys and download tokens |
| `DS_PUBLIC_URL` | yes | `http://localhost:8080` | ONLYOFFICE address as the **browser** sees it |
| `DS_INTERNAL_URL` | yes | `http://documentserver` | ONLYOFFICE address as the **app container** sees it |
| `APP_INTERNAL_URL` | yes | `http://app:3000` | App address as **ONLYOFFICE** sees it (download + callback) |
| `DATA_DIR` | no | `/data` | Where files and versions are stored |
| `PORT` | no | `3000` | Listen port |

The app refuses to start if a required variable is missing or a secret is shorter than 32 characters. The error names the variable and never prints its value.

ONLYOFFICE settings (in `docker-compose.yml`):
- `JWT_ENABLED=true` and `JWT_SECRET=$DS_JWT_SECRET`: configs and callbacks must be signed.
- `JWT_HEADER=Authorization`: callbacks carry their token in the `Authorization` header.
- `ALLOW_PRIVATE_IP_ADDRESS=true`: allows ONLYOFFICE to download from `app` on the private Docker network. Without it, every file open fails.

**Running on another host or behind a domain:** set `DS_PUBLIC_URL` to the address your users' browsers reach ONLYOFFICE on (for example `https://docs.example.com`). The two `*_INTERNAL_URL` values stay as Docker service names.

---

## 2. How it fits together

```
 Browser                      app (Fastify)                     documentserver (ONLYOFFICE)
   │ POST /files/:id/sessions ──►│ signs editor config (JWT)
   │◄── { documentServerUrl, config }
   │ loads {DS_PUBLIC_URL}/web-apps/apps/api/documents/api.js ───────────────►│
   │ new DocsAPI.DocEditor('editor', config) ── editor iframe + websocket ───►│
   │                             │◄── GET /files/:id/content?t=…  (download) ─┤
   │                             │◄── POST /onlyoffice/callback  status 1 ────┤ (users join/leave)
   │  …users edit together…      │                                            │
   │  all users close the file   │◄── POST /onlyoffice/callback  status 2 ────┤
   │                             │ ── GET {DS_INTERNAL_URL}/cache/…  (saved file) ──►│
   │                             │ stores milestone version → replies {"error":0}
```

---

## 3. Conventions

- **Base URL:** `http://localhost:3000`
- **Demo identity:** every user-facing call sends the header `x-demo-user: alice | bob | carol`. This is a placeholder for real authentication, which the production build replaces with JWT users. Any other value returns 401.
- **Errors:** always `{"error":{"code":"<Code>","message":"<text>"}}` with a matching HTTP status.
- **Security headers on every response:** `Content-Security-Policy` (scripts and frames only from self and `DS_PUBLIC_URL`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`.
- **Logs:** request lines are logged without query strings, and the `Authorization` header is redacted, so tokens never reach the logs.

---

## 4. Endpoints

| # | Method + path | Caller | Auth |
|---|---|---|---|
| 1 | `GET /healthz` | anyone, Docker | none |
| 2 | `POST /files` | UI / developer | `x-demo-user` |
| 3 | `GET /files` | UI / developer | `x-demo-user` |
| 4 | `GET /files/:id/versions` | UI / developer | `x-demo-user` |
| 5 | `POST /files/:id/sessions` | UI / developer | `x-demo-user` |
| 6 | `GET /files/:id/content?t=` | ONLYOFFICE | download token |
| 7 | `POST /onlyoffice/callback` | ONLYOFFICE | ONLYOFFICE JWT |
| — | `GET /`, `/editor.html`, `*.js`, `*.css` | browser | none (static UI) |

### 4.1 `GET /healthz`
```bash
curl -s localhost:3000/healthz
```
`200` `{"ok":true}`. ONLYOFFICE has its own: `curl -s localhost:8080/healthcheck` returns `true`.

### 4.2 `POST /files` — upload
Multipart form with one field, `file`. Accepted: `.docx`, `.xlsx`, `.pptx` (view-only) and `.pdf`. The first bytes must match the type (ZIP for Office files, `%PDF` for PDF). The size limit is 100 MB.
```bash
curl -s -H 'x-demo-user: alice' -F 'file=@report.docx' localhost:3000/files
```
`201`
```json
{"file":{"id":"df6a4bbe-bd0f-48a7-a6ff-9c150c1e58c7","name":"report.docx","ext":"docx","versionCount":1,"editors":[]}}
```
Errors: `400 UnsupportedFormat` (wrong type or content doesn't match the extension), `400 ValidationError` (no file field), `413 FileTooLarge`, `401 Unauthenticated`.

### 4.3 `GET /files` — list
```bash
curl -s -H 'x-demo-user: alice' localhost:3000/files
```
`200`
```json
{"files":[{"id":"df6a4bbe-…","name":"report.docx","ext":"docx","versionCount":3,"editors":[]},
          {"id":"bb58803d-…","name":"SRS.docx","ext":"docx","versionCount":5,"editors":["alice"]}]}
```
`editors` lists who is connected to the file's open editing session right now. It is empty when nobody has the file open.

### 4.4 `GET /files/:id/versions` — history (newest first)
```bash
curl -s -H 'x-demo-user: alice' localhost:3000/files/<id>/versions
```
`200`
```json
{"versions":[{"id":"9429002b-…","kind":"checkpoint","sha256":"70013c4a…","size":139008,
              "participants":["bob","alice"],"documentKey":"IT1p2Jo1KtpAwlAjtIDY","createdAt":"2026-11-25T10:00:16.254Z"}]}
```
| `kind` | Created when |
|---|---|
| `initial` | the file is uploaded |
| `checkpoint` | ONLYOFFICE force-saves during editing (status 6); the session continues |
| `milestone` | everyone has closed the file (status 2); the next open starts a new session |

Versions are never changed after they are written. `participants` lists everyone who joined that session. `404 FileNotFound` for an unknown id.

### 4.5 `POST /files/:id/sessions` — open in the editor
Creates the file's editing session, or joins it if one is already open, and returns a signed ONLYOFFICE config.
```bash
curl -s -X POST -H 'x-demo-user: bob' localhost:3000/files/<id>/sessions
```
`200` (tokens masked here):
```json
{
 "documentServerUrl": "http://localhost:8080",
 "mode": "edit",
 "config": {
  "documentType": "word",
  "document": {
   "fileType": "docx",
   "key": "IT1p2Jo1KtpAwlAjtIDY",
   "title": "SRS.docx",
   "url": "http://app:3000/files/bb58803d-…/content?t=<download-token>",
   "permissions": { "edit": true, "download": false, "print": false, "fillForms": true }
  },
  "editorConfig": {
   "mode": "edit",
   "callbackUrl": "http://app:3000/onlyoffice/callback",
   "user": { "id": "bob", "name": "Bob" },
   "coEditing": { "mode": "fast", "change": false },
   "customization": { "forcesave": true }
  },
  "token": "<JWT signed with DS_JWT_SECRET>"
 }
}
```
- Everyone who opens the same file while a session is open gets the same `document.key`, which is what makes them co-edit.
- `mode` is `view` for `.pptx`.
- To mount the editor yourself, use this snippet (the same as `demo/public/editor.js`):
  ```js
  const s = await (await fetch(`/files/${id}/sessions`, { method: 'POST', headers: { 'x-demo-user': user } })).json();
  await loadScript(`${s.documentServerUrl}/web-apps/apps/api/documents/api.js`);
  new DocsAPI.DocEditor('editor', { ...s.config, width: '100%', height: '100%' });
  ```
- Errors: `404 FileNotFound`, `401 Unauthenticated`.

### 4.6 `GET /files/:id/content?t=` — file download (called by ONLYOFFICE)
`t` is the download token embedded in `config.document.url`:
- signed with HMAC-SHA256 under `APP_SECRET`;
- bound to one file and one version;
- valid for 5 minutes.

`200` returns the raw bytes (`application/octet-stream`). Errors: `401 InvalidToken` for an expired or tampered token, or one for another file. No bytes are returned with any error.

### 4.7 `POST /onlyoffice/callback` — ONLYOFFICE status (called by ONLYOFFICE)
The body format is defined by ONLYOFFICE (`key`, `status`, `url`, `users`, …).

**Checks run before anything is stored:**
1. **Signature:** an HS256 JWT signed with `DS_JWT_SECRET`, taken from `Authorization: Bearer …` (the body is under its `payload` claim) or from the body's `token` field. Otherwise `401 InvalidCallbackToken`.
2. **Known key:** the `key` must be one the app issued. Otherwise `404 UnknownDocumentKey`.
3. **Trusted download address:** `url` must be http or https on the `DS_PUBLIC_URL` or `DS_INTERNAL_URL` host. Otherwise `400 UntrustedDownloadHost`, and the app never contacts that host.
   - ONLYOFFICE builds `url` from the browser-facing address (`localhost:8080`), which the `app` container can't reach. The app keeps the path and query, and fetches from `DS_INTERNAL_URL` instead.
   - Redirects are refused, the fetch times out after 30 s, and files over 100 MB are rejected.

**What each status does:**

| `status` | Meaning (ONLYOFFICE) | Demo action | Reply |
|---|---|---|---|
| 1 | document is being edited | update who is connected | `{"error":0}` |
| 2 | all users closed, ready to save | download → store **milestone** → end session (next open gets a new key) | `{"error":0}` after the file is written |
| 3 | error while saving | log an error | `{"error":0}` |
| 4 | closed with no changes | end session (same key next time) | `{"error":0}` |
| 6 | force-save while editing | download → store **checkpoint**; session and key unchanged | `{"error":0}` |
| 7 | error while force-saving | log an error | `{"error":0}` |

**Reliability:**
- A save that can't be stored (download failure, disk error) is answered with `500 SaveFailed`. ONLYOFFICE retries on a 5xx.
- Retries are safe: a repeat of the same key and content, or content identical to the latest version, is acknowledged with `{"error":0}` and creates nothing new.

---

## 5. Error catalog

| Code | HTTP | Returned by | Meaning |
|---|---|---|---|
| `Unauthenticated` | 401 | user endpoints | missing or unknown `x-demo-user` |
| `InvalidToken` | 401 | content download | download token bad, expired, or for another file |
| `InvalidCallbackToken` | 401 | callback | ONLYOFFICE JWT missing or invalid |
| `ValidationError` | 400 | any | malformed request |
| `UnsupportedFormat` | 400 | upload | type not allowed or content doesn't match |
| `UntrustedDownloadHost` | 400 | callback | `url` not on the Document Server |
| `FileNotFound` | 404 | file endpoints | no such file |
| `UnknownDocumentKey` | 404 | callback | key not issued by this app |
| `FileTooLarge` | 413 | upload | over 100 MB |
| `SaveFailed` | 500 | callback | save not stored; ONLYOFFICE will retry |
| `InternalError` | 500 | any | unexpected fault (details only in logs) |

---

## 6. Try the whole flow from the command line

```bash
B=localhost:3000
ID=$(curl -s -H 'x-demo-user: alice' -F 'file=@report.docx' $B/files | node -pe 'JSON.parse(require("fs").readFileSync(0)).file.id')
curl -s -H 'x-demo-user: alice' $B/files
curl -s -X POST -H 'x-demo-user: alice' $B/files/$ID/sessions > /dev/null   # opens a session (editing needs a browser)
curl -s -H 'x-demo-user: alice' $B/files/$ID/versions
```
Editing itself happens in the browser. Open `http://localhost:3000/editor.html?id=$ID&user=alice` in one window and `…&user=bob` in another, edit, close both, then list the versions again: a `milestone` crediting both users appears within about 10 seconds.

### Tests
```bash
cd demo && npm ci && npm test     # 22 node:test cases (tokens, store, server/callback)
```

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Editor page says "Could not load the editor from http://localhost:8080" | ONLYOFFICE is not up yet; wait for `curl localhost:8080/healthcheck` to return `true` |
| Editor shows "Download failed" | ONLYOFFICE cannot reach `APP_INTERNAL_URL`; check `ALLOW_PRIVATE_IP_ADDRESS=true` and that both containers are on the same compose network |
| Editor shows "The document security token is not correctly formed" | `DS_JWT_SECRET` in `app` ≠ `JWT_SECRET` in ONLYOFFICE (re-run with the same `.env`; `docker compose up -d --force-recreate`) |
| No new version after closing | check `docker compose logs app` for `UntrustedDownloadHost` (wrong `DS_PUBLIC_URL`) or `SaveFailed` |
| Port already in use | change the host side of `ports:` in `docker-compose.yml` and update `DS_PUBLIC_URL` to match |

---

## 8. Limits (demo only)

- No real authentication: users are picked by header.
- No encryption at rest and no Postgres: files are stored as plain blobs on a volume.
- Sessions are held in memory, so a restart during editing loses that save.
- No locks, revocation, crash recovery, tenants, deletion or Merkle anchoring.

All of these are delivered by the factory build (see `SPEC.md` and `docs/SRS.md` on `feature/onlyoffice-prototype`).
