# Add WOPI to your app (ONLYOFFICE Document Server)

**Version:** 1.1 · **Date:** 2026-11-26 · **Based on:** the `demo-wopi/` demo, ONLYOFFICE Document Server **8.2.2** · **Status:** written from the demo's working code; read "What was not verified" before relying on it

This guide is for a developer who has an app that stores files and wants the ONLYOFFICE editor to open and save them over **WOPI**. It lists the smallest set of things to build, in the order to build them, and the traps found while building the demo. `API-v0.2.1.md` describes the demo's own endpoints; the working reference code is in `src/wopi.js`, `src/wopi-tokens.js`, `src/ds-command.js` and `public/editor.js`.

---

## 1. What you are building

WOPI is plain HTTP. There is no RPC and no persistent connection. Two programs talk:

| Role | Who | Does |
|---|---|---|
| **WOPI host** | **your app** | owns the files; answers the editor's HTTP calls |
| **WOPI client** | ONLYOFFICE Document Server | draws the editor and calls your host to read and save the file |
| Browser | the user | opens your page, which opens the editor from the Document Server |

Your app does two jobs: **answer** four kinds of WOPI call, and **start** the editor in the browser. Because WOPI has gaps (section 7), you also **call the Document Server** with its command service.

```
browser ──(1) open file──────────────▶ your app
browser ◀─(2) editor URL + token──────  your app
browser ──(3) POST token to editor────▶ Document Server (in an iframe)
your app ◀─(4) CheckFileInfo / GetFile─ Document Server   (server to server)
your app ◀─(5) Lock / PutFile / Unlock─ Document Server
your app ──(6) forcesave / drop───────▶ Document Server   (command service)
```

---

## 2. Prerequisites

1. **Document Server 8.2.2** with WOPI turned on: environment variable `WOPI_ENABLED=true`. This adds `/hosting/discovery` and `/hosting/wopi/...`.
2. **Network, both directions:**
   - The Document Server must reach your app's WOPI URL (server to server). In the demo that is `http://app:3000` on a Docker network, and the Document Server needs `ALLOW_PRIVATE_IP_ADDRESS=true` to call a private address.
   - Your app must reach the Document Server (discovery and command service).
   - The **browser** must reach the Document Server's public address. If the browser cannot, the editor area stays blank.
3. **Two shared secrets**, 32+ characters each, never in code:
   - one between your app and the Document Server (`JWT_SECRET` on the Document Server, `DS_JWT_SECRET` in the app), used to sign **command service** calls;
   - one only your app knows, used to sign **WOPI access tokens**.

The WOPI calls themselves are authenticated by the **access token**, not by the JWT. The JWT is only for your calls *to* the Document Server (section 7).

---

## 3. Build order

Build and test each step before the next. The demo's tests are in `src/wopi.test.js` and `src/wopi-close.test.js`.

### Step 1. Access tokens

A token must be bound to **one file, one user, a write flag, and an expiry**, and must be signed so it cannot be forged. The demo uses HMAC-SHA256 over a base64url JSON body with a 1-hour expiry (`src/wopi-tokens.js`). Rules that matter:

- Check the token's file id against the file id in the URL. A token for file A must never open file B.
- Compare signatures in constant time.
- Return `401` for anything invalid, expired, or not permitted (for example a read-only token used to save).
- The Document Server keeps **one token for the whole editing session**, so the lifetime must cover a long session. The demo does not renew tokens; an editor left open past the lifetime stops saving.
- WOPI passes the token as `?access_token=` in the URL. That is part of the protocol, so make sure your logs do not record query strings.

### Step 2. CheckFileInfo — `GET /wopi/files/{id}`

Returns JSON about the file and the user. The editor will not load without it. The demo returns:

| Field | Value in the demo | Why |
|---|---|---|
| `BaseFileName` | file name with extension | shown in the editor |
| `Size`, `Version`, `LastModifiedTime` | from the latest stored version | `Version` must change whenever the file changes |
| `OwnerId`, `UserId`, `UserFriendlyName` | from your user system | shown as the editing user |
| `UserCanWrite` / `ReadOnly` | from the token's write flag | turns editing on or off |
| `SupportsUpdate`, `SupportsLocks`, `SupportsGetLock`, `SupportsExtendedLockLength` | `true` | tells the editor which operations you implement |
| `UserCanNotWriteRelative` | `true` | "save as" is not supported |
| `PostMessageOrigin` | your page's origin | where the editor sends `postMessage` |
| `ClosePostMessage` | `true` | the editor's Close button posts `UI_Close` to your page |
| `CloseUrl` | your home page URL | where to go on close |

### Step 3. GetFile — `GET /wopi/files/{id}/contents`

Return the file's bytes as `application/octet-stream` for the **latest** version. The demo also sends `X-WOPI-ItemVersion`.

### Step 4. Locks — `POST /wopi/files/{id}` with `X-WOPI-Override`

The editor locks the file while it is open. Implement these overrides:

| `X-WOPI-Override` | Required header(s) | Behaviour |
|---|---|---|
| `LOCK` | `X-WOPI-Lock` | take the lock if free; if you already hold the same lock, refresh it; otherwise conflict |
| `REFRESH_LOCK` | `X-WOPI-Lock` | extend the lease; conflict if not locked or a different lock |
| `UNLOCK` | `X-WOPI-Lock` | release if the id matches; conflict otherwise |
| `UNLOCK_AND_RELOCK` | `X-WOPI-Lock`, `X-WOPI-OldLock` | swap the lock id if the old one matches |
| `GET_LOCK` | none | return the current id in `X-WOPI-Lock` (empty if none) |
| anything not supported (rename, delete, put-relative, user info, restricted links) | | answer `501` |

**A conflict is `409` with two headers:** `X-WOPI-Lock` carrying the *current* lock id (empty if none) and `X-WOPI-LockFailureReason` with a short text. The demo's lease is 30 minutes and lock ids are capped at 1024 characters (the editor advertises this via `SupportsExtendedLockLength`).

### Step 5. PutFile — `POST /wopi/files/{id}/contents` with `X-WOPI-Override: PUT`

This is where saves arrive. In order:

1. Reject unless the token allows writing (`401`).
2. If the file is not locked, or `X-WOPI-Lock` does not match, answer **`409`** with `X-WOPI-Lock` set to the current lock (empty if none).
3. Read the request body as raw bytes. Your web framework must accept an arbitrary content type here; the demo registers a catch-all buffer parser.
4. **Validate the bytes** before storing (the demo checks the file's signature for its type) and answer `400` if they are not a valid file.
5. Store a new version. Answer `200` with `X-WOPI-ItemVersion` set to the new version id.

`X-WOPI-Editors` lists who contributed to this save. Use it to credit people in history; fall back to "everyone who joined" if it is missing.

### Step 6. Open the editor

1. **Discovery.** Fetch `{documentServer}/hosting/discovery` (XML). Each `<action ext="docx" name="edit" urlsrc="...">` gives the editor URL for a file type and action. Cache it for a few minutes. Some extensions (for example `xml`) appear under **more than one** editor, so keep a list and choose by the editor family you want. Choosing the first one opened `.xml` in the wrong editor.
2. **Build the URL.** Take the `urlsrc`, remove any `<placeholders>`, then **replace its host with the Document Server's browser-facing address** (the container address is not reachable by the browser), and add `wopisrc=<your WOPI base>/wopi/files/{id}`. The `wopisrc` is the address the *Document Server* uses to call you back, so it is the server-to-server address, not the browser one.
3. **Pick `edit` or `view`.** Use `view` for types the Document Server cannot edit or for read-only users.
4. **Return** the editor URL and the token to your page.

### Step 7. The browser page

The editor is opened by **POSTing the token into an iframe**; a plain link will not work (`public/editor.js`):

- create an iframe, create a hidden `<form method="post" action="{editorUrl}" target="{iframe name}">` with hidden inputs `access_token` and `access_token_ttl`, and submit it;
- if your site sets a Content-Security-Policy, add the Document Server's origin to `frame-src` and to `form-action`;
- when the iframe loads, post `{"MessageId":"Host_PostmessageReady","SendTime":<now>,"Values":{}}` to the iframe, targeting the Document Server's origin. The editor ignores host messages until it sees this;
- listen for `message` events, accept only the Document Server's origin **and** your iframe as the source, and treat `MessageId: "UI_Close"` as "the user pressed Close".

### Step 8. Close and save (the gaps)

See section 7. Without this step the editor works but history is thin.

---

## 4. Endpoints at a glance

| Method and path | Called by | Purpose |
|---|---|---|
| `GET /wopi/files/{id}` | Document Server | CheckFileInfo |
| `GET /wopi/files/{id}/contents` | Document Server | GetFile |
| `POST /wopi/files/{id}/contents` (`PUT`) | Document Server | PutFile |
| `POST /wopi/files/{id}` | Document Server | locks |
| `POST /files/{id}/sessions` (yours) | your page | returns editor URL and token |
| `POST /wopi-sessions/{id}/heartbeat`, `.../leave` (yours) | your page | presence and close (section 7) |

All four WOPI routes check the access token first.

---

## 5. Security checklist

- [ ] Access token bound to file, user, write flag and expiry; signed; compared in constant time.
- [ ] A write operation with a read-only token is `401`.
- [ ] Locks are checked on PutFile and on every lock operation.
- [ ] The editor URL you give the browser uses the Document Server's **public** host and the `wopisrc` uses your **internal** host. Never take either from the request.
- [ ] Your fetches to the Document Server set a timeout and refuse redirects.
- [ ] Command-service calls are signed with the shared JWT secret, which never reaches the browser.
- [ ] Saved bytes are validated before they are stored.
- [ ] Logs do not contain access tokens (they arrive in the query string).
- [ ] **Proof keys (optional but recommended):** the Document Server signs each WOPI call (`X-WOPI-Proof`, `X-WOPI-ProofOld`, `X-WOPI-Timestamp`, RSA-SHA256, public key in discovery's `<proof-key>`, 20-minute window). The demo implements it in `src/wopi-proof.js`, but runs it in **log-only** mode because the byte order of the length prefixes was not confirmed against the real server. Run in log mode first, check your logs for mismatches, and only then enforce.

---

## 6. Test it before you open an editor

Simulate the Document Server with `curl`, using a token your app issued (`$T`) and a file id (`$F`):

```bash
H=http://localhost:3001
curl -s "$H/wopi/files/$F?access_token=$T"                         # CheckFileInfo JSON
curl -s -o /tmp/file.bin "$H/wopi/files/$F/contents?access_token=$T"   # GetFile
curl -s -X POST -H 'X-WOPI-Override: LOCK' -H 'X-WOPI-Lock: L1' "$H/wopi/files/$F?access_token=$T" -i   # 200
curl -s -X POST -H 'X-WOPI-Override: PUT'  -H 'X-WOPI-Lock: WRONG' --data-binary @/tmp/file.bin "$H/wopi/files/$F/contents?access_token=$T" -i   # 409 + X-WOPI-Lock: L1
curl -s -X POST -H 'X-WOPI-Override: PUT'  -H 'X-WOPI-Lock: L1'    --data-binary @/tmp/file.bin "$H/wopi/files/$F/contents?access_token=$T" -i   # 200 + X-WOPI-ItemVersion
curl -s -X POST -H 'X-WOPI-Override: UNLOCK' -H 'X-WOPI-Lock: L1' "$H/wopi/files/$F?access_token=$T" -i  # 200
curl -s -i "$H/wopi/files/$F?access_token=forged"                      # 401
```

Then open a file in the real editor and confirm, in your logs, this order: CheckFileInfo, GetFile, LOCK, then (on save) PutFile, and on close UNLOCK.

---

## 7. What WOPI does not give you (measured on 8.2.2)

These are the traps. The demo works around each one:

| Gap | What happens | What the demo does |
|---|---|---|
| **No PutFile on Save** | The user clicks Save and nothing reaches your app. The editor saves when forced and when the session ends. | Sends a `forcesave` command on a timer (about every 30 s while someone is editing) so a PutFile arrives |
| **No "user left" signal** | The editor never tells you it closed. Your file stays locked for a long time. | The page reports it: `UI_Close` from the Close button, a `sendBeacon` on `pagehide`, a heartbeat every ~30 s, and a server sweeper that closes sessions with no heartbeat for 90 s |
| **Slow release after `drop`** | The Document Server's own UNLOCK can take up to about 2 minutes (its cleanup job runs every 2 minutes). | Forces a save, sends `drop`, waits up to 8 s for the UNLOCK, then labels the last save as the final one itself |
| **Which close path is fastest is not settled** | The demo's code comments say `drop` works best while the tab is still connected. A measured tab-close still produced a final save and UNLOCK, so `drop` after the tab has gone does work, but the exact difference between the paths was not measured. | The Close button waits for the answer *before* navigating away; tab-close and crashed tabs go through the beacon and the sweeper |

### The command service (your calls to the Document Server)

`POST {documentServer}/command` with a JSON body `{"c": "<command>", "key": "<document key>", ...}`. In the demo the key is the **file id**. The request is signed with the shared secret as an HS256 JWT, sent both as `Authorization: Bearer <jwt>` and as a `token` field in the body (`src/ds-command.js`). The reply is JSON with an `error` number:

| `error` | Meaning |
|---|---|
| `0` | accepted |
| `1` | unknown document key (nothing open under that key) |
| `4` | no changes to save (normal for an idle file) |
| `2`, `3`, `5`, `6` | callback URL, internal error, bad command, bad token |

Commands used: **`forcesave`** (make the editor send a PutFile now) and **`drop`** (end the session for the listed users). A good PutFile that follows `forcesave` carries the new bytes, so history entries appear within seconds of the command.

---

## 8. Common mistakes

| Symptom | Cause |
|---|---|
| Editor frame stays blank | the browser cannot reach the Document Server's public address, or your CSP blocks `frame-src` / `form-action` |
| "Download failed" in the editor | the Document Server cannot reach your `wopisrc` host; check the network and `ALLOW_PRIVATE_IP_ADDRESS=true` for private addresses |
| Editor opens read-only | your CheckFileInfo says `UserCanWrite: false`, or you chose the `view` action |
| Saves never arrive | no `forcesave` sent, or PutFile answers `409` because the lock id does not match |
| Wrong editor for a file type | discovery lists several editors for that extension; choose by editor family |
| Everything works for 1 hour then stops saving | the access token expired |
| `500` for a wrong content type on PutFile | your framework rejects an unknown content type; register a catch-all raw-body parser for the WOPI routes |

---

## 9. Moving to Microsoft Word / Office on the web

The four WOPI operations above are the same operations Microsoft's hosts call, so the host side of this guide carries over. Differences to expect, none of which were built or tested here:

- the browser flow, discovery URL and any proof-key handling are Microsoft's, not ONLYOFFICE's;
- `forcesave` and `drop` are ONLYOFFICE command-service features and do not exist for Microsoft's client, so checkpoints and close detection need another design;
- Microsoft's WOPI uses extra CheckFileInfo properties and a licence/partner agreement.

---

## 10. Connecting your own storage (for example Bethel)

The Document Server never writes to your storage. It calls your WOPI host, and the host reads and writes. So saving is entirely your code: GetFile reads a version, PutFile writes one. Keep all storage access behind one small interface so the demo's disk store can be swapped for yours.

### What the demo's store does (`src/store.js`)

| WOPI call | Host handler | Store call |
|---|---|---|
| GetFile | `getFile` in `src/wopi.js` | `readVersion(fileId, versionId)` for the newest version |
| PutFile | `putFile` | `addVersion(fileId, bytes, {kind: 'checkpoint', participants, documentKey})` |
| UNLOCK at the end of a session | `unlock` | `promote(fileId, versionId, 'milestone')` |
| CheckFileInfo | `checkFileInfo` | `get(fileId)` for name, size and version id |

The demo's store keeps JSON metadata and one immutable blob file per version. It has no encryption (its header says so), so treat it as the shape to copy, not the code to ship.

### The interface to implement

Your storage adapter needs these four operations. Names are the demo's; the signatures are what the handlers call.

```js
get(fileId)                                   // metadata: id, name, ext, versions[] (id, kind, sha256, size, createdAt)
readVersion(fileId, versionId)                // -> Buffer, the whole file
addVersion(fileId, bytes, {kind, participants, documentKey})
                                              // -> {version, created}; created=false when nothing new was stored
promote(fileId, versionId, kind)              // relabel a version, for example checkpoint -> milestone
```

### Rules the PutFile path must follow

1. **Whole file in, whole file out.** The editor sends the complete file on every save, never a diff.
2. **Write first, answer after.** Return 200 only after the version is durably stored. If storing fails, return 500 so the editor retries; never acknowledge a save you did not keep.
3. **Be idempotent.** The demo hashes the bytes (SHA-256) and returns the existing version when the same bytes arrive again (same `documentKey` + hash, or same as the head). Your adapter must do the same, because retries and repeated saves of an unchanged file are normal.
4. **Versions are immutable.** Add a new blob and move the head; never overwrite a stored version. History and restore depend on this.
5. **Check the lock before writing**, and check the bytes look like the file type (`hasSignature`) so a bad upload cannot replace a good document.
6. **Record who contributed.** `X-WOPI-Editors` on PutFile lists the users behind the save; store it as `participants`.
7. **Serialize writes per file.** Two saves racing on one file must not produce two heads.

### Encryption and zero-knowledge storage

The Document Server has to read the plaintext to edit it, so a storage layer that must never see plaintext has to be handled in the host:

- **Host encrypts (storage stays blind):** GetFile decrypts the stored blob and returns plaintext to the Document Server. PutFile receives plaintext, encrypts it (for example AES-256-GCM with a per-file key wrapped by a master key), and hands only ciphertext to storage. Deleting the key then makes the file unrecoverable.
- **Storage decrypts for the host:** simpler, but the storage service sees plaintext, so it is no longer zero-knowledge.

Either way, the host and the Document Server hold the plaintext while a session is open, and the Document Server keeps temporary files for it. A strict zero-knowledge claim cannot cover the editing period; decide and state this before production. Also compute the SHA-256 used for dedup on the plaintext or a keyed hash, not on ciphertext with a random nonce (that would never match twice).

### Checklist for a new storage adapter

- [ ] `readVersion` returns exactly the bytes `addVersion` stored.
- [ ] A repeated `addVersion` with identical bytes returns `created: false` and no new version.
- [ ] A failed write returns an error and leaves the head unchanged.
- [ ] Two concurrent `addVersion` calls on one file end with one consistent history.
- [ ] `promote` changes only the label, not the bytes.
- [ ] The demo's store tests (`src/store.test.js`) pass against your adapter, and the WOPI tests (`src/wopi.test.js`, `src/wopi-close.test.js`) pass with it wired into the app. Only `store.test.js` calls `openStore` directly; I did not try swapping the adapter into the WOPI tests, so expect to adjust their setup.

**Not verified:** the demo has only run against its local-disk store. I have not seen Bethel's storage API, so streaming, size limits, its own versioning and key handling are open questions for that integration.

---

## 11. What was not verified

- **Saving from a real editor** was proven for `.docx` over WOPI only. Other file types open and render in the editor, but I did not save from them.
- **Proof keys:** the byte order of the length prefixes is unconfirmed, so enforcement is not recommended yet.
- **`DisableExport`** in CheckFileInfo is not in ONLYOFFICE's documented properties; its effect is unverified.
- **The Close button** timing with a real editor was not measured. A call with no editor attached waited the full 8 s.
- **Microsoft Word / Office on the web** was not tested at all (section 9 is from the WOPI specification, not from a run).
- **Scale:** the demo keeps locks and presence in memory on one instance. A real system needs a shared lock store.

---

## 12. Reference

- Demo code: `src/wopi.js` (host and close logic), `src/wopi-tokens.js`, `src/wopi-proof.js`, `src/ds-command.js`, `public/editor.js`.
- Demo behaviour, timings and error codes: `API-v0.2.1.md` (sections 4.13, 6, 12).
- Running the demo: `DOCKER.md` and `README.md`.
- Specifications: Microsoft's WOPI REST documentation and ONLYOFFICE's WOPI pages (the demo followed these).
