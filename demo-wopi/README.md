# WOPI demo slice — same demo, plus WOPI (SPIKE, never merged)

Lives in `demo-wopi/`, separate from `../demo` (untouched). Runs on **http://localhost:3001** (app) and **:8081** (Document Server) with its own Docker project `demo-wopi`, so both demos can run at once.

A throwaway slice that proves the core loop: upload a file, open it in two browser windows, edit together, close, get a version. The real service is the factory build on `feature/onlyoffice-prototype`.

**API reference and handover guide:** [API-v0.2.1.md](API-v0.2.1.md)

## Run

To run from a ready-built image instead (or to build and share one): see [DOCKER.md](DOCKER.md).

```bash
cd demo-wopi
./up.sh          # first run creates demo-wopi/.env with random secrets (gitignored), builds, starts, waits for health
```

Open http://localhost:3001 in two windows. Pick **Alice** in one and **Bob** in the other, upload a `.docx`, and click **Open** in both. Each user sees the other's cursor and typing. Close both editor tabs, and within about 10 seconds a **milestone** version appears under **History**.

Stop it with `docker compose down`. Add `-v` to also delete the files and versions.

## What it does / doesn't

| Does | Doesn't (the factory build does) |
|---|---|
| Upload .docx/.xlsx/.pptx/.pdf (extension + magic bytes, 100 MB cap) | Real auth: users are picked from a list via the `x-demo-user` header |
| Co-editing in ONLYOFFICE 8.2.2 (fast mode, JWT-signed config, download disabled) | Encryption at rest, Postgres, crypto-shredding |
| Signed 5-minute download links bound to file + version | Locks/leases, revoke, sweeper |
| Callback trust: DS JWT, issued keys only, downloads only from the Document Server host | Forgotten-file recovery after a backend outage |
| Milestone on close (key rotates), checkpoint on force-save (key kept), duplicate saves ignored, failures → 500 so ONLYOFFICE retries | Merkle anchoring, tenants |

Sessions are kept in memory. If the app restarts while a file is open, that save is rejected; the factory build recovers it.

## Tests

```bash
npm test        # 22 node:test cases: tokens, store, server (callback trust, statuses, idempotency)
```

## WOPI mode

The same files, versions and demo users, opened through the **WOPI** protocol instead of the ONLYOFFICE callback protocol. The file list has two links per file: **Open** (ONLYOFFICE protocol) and **Open (WOPI)**. A file open in one engine is refused in the other (`409 EngineBusy`).

How it opens: `POST /files/:id/sessions?engine=wopi` reads the Document Server's `/hosting/discovery`, signs a WOPI access token (file + user + write flag, 1 h) and returns the editor URL and form fields. The editor page POSTs them into an iframe. The Document Server then calls this app: `GET /wopi/files/:id` (CheckFileInfo), `GET …/contents` (GetFile), `POST …/contents` (PutFile) and `POST /wopi/files/:id` with `X-WOPI-Override` `LOCK` / `UNLOCK` / `REFRESH_LOCK` / `UNLOCK_AND_RELOCK` / `GET_LOCK`.

### Why version history needed extra work: WOPI has no "editor left" call

In the ONLYOFFICE-protocol demo the Document Server calls back ~10 s after the last editor leaves and that call produces the **milestone**. Over WOPI it only saves when forced, and ends the session (PutFile + UNLOCK) long after the tabs close. Measured on 8.2.2: `forcesave` → PutFile in seconds; `drop` → UNLOCK about 1.5 min later (its cleanup cron runs every 2 min); left alone, nothing for 8+ minutes. So this demo detects the close itself:

| Signal | Source | What the backend does |
|---|---|---|
| Editor's own **Close** button | WOPI postMessage `UI_Close` (CheckFileInfo `PostMessageOrigin` + `ClosePostMessage`; page checks `event.origin` and `event.source`) | `POST /wopi-sessions/:id/leave` with `wait:true` → force-save + drop while the tab is still connected, then the page navigates away |
| Tab / window closed, reload | `pagehide` → `sendBeacon` to `…/leave` | after a 1 s grace period (a reload re-registers) → force-save + drop |
| While editing | heartbeat every 30 s | throttled force-save → `checkpoint` (see parity table) |
| Crashed tab, lost network | no heartbeat for 90 s (page beats every 30 s) | sweeper (every 15 s) → force-save + drop |
| Nothing works / stuck file | you | `POST /files/:id/wopi/end` (demo user header) |

Force-save + drop make the Document Server send the last PutFile and UNLOCK; UNLOCK relabels the last save `milestone`. If the Document Server has not unlocked within 8 s, the backend labels the last save `milestone` itself (the lock stays until the Document Server's own UNLOCK arrives, which can take ~2 min; until then the file stays refused to the other engine).

### Standards followed (read for this build)

- Microsoft WOPI REST: PutFile (409 + `X-WOPI-Lock` on mismatch or on an unlocked non-empty file), Lock/Unlock/RefreshLock/UnlockAndRelock, `SupportsExtendedLockLength` (lock id ≤ 1024), `X-WOPI-Editors`, `X-WOPI-ItemVersion`, `Version` must change when the file changes.
- Microsoft postMessage: `PostMessageOrigin` (exact origin, no `*`), `ClosePostMessage`, `CloseUrl`, `UI_Close`, `Host_PostmessageReady`.
- Proof keys: `X-WOPI-Proof` / `X-WOPI-ProofOld` / `X-WOPI-Timestamp`, RSA-SHA256 over length-prefixed token + UPPERCASE URL + timestamp, 20-minute window, current/old key rotation, 500 on failure. `WOPI_PROOF=off|log|enforce` (default **log**: mismatches are logged, calls still succeed). The byte order of the length prefixes is not stated in prose by the spec; big-endian is implemented. Run once with `log` and check `./trace.sh` for `wopi proof mismatch` before using `enforce`.
- ONLYOFFICE WOPI pages: CheckFileInfo property list, PutFile headers, command service (`forcesave`, `drop`). Documented there but unused here: `X-LOOL-WOPI-IsAutosave` / `IsExitSave` / `IsModifiedByUser`. **Not documented there:** `DisableExport` (still sent, effect unverified).

**All 57 Document Server formats (`src/formats.js`).** The registry lists every extension the Document Server publishes in `/hosting/discovery` (Word 23, spreadsheets 15, slides 15, PDF-like 4) with its mode, editor family and a first-bytes signature rule used for uploads. **Edit (15):** docx docm dotx odt txt · xlsx xlsm xltx ods csv · pptx pptm potx odp · pdf. **View only (42):** the rest, including legacy binaries (doc xls ppt …: the Document Server only offers *convert* to edit them, and convert needs PutRelativeFile, which answers 501), e-books, web pages, flat ODF, DjVu, XPS. Deviation from `SPEC.md` line 79: `.pptx` is editable here (the spec says view-only) because this spike exists to test every format. The page's **Supported file types** card shows each type, its mode, what the Document Server offers for it right now, and a **Create sample** button (`POST /samples/:ext`) for the 34 types that can be generated: 16 are hand-built (docx xlsx odp pdf txt csv rtf html htm mht mhtml xml fb2 fodt fods fodp) and 18 are converted by the Document Server's conversion service from those (docm dotx dotm odt ott epub · xlsm xltx xltm ods ots · pptx pptm potx potm ppsx ppsm otp). The other 23 (legacy binaries, DjVu, XPS, WPS, StarOffice, form formats, …) cannot be generated: upload your own. `GET /formats` returns the same table as JSON.

**View changes (`.docx`):** every history entry has a *View changes* button that opens a git-style diff against the version before it (`GET /files/:id/versions/:versionId/diff`, optional `?against=<earlier version id>`). Paragraph-level lines with word-level marks inside edited paragraphs; unchanged runs are folded. It reads the stored snapshots only (the app keeps a full copy of the file at every save), so it works the same for the ONLYOFFICE and WOPI paths and would for a later Microsoft integration. **Text only:** formatting, images and table layout are not compared; other file types answer 415; an unreadable file 422; two huge unrelated versions 422 (`DiffTooLarge`). Implementation: `docx-text.js` (zip + XML with `node:zlib`, 20 MB zip-bomb cap), `text-diff.js` (LCS), `version-diff.js`, `public/diff-view.js`.

The History panel groups checkpoints under the milestone that closed them (ADR-001) and refreshes every second while it is open (every 3 s otherwise); checkpoints newer than the latest milestone show as "in progress".

### Parity with the ONLYOFFICE-protocol demo

| Behaviour | ONLYOFFICE protocol | WOPI | Covered by |
|---|---|---|---|
| Two users co-edit one file | session key shared | one lock shared by all editors | live check 2 |
| Close → **milestone** version | status 2 callback | close detection above, UNLOCK or fallback relabel | `wopi-close.test.js`; live check 3 |
| Save / force-save → **checkpoint** | status 6 callback | **Save does not reach the host on this Document Server** (no PutFile while the editor is open, observed). Every PutFile is a `checkpoint`, and the heartbeat sends a throttled force-save (every 30 s while locked; `no changes` = nothing recorded) | `wopi-close.test.js` (auto-checkpoint); live check 3 |
| Duplicate save ignored | documentKey + sha256 | `wopi:<lock id>` + sha256 | `wopi.test.js` |
| Participants credited | `everyone` set per session | `X-WOPI-Editors` for that save, else everyone who joined | `wopi-close.test.js` |
| "Editing now" in the list | status 1 callbacks | open/CheckFileInfo/heartbeat until leave, UNLOCK or 90 s silence | `wopi-close.test.js` |
| Download/print disabled | `permissions.download=false` | `DisablePrint`, `HidePrintOption`, `DisableExport` | CheckFileInfo test; live check 4 |
| View-only pptx | `mode: view` | `view` action, `UserCanWrite=false`, writes → 401 | `wopi.test.js` |
| Untrusted callers refused | DS JWT + issued keys | access token (file + user + expiry) + optional proof keys | `wopi.test.js`, `wopi-proof.test.js` |
| Bytes must match the file type | on download | on PutFile | `wopi.test.js` |
| Tokens never logged | redacted | query string stripped from logged URLs | `wopi.test.js`, `wopi-close.test.js` |

Automated: `npm test` (178 tests). The WOPI tests play the Document Server (same calls as the spike) and a fake `/command` endpoint; they do **not** prove the real Document Server behaves the same.

### Live checks (need Docker)

`./up.sh`, then use `./trace.sh` after each step to see the calls the Document Server made.

1. Open **Open** (ONLYOFFICE) as Alice: it must still load (confirms `WOPI_ENABLED=true` did not break it). Close it.
2. **Open (WOPI)** as Alice and Bob in two windows; type in both; each sees the other's cursor.
3. In Bob's window click the editor's own **Close** (File → Close). Alice stays: `trace.sh` must show **no** force-save/drop (Alice is still there). Then close Alice's with the editor's Close button: within ~10 s the page returns to the list and History shows a `milestone`. Repeat closing a tab with the browser's X instead: the milestone appears after ~1 s grace + ~2 s Document Server + up to 1 s poll.
4. Download/Print in the WOPI editor: hidden or refused?
5. A `.pptx` over WOPI: view-only.
6. Check `trace.sh` for `wopi proof mismatch`. None means proof construction matches the real server.

Version history is recorded for every editable type (the backend stores a full copy at each save and never looks inside); the *View changes* diff only exists for `.docx`.

Known gaps vs the ONLYOFFICE demo: closing relies on this page (a WOPI editor opened some other way is only closed by the 90 s sweeper); the access token does not renew past 1 h; `PUT_RELATIVE`/`RENAME_FILE` answer 501; the file stays refused to the other engine until the Document Server's own UNLOCK lands (~2 min after a close).
