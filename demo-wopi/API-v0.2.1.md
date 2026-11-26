# WOPI demo slice — API and integration guide

**Version:** 0.2.1 · **Date:** 2026-11-26 · **Branch:** `demo/wopi-slice` · **Folder:** `demo-wopi/` · **Status:** spike (never merged; the production service is the factory build on `feature/onlyoffice-prototype`)

This guide is for a developer who wants to run the demo on their own machine and call its API. It supersedes `API-v0.1.0.md`, which described the original ONLYOFFICE-only demo in `../demo`. Every example response below was captured from the running demo on 2026-11-26 (ids shortened with `…`, tokens masked).

**0.2.1** adds §12 (problems found while building, with symptom, cause and fix) and two troubleshooting rows; no endpoint or behaviour changed.

**What changed since 0.1.0** (full list in §11): the same files can now be opened through **WOPI** as well as the ONLYOFFICE callback protocol; 57 formats instead of 4; sample generation; a text diff between versions; session close detection; and the ports moved to 3001 and 8081.

---

## 1. Run it locally

### Prerequisites
- Docker Engine 24+ with Compose v2 (`docker compose version`)
- About 4 GB of free RAM and 5 GB of disk (the ONLYOFFICE image is about 3 GB)
- Free host ports **3001** (app) and **8081** (ONLYOFFICE). These differ from the `../demo` ports (3000 and 8080) so both demos can run at once.
- `openssl` and `curl` (used by `up.sh`)
- Node 20, only if you want to run the unit tests outside Docker

### Start from source

```bash
cd demo-wopi
./up.sh
```

`up.sh` does three things:
1. On first run, writes `demo-wopi/.env` with two random 32-byte hex secrets. The file is gitignored and the secrets are never printed.
2. Runs `docker compose up -d --build`. This builds the `app` image from `Dockerfile` and pulls `onlyoffice/documentserver:8.2.2`.
3. Polls `http://localhost:8081/healthcheck` until ONLYOFFICE answers `true`. The first start takes 1–2 minutes.

When it prints `ready`, open **http://localhost:3001**.

### Start from a ready-built image

See `DOCKER.md` (build, save, load, run, settings). It uses `docker-compose.image.yml` and `.env.example`.

### Stop / reset

```bash
docker compose down        # stop, keep files and versions
docker compose down -v     # stop and delete all data volumes
```

### Containers

| Service | Image | Host port | Internal address | Purpose |
|---|---|---|---|---|
| `app` | built from `Dockerfile` (`node:20.20.2-alpine3.23`, pinned by digest, non-root) | 3001 | `http://app:3000` | Web UI + REST API + ONLYOFFICE callback + WOPI host |
| `documentserver` | `onlyoffice/documentserver:8.2.2` | 8081 | `http://documentserver` | Editor engine (browser loads it; it calls `app` back) |

Compose project name: `demo-wopi`. Volumes: `demo-data` (files and versions, under `/data` in `app`), and `ds-data` and `ds-cache` (ONLYOFFICE state).

### Configuration (`app` environment)

| Variable | Required | Default / example | Meaning |
|---|---|---|---|
| `DS_JWT_SECRET` | yes, ≥ 32 chars | from `.env` | Shared with ONLYOFFICE (`JWT_SECRET`). Signs editor configs, verifies callbacks, and signs the app's commands and conversions **to** the Document Server |
| `APP_SECRET` | yes, ≥ 32 chars | from `.env` | App-only. Signs document keys, download tokens and WOPI access tokens |
| `DS_PUBLIC_URL` | yes | `http://localhost:8081` | ONLYOFFICE address as the **browser** sees it |
| `DS_INTERNAL_URL` | yes | `http://documentserver` | ONLYOFFICE address as the **app container** sees it |
| `APP_INTERNAL_URL` | yes | `http://app:3000` | App address as **ONLYOFFICE** sees it (download, callback, WOPI calls) |
| `APP_PUBLIC_URL` | no | `http://localhost:<PORT>` (compose sets `http://localhost:3001`) | App address as the **browser** sees it. Sent to the WOPI editor as `PostMessageOrigin` and `CloseUrl`; must be the exact origin of the page that hosts the editor |
| `WOPI_PROOF` | no | `log` | WOPI proof-key checking: `off`, `log` (report mismatches, still allow the call) or `enforce` (reject with 500). Anything else stops the app at start-up |
| `DATA_DIR` | no | `/data` | Where files and versions are stored |
| `PORT` | no | `3000` | Listen port inside the container |

The app refuses to start if a required variable is missing, a secret is shorter than 32 characters, or `WOPI_PROOF` has an unknown value. The error names the variable and never prints its value.

ONLYOFFICE settings (in `docker-compose.yml`):
- `JWT_ENABLED=true`, `JWT_SECRET=$DS_JWT_SECRET`, `JWT_HEADER=Authorization`: configs, callbacks and commands must be signed.
- `WOPI_ENABLED=true`: turns on `/hosting/wopi` and `/hosting/discovery`. The ONLYOFFICE-protocol editor keeps working with it on (verified).
- `ALLOW_PRIVATE_IP_ADDRESS=true`: allows ONLYOFFICE to call `app` on the private Docker network. Without it, every file open fails.

**Running on another host or behind a domain:** set `DS_PUBLIC_URL` and `APP_PUBLIC_URL` to the addresses your users' browsers use (for example `https://docs.example.com`). The two `*_INTERNAL_URL` values stay as Docker service names.

---

## 2. How it fits together

### 2.1 ONLYOFFICE callback protocol (engine `onlyoffice`, the default)

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

### 2.2 WOPI (engine `wopi`)

```
 Browser                      app                               documentserver
   │ POST /files/:id/sessions?engine=wopi ─►│ reads {DS_INTERNAL_URL}/hosting/discovery, signs an access token
   │◄── { editorUrl, formFields:{access_token,…}, … }
   │ POSTs the token as a form into an iframe at editorUrl ───────────────────►│
   │                             │◄── GET  /wopi/files/:id            (CheckFileInfo)
   │                             │◄── POST /wopi/files/:id  LOCK      (one lock for all editors)
   │                             │◄── GET  /wopi/files/:id/contents   (GetFile)
   │  …users edit together…      │
   │  page heartbeat every 30 s ─►│ POST /wopi-sessions/:id/heartbeat ── may send a force-save ─►│ command service
   │                             │◄── POST /wopi/files/:id/contents   (PutFile → checkpoint)
```

WOPI differs from the callback protocol in two ways that matter here (both measured on Document Server 8.2.2):
- **Save does not reach the host.** The Document Server sends no PutFile when the user clicks Save. It saves when forced, and when the session ends. The app therefore force-saves on a timer (§6).
- **There is no "editor left" signal.** The Document Server keeps the file open and locked long after the last tab closes. The page reports leaving itself, and the app ends the session (§6).

---

## 3. Conventions

- **Base URL:** `http://localhost:3001`
- **Demo identity:** every user-facing call sends the header `x-demo-user: alice | bob | carol`. This is a placeholder for real authentication. Any other value returns 401. `GET /formats` needs no user.
- **WOPI calls** (§4.13) are authenticated by an **access token** instead: the `access_token` query parameter (the WOPI standard), or `Authorization: Bearer <token>`. A token is bound to one file, one user and a write flag, and is valid for 1 hour.
- **The demo page's own calls** (§4.14) carry the access token in a JSON body, because `navigator.sendBeacon` cannot set headers.
- **Errors:** `{"error":{"code":"<Code>","message":"<text>"}}` with a matching HTTP status. **Exception:** WOPI lock and save conflicts are `409` with **no body**, and the detail is in the `X-WOPI-Lock` and `X-WOPI-LockFailureReason` headers, as the WOPI standard requires. Unsupported WOPI operations are `501` with no body.
- **Client errors stay client errors:** a wrong content type is `415 UnsupportedMediaType`, malformed JSON is `400 BadRequest`, an oversized body is `413 PayloadTooLarge`. None of these is reported as 500.
- **Security headers on every response:** `Content-Security-Policy` (scripts and frames only from self and `DS_PUBLIC_URL`; form posts only to `DS_PUBLIC_URL`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`.
- **Logs:** request lines are logged without query strings, and the `Authorization` header is redacted, so tokens never reach the logs.

---

## 4. Endpoints

| # | Method + path | Caller | Auth |
|---|---|---|---|
| 1 | `GET /healthz` | anyone, Docker | none |
| 2 | `GET /formats` | UI / developer | none |
| 3 | `POST /samples/:ext` | UI / developer | `x-demo-user` |
| 4 | `POST /files` | UI / developer | `x-demo-user` |
| 5 | `GET /files` | UI / developer | `x-demo-user` |
| 6 | `GET /files/:id/versions` | UI / developer | `x-demo-user` |
| 7 | `GET /files/:id/versions/:versionId/diff` | UI / developer | `x-demo-user` |
| 8 | `POST /files/:id/sessions` | UI / developer | `x-demo-user` |
| 9 | `POST /files/:id/wopi/end` | UI / developer | `x-demo-user` |
| 10 | `GET /files/:id/content?t=` | ONLYOFFICE | download token |
| 11 | `POST /onlyoffice/callback` | ONLYOFFICE | ONLYOFFICE JWT |
| 12 | `GET /sample-src/:id?t=` | ONLYOFFICE (conversion) | download token |
| 13 | `GET /wopi/files/:id`, `GET /wopi/files/:id/contents`, `POST /wopi/files/:id/contents`, `POST /wopi/files/:id` | ONLYOFFICE | WOPI access token |
| 14 | `POST /wopi-sessions/:id/heartbeat`, `POST /wopi-sessions/:id/leave` | the demo page | WOPI access token (JSON body) |
| — | `GET /`, `/editor.html`, `*.js`, `*.css` | browser | none (static UI) |

### 4.1 `GET /healthz`
```bash
curl -s localhost:3001/healthz
```
`200` `{"ok":true}`. ONLYOFFICE has its own: `curl -s localhost:8081/healthcheck` returns `true`. The app image's Docker health check calls this endpoint.

### 4.2 `GET /formats` — every supported type
No user needed. Returns the format registry and, for each type, what the Document Server offers **right now** (read fresh from its WOPI discovery on every call).
```bash
curl -s localhost:3001/formats
```
`200` (3 of the 57 rows shown):
```json
{"dsReachable":true,
 "formats":[
  {"ext":"docx","kind":"word","mode":"edit","label":"Word document","sample":"direct",
   "dsActions":["view","embedview","mobileView","edit","mobileEdit","editnew"]},
  {"ext":"odt","kind":"word","mode":"edit","label":"OpenDocument text","sample":"convert",
   "dsActions":["view","embedview","mobileView","edit","mobileEdit"]},
  {"ext":"doc","kind":"word","mode":"view","label":"Word 97–2003 document","sample":null,
   "dsActions":["view","embedview","mobileView","convert"]}]}
```
| Field | Values |
|---|---|
| `kind` | editor family: `word`, `cell` (spreadsheet), `slide`, `pdf` |
| `mode` | `edit` (the editor can change and save it) or `view` (open only) |
| `sample` | `direct` (built by the app), `convert` (converted by the Document Server), or `null` (cannot be generated; upload your own) |
| `dsActions` | actions the Document Server's discovery lists for this extension; `[]` if it lists none; `null` for every row when it cannot be reached |

`dsReachable` is `false` when the Document Server cannot be reached; the registry is still returned. See §5 for the full list of types.

### 4.3 `POST /samples/:ext` — create a sample file
Creates a small valid file of that type, owned by the calling user, with one `initial` version. The file is named `sample.<ext>`.
```bash
curl -s -X POST -H 'x-demo-user: alice' localhost:3001/samples/docx
```
`201`
```json
{"file":{"id":"d9b6451c-bbfa-4444-9a5f-df15026f5356","name":"sample.docx","ext":"docx","versionCount":1,"editors":[]}}
```
- 34 types can be generated: 16 are built by the app and 18 are converted by the Document Server from a `.docx`, `.xlsx` or `.odp` the app builds (a conversion takes about a second).
- The result must pass the same first-bytes check as an upload; otherwise nothing is stored.
- Errors: `401 Unauthenticated`, `404 UnknownFormat` (not one of the 57), `404 NoSample` (`"There is no built-in sample for .doc; upload your own file"`), `502 ConversionFailed` (the Document Server could not convert), `502 SampleInvalid` (the generated bytes failed the check).

### 4.4 `POST /files` — upload
Multipart form with one field, `file`. Accepted: any of the 57 types in §5. The extension (text after the last dot, case-insensitive) must be known, and the **first bytes must match the type**:

| Rule | Types |
|---|---|
| ZIP (`PK\x03\x04`) | Office Open XML, OpenDocument, EPUB, XPS, StarOffice 1.x, form formats, `xlsb` |
| Old Office binary (OLE2 header) | `doc dot xls xlt ppt pot pps` |
| `%PDF` / `{\rtf` / `AT&TFORM` | `pdf` / `rtf` / `djvu` |
| text: non-empty, no NUL bytes in the first 8 KB | `txt csv htm html mht mhtml` |
| XML: first non-space character is `<` | `xml fb2 fodt fods fodp` |
| any non-empty file | `wps wpt et ett dps dpt` (no reliable signature) |

The size limit is 100 MB.
```bash
curl -s -H 'x-demo-user: alice' -F 'file=@report.docx' localhost:3001/files
```
`201`
```json
{"file":{"id":"df6a4bbe-bd0f-48a7-a6ff-9c150c1e58c7","name":"report.docx","ext":"docx","versionCount":1,"editors":[]}}
```
Errors: `400 UnsupportedFormat` (unknown extension, no extension, or content that does not match it), `400 ValidationError` (no file field), `413 FileTooLarge`, `401 Unauthenticated`.

### 4.5 `GET /files` — list
```bash
curl -s -H 'x-demo-user: alice' localhost:3001/files
```
`200`
```json
{"files":[{"id":"df6a4bbe-…","name":"report.docx","ext":"docx","versionCount":3,"editors":[]},
          {"id":"bb58803d-…","name":"SRS.docx","ext":"docx","versionCount":5,"editors":["alice"]}]}
```
`editors` lists who is in the file's open session right now, from either engine. For WOPI, a user counts as present from opening the file until they leave, the file is unlocked, or 90 seconds pass without a heartbeat. It is empty when nobody has the file open.

### 4.6 `GET /files/:id/versions` — history (newest first)
```bash
curl -s -H 'x-demo-user: alice' localhost:3001/files/<id>/versions
```
`200`
```json
{"versions":[
  {"id":"a9220e82-…","kind":"checkpoint","sha256":"e8bee321…","size":982,"participants":["alice"],
   "documentKey":"wopi:lock-1","createdAt":"2026-11-26T05:07:56.122Z"},
  {"id":"3747de2f-…","kind":"initial","sha256":"b07a8b53…","size":1009,"participants":["alice"],
   "documentKey":null,"createdAt":"2026-11-26T05:07:56.090Z"}]}
```
Each version is a **full copy of the file** at that moment, stored unchanged and never modified afterwards (only its `kind` label can be promoted, see below). History is therefore recorded for every editable type; the app never looks inside the file.

| `kind` | Created when |
|---|---|
| `initial` | the file is uploaded or a sample is created |
| `checkpoint` | a save arrives while editing continues: an ONLYOFFICE force-save (status 6), or a WOPI PutFile |
| `milestone` | the editing session ends: everyone closed it (ONLYOFFICE status 2), or the WOPI file was unlocked / the app ended the session. For WOPI the last checkpoint of the session is relabelled `milestone` |

`participants` lists who contributed. For ONLYOFFICE, everyone who joined that session. For WOPI, the users named in the PutFile `X-WOPI-Editors` header, or everyone who joined if the header is absent. `documentKey` is the ONLYOFFICE session key, or `wopi:<lock id>`. A save whose bytes are identical to the same key's earlier save, or to the latest version, creates nothing. `404 FileNotFound` for an unknown id.

### 4.7 `GET /files/:id/versions/:versionId/diff` — what changed
A git-style text diff of one version against the version before it, or against an earlier version you name.
```bash
curl -s -H 'x-demo-user: alice' 'localhost:3001/files/<id>/versions/<versionId>/diff'
curl -s -H 'x-demo-user: alice' 'localhost:3001/files/<id>/versions/<versionId>/diff?against=<earlierVersionId>'
```
`200` (long `segments` lists shortened):
```json
{"file":{"id":"d9b6451c-…","name":"sample.docx"},
 "from":{"id":"3747de2f-…","kind":"initial","createdAt":"2026-11-26T05:07:56.090Z","participants":["alice"]},
 "to":{"id":"a9220e82-…","kind":"checkpoint","createdAt":"2026-11-26T05:07:56.122Z","participants":["alice"]},
 "stats":{"added":1,"removed":1,"unchanged":2},
 "lines":[
  {"type":"ctx","text":"Sample document","fromNo":1,"toNo":1},
  {"type":"del","text":"This file was generated by the demo so every format can be tested.","fromNo":2,
   "segments":[{"text":"This file was ","changed":false},{"text":"generated","changed":true}, … ]},
  {"type":"add","text":"This file was edited in the example.","toNo":2,
   "segments":[{"text":"This file was ","changed":false},{"text":"edited","changed":true}, … ]},
  {"type":"ctx","text":"Edit it, close it, then open History to see the versions.","fromNo":3,"toNo":3}]}
```
| Field | Meaning |
|---|---|
| `from` | the version compared with; `null` for the first version (everything is then an addition) |
| `lines[].type` | `ctx` unchanged context, `del` removed, `add` added, `skip` a folded run of unchanged paragraphs (`{"type":"skip","count":9}`) |
| `lines[].fromNo` / `toNo` | paragraph numbers in the old / new version (`del` has only `fromNo`, `add` only `toNo`) |
| `lines[].segments` | present on `del`/`add` lines that were paired as a replacement: the text split into runs, with `changed:true` on the words that differ |
| `stats` | counts of added, removed and unchanged paragraphs |

Two lines of context are kept around each change; longer unchanged runs are folded into `skip`.

**Limits:** `.docx` only; text only (formatting, images and table layout are not compared); the `.docx` part is read with a 20 MB cap.
Errors: `401 Unauthenticated`, `404 FileNotFound`, `404 VersionNotFound` (the version or the `against` version is not this file's), `400 ValidationError` (`against` repeated, the same as the version, or newer than it), `415 DiffUnsupported` (not a `.docx`), `422 DocxUnreadable` (not a readable Word file), `422 DiffTooLarge` (two huge, mostly different versions).

### 4.8 `POST /files/:id/sessions` — open in an editor
Creates or joins the file's editing session. The `engine` query parameter chooses the protocol; it defaults to `onlyoffice`. A file open in one engine is refused in the other (`409 EngineBusy`).

#### `engine=onlyoffice` (default)
```bash
curl -s -X POST -H 'x-demo-user: bob' localhost:3001/files/<id>/sessions
```
`200` (tokens masked here):
```json
{
 "engine": "onlyoffice",
 "documentServerUrl": "http://localhost:8081",
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
- `mode` is `edit` or `view` according to the type (§5). `documentType` is the type's `kind`.
- To mount the editor yourself:
  ```js
  const s = await (await fetch(`/files/${id}/sessions`, { method: 'POST', headers: { 'x-demo-user': user } })).json();
  await loadScript(`${s.documentServerUrl}/web-apps/apps/api/documents/api.js`);
  new DocsAPI.DocEditor('editor', { ...s.config, width: '100%', height: '100%' });
  ```

#### `engine=wopi`
```bash
curl -s -X POST -H 'x-demo-user: alice' 'localhost:3001/files/<id>/sessions?engine=wopi'
```
`200` (token masked):
```json
{
 "engine": "wopi",
 "fileId": "d9b6451c-bbfa-4444-9a5f-df15026f5356",
 "mode": "edit",
 "editorUrl": "http://localhost:8081/hosting/wopi/word/edit?wopisrc=http%3A%2F%2Fapp%3A3000%2Fwopi%2Ffiles%2Fd9b6451c-…",
 "formFields": { "access_token": "<access token>", "access_token_ttl": "1795672076090" },
 "heartbeatMs": 30000,
 "title": "sample.docx",
 "user": { "id": "alice", "name": "Alice" }
}
```
- The editor is **opened by a form POST**, not a GET: create a hidden form with `method="post"`, `action=editorUrl` and one hidden input per `formFields` entry, and submit it into an iframe. A GET to `editorUrl` returns 404.
- `editorUrl` comes from the Document Server's discovery and is rewritten to `DS_PUBLIC_URL` (the browser-facing address). When discovery lists a type under two editors (`xml`), the one named by the registry's `kind` is used.
- `mode` is `view` when the registry says view-only, or the Document Server offers no edit action.
- `heartbeatMs` is how often the page should call the heartbeat endpoint (§4.14).
- `access_token_ttl` is the token's expiry in milliseconds since 1970.
- The reference page implementation is `public/editor.js` (`?engine=wopi` on `editor.html`).

Errors (both engines): `401 Unauthenticated`, `404 FileNotFound`, `400 ValidationError` (unknown `engine`), `409 EngineBusy`. WOPI only: `400 UnsupportedForWopi` (the Document Server lists no action for this type), `502 WopiDiscoveryUnavailable`.

### 4.9 `POST /files/:id/wopi/end` — end a WOPI session now
For a session the Document Server left open (for example after a crashed browser). Sends the Document Server a force-save and then a drop, and waits up to 8 seconds for it to release the file; if it does not, the app labels the last save `milestone` itself.
```bash
curl -s -X POST -H 'x-demo-user: alice' localhost:3001/files/<id>/wopi/end
```
`200`
```json
{"closed":true,"forcesave":1,"drop":0,"milestone":true}
```
- `closed:false` (nothing else in the body) when the file has no locked WOPI session.
- `forcesave` and `drop` are the Document Server command service's `error` codes: `0` accepted, `1` unknown document key, `4` no changes to save (all normal), or `"unreachable"` if the command could not be delivered.
- `milestone` is `true` when the last save of the session is now labelled `milestone`.
- Errors: `401 Unauthenticated`, `404 FileNotFound`, `502 DocumentServerUnavailable` (**both** commands unreachable).
- The Document Server may release the file up to about two minutes later (its cleanup job runs every 2 minutes); until then the file stays refused to the other engine.

### 4.10 `GET /files/:id/content?t=` — file download (called by ONLYOFFICE)
`t` is the download token embedded in `config.document.url`:
- signed with HMAC-SHA256 under `APP_SECRET`;
- bound to one file and one version;
- valid for 5 minutes.

`200` returns the raw bytes (`application/octet-stream`). Errors: `401 InvalidToken` for an expired or tampered token, or one for another file. No bytes are returned with any error.

### 4.11 `POST /onlyoffice/callback` — ONLYOFFICE status (called by ONLYOFFICE)
Unchanged from 0.1.0. The body format is defined by ONLYOFFICE (`key`, `status`, `url`, `users`, …).

**Checks run before anything is stored:**
1. **Signature:** an HS256 JWT signed with `DS_JWT_SECRET`, taken from `Authorization: Bearer …` (the body is under its `payload` claim) or from the body's `token` field. Otherwise `401 InvalidCallbackToken`.
2. **Known key:** the `key` must be one the app issued. Otherwise `404 UnknownDocumentKey`.
3. **Trusted download address:** `url` must be http or https on the `DS_PUBLIC_URL` or `DS_INTERNAL_URL` host. Otherwise `400 UntrustedDownloadHost`, and the app never contacts that host. The app keeps the path and query and fetches from `DS_INTERNAL_URL`. Redirects are refused, the fetch times out after 30 s, and files over 100 MB are rejected.

| `status` | Meaning (ONLYOFFICE) | Demo action | Reply |
|---|---|---|---|
| 1 | document is being edited | update who is connected | `{"error":0}` |
| 2 | all users closed, ready to save | download → store **milestone** → end session (next open gets a new key) | `{"error":0}` after the file is written |
| 3 | error while saving | log an error | `{"error":0}` |
| 4 | closed with no changes | end session (same key next time) | `{"error":0}` |
| 6 | force-save while editing | download → store **checkpoint**; session and key unchanged | `{"error":0}` |
| 7 | error while force-saving | log an error | `{"error":0}` |

A save that cannot be stored is answered with `500 SaveFailed`, and ONLYOFFICE retries on a 5xx. Retries are safe: identical content creates nothing new.

### 4.12 `GET /sample-src/:id?t=` — conversion source (called by ONLYOFFICE)
Internal. While the app converts a sample (§4.3) it serves the source file here for the Document Server to fetch, under the same signed 5-minute token as §4.10. The entry exists only while that one conversion runs: `200` raw bytes, `401 InvalidToken` for a bad token, `404 NotFound` once the conversion is over.

### 4.13 WOPI host endpoints (called by ONLYOFFICE)
The app is a WOPI host. The Document Server calls these with the `access_token` it was given in the editor form (query parameter, or `Authorization: Bearer`). A token for another file, an expired token, a forged token, or a read-only token on a write operation is `401 InvalidAccessToken`.

**Proof keys.** If `WOPI_PROOF` is not `off`, each call is also checked against the `X-WOPI-Proof`, `X-WOPI-ProofOld` and `X-WOPI-Timestamp` headers using the keys in the Document Server's discovery (RSA-SHA256 over the length-prefixed token, upper-cased URL and timestamp; 20-minute window; current and old key accepted). In `log` mode a mismatch is logged (`wopi proof mismatch`, with the reason, never the token) and the call proceeds. In `enforce` mode it is `500 InvalidProof`, as the specification asks, and with no keys published it fails closed. The byte order of the length prefixes is not stated in prose by the specification and is unconfirmed against the real server, so keep `log` until `./trace.sh` shows no mismatches.

#### CheckFileInfo — `GET /wopi/files/:id`
```json
{"BaseFileName":"sample.docx","BreadcrumbDocName":"sample.docx","BreadcrumbBrandName":"Editing demo",
 "FileExtension":".docx","OwnerId":"alice","Size":1009,"UserId":"alice","UserFriendlyName":"Alice",
 "IsAnonymousUser":false,"Version":"3747de2f-…","LastModifiedTime":"2026-11-26T05:07:56.090Z",
 "UserCanWrite":true,"ReadOnly":false,"UserCanRename":false,"UserCanNotWriteRelative":true,
 "SupportsUpdate":true,"SupportsLocks":true,"SupportsGetLock":true,"SupportsExtendedLockLength":true,"SupportsRename":false,
 "DisablePrint":true,"HidePrintOption":true,"DisableExport":true,
 "PostMessageOrigin":"http://localhost:3001","ClosePostMessage":true,"CloseUrl":"http://localhost:3001/"}
```
`Version` is the id of the latest stored version and changes whenever the file does. `PostMessageOrigin`, `ClosePostMessage` and `CloseUrl` are what make the editor post a `UI_Close` message to the demo page when the user closes it (§6). `DisableExport` is not in ONLYOFFICE's documented property list; it is sent for Microsoft clients and its effect here is unverified.

#### GetFile — `GET /wopi/files/:id/contents`
`200` the latest version's bytes (`application/octet-stream`) with header `X-WOPI-ItemVersion`.

#### PutFile — `POST /wopi/files/:id/contents`
Body: the whole file. Headers:

| Header | Required | Meaning |
|---|---|---|
| `X-WOPI-Override` | yes | must be `PUT` (else `400 ValidationError`) |
| `X-WOPI-Lock` | yes | must equal the current lock |
| `X-WOPI-Editors` | no | comma-separated `UserId`s who contributed to this save; credited as `participants` |

| Response | When |
|---|---|
| `200` + `X-WOPI-ItemVersion` | stored as a `checkpoint` |
| `409`, `X-WOPI-Lock: <current>` | the lock does not match |
| `409`, `X-WOPI-Lock:` (empty) | the file is not locked |
| `400 UnsupportedFormat` | the bytes do not match the file's type |
| `401 InvalidAccessToken` | bad token, or a read-only token |

Every `409` also carries `X-WOPI-LockFailureReason` (for logs only).

#### Locks — `POST /wopi/files/:id`
Chosen by `X-WOPI-Override`. `X-WOPI-Lock` is required (1–1024 characters, else `400 ValidationError`). A lock lasts 30 minutes and is renewed by `LOCK` or `REFRESH_LOCK`. There is one lock per file, shared by all of its editors.

| `X-WOPI-Override` | Behaviour |
|---|---|
| `LOCK` | unlocked → locks (`200`). Same id → refresh (`200`). Different id → `409` + holder in `X-WOPI-Lock` |
| `REFRESH_LOCK` | same id → extends (`200`). Otherwise `409` |
| `UNLOCK` | same id → releases (`200`) and relabels the session's last save `milestone`. Otherwise `409` |
| `UNLOCK_AND_RELOCK` | needs `X-WOPI-OldLock` to equal the current lock; replaces it (`200`). Otherwise `409` |
| `GET_LOCK` | `200` with the current lock id in `X-WOPI-Lock` (empty if none) |
| `PUT_RELATIVE`, `RENAME_FILE`, `DELETE_FILE`, `PUT_USER_INFO`, `GET_RESTRICTED_LINK`, `REVOKE_RESTRICTED_LINK` | `501`, no body |
| anything else | `400 ValidationError` |

### 4.14 The demo page's session calls
These are not part of WOPI. They exist because the Document Server never reports that an editor left, and only the backend holds the secret needed to command it. The body is JSON: `{"access_token":"<the token from the session>"}`.

| Call | Effect | Response |
|---|---|---|
| `POST /wopi-sessions/:id/heartbeat` | refreshes the caller's presence; may trigger the automatic checkpoint (§6) | `204` |
| `POST /wopi-sessions/:id/leave` | removes the caller; after a 1 s grace period, if nobody is left, force-saves and ends the session | `202` |
| `POST /wopi-sessions/:id/leave` with `"wait":true` | same, but immediately, and answers when finished (used by the editor's own Close button) | `200` `{"closed":false}` while others remain, else `{"closed":true,"forcesave":…,"drop":…,"milestone":…}` as in §4.9 |

Errors: `401 InvalidAccessToken` (missing, forged, expired, or another file's token).

---

## 5. Supported types (57)

The registry (`src/formats.js`) lists every extension the Document Server publishes in `/hosting/discovery`. `GET /formats` returns it live.

| Family | Edit (15 in total) | View only (42 in total) |
|---|---|---|
| **Word** (23) | docx docm dotx odt txt | doc dot dotm docxf oform ott fodt sxw stw rtf epub fb2 htm html mht mhtml wps wpt |
| **Spreadsheet** (15) | xlsx xlsm xltx ods csv | xls xlt xltm xlsb ots fods sxc xml et ett |
| **Slide** (15) | pptx pptm potx odp | ppt pot pps ppsx ppsm potm otp fodp sxi dps dpt |
| **PDF and page formats** (4) | pdf | djvu xps oxps |

- **Edit** means the Document Server offers an edit action and the demo allows it. **View only** types open read-only; they never create new versions. The legacy binaries (`doc xls ppt …`) are view-only because the Document Server offers only *convert* for editing them, and conversion needs `PutRelativeFile`, which answers `501`.
- Deviation from `SPEC.md` line 79: `.pptx` is editable here (the spec says view-only), because this spike exists to test every format.
- **Samples (34):** built by the app: docx xlsx odp pdf txt csv rtf html htm mht mhtml xml fb2 fodt fods fodp. Converted by the Document Server: docm dotx dotm odt ott epub · xlsm xltx xltm ods ots · pptx pptm potx potm ppsx ppsm otp. The other 23 cannot be generated.
- **Version history** is recorded for every editable type. The **diff** (§4.7) exists only for `.docx`.

---

## 6. WOPI session lifecycle and timings

| What | Value | Where |
|---|---|---|
| Page heartbeat | every 30 s (`heartbeatMs`) | `public/editor.js` |
| Automatic checkpoint | at most one force-save per file per 30 s, driven by a heartbeat, only while the file is locked | `wopi.js` |
| Close grace period | 1 s after `leave` (so a page reload is not a close) | `wopi.js` |
| Wait for the Document Server to release the file | 8 s | `wopi.js` |
| Presence expires | 90 s without a heartbeat | `wopi.js` |
| Idle sweeper | every 15 s: a locked file with no live editors is closed | `wopi.js` |
| WOPI lock | 30 min | `wopi.js` |
| WOPI access token | 1 hour | `wopi-tokens.js` |

**How a version appears:**
- **While editing:** because the Document Server sends no PutFile on Save, the heartbeat triggers a force-save. If anything changed the Document Server sends a PutFile and a `checkpoint` is stored; if nothing changed (command answer `4`) nothing is stored. A checkpoint therefore appears within roughly 30–60 seconds of an edit, not at the moment of Save.
- **On close:** the editor's own **Close** button posts `UI_Close`; the page calls `leave` with `wait` and then navigates away. Closing the tab or browser sends a beacon instead, and a crashed tab is found by the sweeper. In every case, when the last editor is gone the app force-saves and drops the session, the Document Server sends a final PutFile and an UNLOCK, and the last save becomes the `milestone`. If the Document Server does not unlock within 8 seconds, the app relabels the last save itself. Timing: 1 s grace + about 2 s for the Document Server to send the final PutFile, so roughly 3 seconds from closing a tab to the version (measured at 5–6 s while the grace period was still 3 s; not re-measured since). The Document Server's own UNLOCK can take up to about 2 minutes.

---

## 7. Error catalog

| Code | HTTP | Returned by | Meaning |
|---|---|---|---|
| `Unauthenticated` | 401 | user endpoints | missing or unknown `x-demo-user` |
| `InvalidToken` | 401 | content download, sample source | download token bad, expired, or for another file |
| `InvalidCallbackToken` | 401 | callback | ONLYOFFICE JWT missing or invalid |
| `InvalidAccessToken` | 401 | WOPI endpoints, `/wopi-sessions` | access token missing, forged, expired, wrong file, or read-only for a write |
| `ValidationError` | 400 | any | malformed request (unknown `engine`, bad `against`, bad WOPI header) |
| `BadRequest` | 400 | any | malformed request body (for example invalid JSON) |
| `UnsupportedFormat` | 400 | upload, PutFile | type not allowed or content does not match |
| `UnsupportedForWopi` | 400 | sessions (wopi) | the Document Server lists no WOPI action for the type |
| `UntrustedDownloadHost` | 400 | callback | `url` not on the Document Server |
| `FileNotFound` | 404 | file endpoints | no such file |
| `VersionNotFound` | 404 | diff | no such version (or not this file's) |
| `UnknownFormat` | 404 | samples | not one of the 57 types |
| `NoSample` | 404 | samples | the type cannot be generated |
| `UnknownDocumentKey` | 404 | callback | key not issued by this app |
| `NotFound` | 404 | sample source | the conversion is over |
| `EngineBusy` | 409 | sessions | the file is open in the other engine |
| `FileTooLarge` | 413 | upload | over 100 MB |
| `PayloadTooLarge` | 413 | any | request body too large |
| `UnsupportedMediaType` | 415 | any | wrong `Content-Type` |
| `DiffUnsupported` | 415 | diff | not a `.docx` |
| `DocxUnreadable` | 422 | diff | the version is not a readable Word file |
| `DiffTooLarge` | 422 | diff | the two versions differ too much to compare |
| `SaveFailed` | 500 | callback | save not stored; ONLYOFFICE will retry |
| `InvalidProof` | 500 | WOPI endpoints | proof-key check failed (`WOPI_PROOF=enforce` only) |
| `InternalError` | 500 | any | unexpected fault (details only in logs) |
| `ConversionFailed` | 502 | samples | the Document Server could not convert |
| `SampleInvalid` | 502 | samples | the generated sample failed the signature check |
| `WopiDiscoveryUnavailable` | 502 | sessions (wopi) | the Document Server's discovery is unreachable |
| `DocumentServerUnavailable` | 502 | `wopi/end` | the command service is unreachable |

WOPI `409` (lock conflicts) and `501` have no body; see §3.

---

## 8. Try the whole flow from the command line

```bash
B=localhost:3001; U='x-demo-user: alice'
ID=$(curl -s -X POST -H "$U" $B/samples/docx | node -pe 'JSON.parse(require("fs").readFileSync(0)).file.id')
curl -s $B/formats | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); `${d.formats.length} types, Document Server reachable: ${d.dsReachable}`'
curl -s -X POST -H "$U" "$B/files/$ID/sessions?engine=wopi"          # opens a WOPI session (editing itself needs a browser)
curl -s -H "$U" $B/files/$ID/versions
curl -s -X POST -H "$U" $B/files/$ID/wopi/end                         # closes it; add -w '%{http_code}' to see the status
```
Editing itself happens in the browser. Open `http://localhost:3001/editor.html?id=$ID&user=alice&engine=wopi` in one window and `…&user=bob&engine=wopi` in another, type, close both, then list the versions: a `checkpoint` appears within about a minute of typing, and a `milestone` a few seconds after the last window closes. Use `./trace.sh` to see exactly which calls the Document Server made.

### Tests
```bash
cd demo-wopi && npm ci && npm test     # 178 node:test cases
```
They play the Document Server with a fake (same calls the real one makes) and do not prove the real one behaves identically; the live checks in `README.md` do.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Editor page says "Could not load the editor from http://localhost:8081" | ONLYOFFICE is not up yet; wait for `curl localhost:8081/healthcheck` to return `true` |
| The "Supported file types" card says the Document Server is not reachable | it is still starting, or `DS_JWT_SECRET` differs from its `JWT_SECRET` |
| Editor shows "Download failed" | ONLYOFFICE cannot reach `APP_INTERNAL_URL`; check `ALLOW_PRIVATE_IP_ADDRESS=true` and that both containers share a compose network |
| "The document security token is not correctly formed" | `DS_JWT_SECRET` in `app` ≠ `JWT_SECRET` in ONLYOFFICE (`docker compose up -d --force-recreate`) |
| WOPI editor stays blank | `DS_PUBLIC_URL` is not reachable from the browser, or the browser blocks the form post (check the CSP `form-action`) |
| No new version after closing (WOPI) | `./trace.sh` shows whether a PutFile arrived; if not, the Document Server did not save. Try `POST /files/:id/wopi/end` |
| File refused with `EngineBusy` | the other engine's session is still open; wait up to about 2 minutes after a WOPI close, or call `POST /files/:id/wopi/end` |
| No new version after closing (ONLYOFFICE) | `docker compose logs app` for `UntrustedDownloadHost` (wrong `DS_PUBLIC_URL`) or `SaveFailed` |
| `wopi proof mismatch` in the log | expected until the proof construction is confirmed; the call was still allowed (`log` mode) |
| Port already in use | change the host side of `ports:` in `docker-compose.yml` and update `DS_PUBLIC_URL` / `APP_PUBLIC_URL` |
| The demo page opens but the editor is blank, only on the machine that runs Docker | that machine's browser cannot reach `DS_PUBLIC_URL` (its own LAN address); other devices can. See §12, problem 11 |
| `curl` to the published port gives "Empty reply from server" and the app log shows no request | Docker Desktop's port proxy is accepting and dropping the connection (seen after enabling WSL mirrored networking); quit Docker Desktop, run `wsl --shutdown`, start it again. See §12, problem 12 |

---

## 10. Limits (demo only)

- No real authentication: users are picked by header.
- No encryption at rest and no Postgres: files are stored as plain blobs on a volume.
- WOPI locks and presence, and ONLYOFFICE sessions, are held in memory, so a restart loses them; the files and versions are kept.
- One app instance only (no shared state between instances).
- WOPI access tokens do not renew after 1 hour.
- The diff covers `.docx` text only. The 23 types with no sample cannot be generated.
- Saves from a real editor are proven only for `.docx` over WOPI.
- No revocation, crash recovery of unsaved work, tenants, deletion or Merkle anchoring. The factory build delivers these (see `SPEC.md` and `docs/SRS.md` on `feature/onlyoffice-prototype`).

---

## 11. Changes since 0.1.0

**Added**
- WOPI host: `GET /wopi/files/:id`, `GET /wopi/files/:id/contents`, `POST /wopi/files/:id/contents`, `POST /wopi/files/:id` (locks), and the `engine=wopi` session (§4.8, §4.13).
- `GET /formats`, `POST /samples/:ext`, `GET /sample-src/:id` (§4.2, §4.3, §4.12).
- `GET /files/:id/versions/:versionId/diff` (§4.7).
- `POST /files/:id/wopi/end`, `POST /wopi-sessions/:id/heartbeat`, `POST /wopi-sessions/:id/leave` (§4.9, §4.14).
- Settings `APP_PUBLIC_URL` and `WOPI_PROOF`; `WOPI_ENABLED=true` on the Document Server.
- Error codes: `InvalidAccessToken`, `UnsupportedForWopi`, `VersionNotFound`, `UnknownFormat`, `NoSample`, `NotFound`, `EngineBusy`, `DiffUnsupported`, `DocxUnreadable`, `DiffTooLarge`, `InvalidProof`, `ConversionFailed`, `SampleInvalid`, `WopiDiscoveryUnavailable`, `DocumentServerUnavailable`, `BadRequest`, `PayloadTooLarge`, `UnsupportedMediaType`.

**Changed**
- Upload accepts the 57 types in §5 (was `.docx .xlsx .pptx .pdf`), each checked by its own first-bytes rule. `.pptx` is now editable.
- `POST /files/:id/sessions` takes `?engine=onlyoffice|wopi`; the ONLYOFFICE response gains `"engine":"onlyoffice"`. A file open in one engine is refused in the other.
- `GET /files` `editors` now includes WOPI editors.
- Wrong content type and malformed JSON now answer 415 / 400 (they answered 500).
- Default ports are 3001 and 8081; the compose project is `demo-wopi`.
- The Content-Security-Policy gains `form-action <DS_PUBLIC_URL>` (the WOPI editor is opened by a form post).
- Docker image: base pinned by digest, health check uses `127.0.0.1`, test files excluded.

**Unchanged:** `GET /healthz`, `POST /files` (request shape), `GET /files/:id/versions` (shape), `GET /files/:id/content`, `POST /onlyoffice/callback`.

---

## 12. Problems found while building (and what was done)

Each row is something that actually went wrong. "Status" says how far the fix was checked. Document Server version is 8.2.2 throughout.

| # | Symptom | Cause | Fix | Status |
|---|---|---|---|---|
| 1 | Clicking **Save** in the editor produced no history entry | Over WOPI the Document Server sends no PutFile on Save; it saves when forced and when the session ends | The app force-saves on a timer (about every 30 s while someone is editing) and on close (§6) | Measured on a real editor |
| 2 | Nothing recorded when the browser was closed | WOPI has no "editor left" call, so the host cannot see a close | Close detection in the app: `UI_Close` from the Close button, a beacon on tab close, a 30 s heartbeat with a 90 s sweeper, and `POST /files/:id/wopi/end` (§6) | A close by the user was seen in `trace.sh` (PutFile and UNLOCK about 5 s after leaving, then a `milestone`); the sweeper and the Close button were not observed in a browser |
| 3 | After a close, the history entry came about 1.5 minutes later, not at once | `drop` does work, but the Document Server releases the file from a cleanup job that runs every 2 minutes. An early check after 20 s wrongly suggested `drop` did nothing | The app does not wait for the Document Server's UNLOCK: it relabels the last save as `milestone` itself after 8 s (§4.9) | Measured with `trace.sh` |
| 4 | History panel showed every auto-save and did not refresh | Each forced save is a version; the panel only loaded once | Versions are grouped (checkpoints collapse under a milestone) and the page polls every second (`history-groups.js`, `app.js`) | Grouping unit-tested; the page was not observed rendering |
| 5 | History took 5–10 s to update after closing | A 3 s grace period plus a slow poll | Grace 1 s and poll 1 s (`leaveGraceMs`, `pollLoop`) | Measured: about 3 s from closing a tab to the version |
| 6 | `.xml` opened in a different editor depending on the protocol | Discovery listed more than one URL for one extension and the app kept only the last | Discovery is parsed into a list per extension and action; the app picks the one matching the type's registry `kind` | Checked for all 34 sample types in both protocols |
| 7 | A request with the wrong content type answered `500` | Fastify's own 415 was turned into a generic 500 by the app's error handler | Client errors (4xx) from Fastify pass through unchanged: 415, 413, 400 (§7) | Re-checked live |
| 8 | A classic ONLYOFFICE session was refused with `409 EngineBusy` right after a WOPI run | The WOPI lock lingers until the Document Server's own UNLOCK (about 2 minutes) | Working as designed; wait, or call `POST /files/:id/wopi/end` (§9) | Observed |
| 9 | Docker health check always failed | `localhost` resolved to IPv6 inside Alpine while the app listens on IPv4 | The check uses `127.0.0.1` | Image reports `healthy` |
| 10 | Test files were being copied into the image; the 54 MB `dist/` archive could have been committed | `.dockerignore` had `*.test.js`, which only matches the top folder; `dist/` was in neither ignore file | `**/*.test.js`; `dist/` added to `.dockerignore` and `.gitignore` | Image has 18 runtime files in `/app/src` |
| 11 | On the machine running Docker (Windows, WSL2, Docker Desktop) the demo page opened but the editor stayed blank, while a phone on the same network worked | The editor is loaded by the browser from `DS_PUBLIC_URL`. That machine could not connect to its own LAN address, so the page loaded and the editor frame did not | **Not confirmed.** First attempt: remove `networkingMode=mirrored` from `.wslconfig`. Fallback (not built): derive the editor address from the address the page was opened on, with an allow-list of hosts | The cause is the unreachable address (seen with the browser); the cure is untested |
| 12 | After enabling WSL mirrored networking, `curl` to a published port returned "Empty reply from server" and the app saw no request, although the container itself answered | Docker Desktop's port proxy kept stale network state | Quit Docker Desktop, `wsl --shutdown`, start Docker Desktop, recreate the stack | The empty reply was seen. After the restart and a firewall rule were done together, a phone could reach the app; which of the two fixed it was not isolated |
| 13 | The page itself could not be observed during checks | Headless Chromium cannot start in the build environment (a system library is missing and installing it needs administrator rights) | None. The page code has no automated tests and was checked by the user by hand | Open |

**Not problems, but worth knowing:** proof-key checking stays in `log` mode because the byte order of the signed data is unconfirmed (§4.13), and `DisableExport` in CheckFileInfo is not in ONLYOFFICE's documented properties (§4.13).
