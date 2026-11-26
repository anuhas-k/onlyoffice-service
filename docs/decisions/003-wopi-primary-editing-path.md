# ADR-003 — WOPI as the primary editing path: keep / change / drop review

- **Status:** DRAFT for review (2026-11-26). Not accepted. Supersedes parts of ADR-001 only if accepted.
- **Basis:** `SPEC.md` (acceptance criteria, API contracts, data model), `docs/decisions/001-onlyoffice-editing-service.md` (D1–D8), `STATUS.md` task titles, and the measured behaviour of the WOPI demo (`demo-wopi/ADD-WOPI-GUIDE.md`, `demo-wopi/API-v0.2.1.md` §12).
- **Not read:** the individual task files under `docs/tasks/`. Task rows below are judged from titles and dependencies only; open each brief before changing it.

## What the demo measured that matters here

1. DS 8.2.2 sends **no PutFile when the user clicks Save** in WOPI mode. A save needs a command-service `forcesave` (PutFile arrives in seconds).
2. DS sends **no "editor left" signal**. The host needs its own close detection (page beacon, heartbeat, sweeper).
3. After a command-service `drop`, **UNLOCK arrives about 1.5–2 minutes later** (DS cleanup runs every 2 minutes).
4. Only `.docx` saving was proven. Microsoft Word / Office on the web was **not tested**. Proof-key byte order is **unconfirmed**.

## Acceptance criteria (SPEC.md)

| AC | Verdict | Note |
|---|---|---|
| AC-1 one-command start | Keep | Same compose stack. |
| AC-2 edit in browser, no download | Keep | Editor opens by form POST into an iframe. |
| AC-3 co-editing | Keep | Needs a two-window test under WOPI; the demo did not measure cursors or latency. |
| AC-4 milestone ≤ 10 s after all close | **Change** | Unlock alone takes ~2 min. Reaching 10 s needs forcesave on close, then promote. Reword the AC and test it. |
| AC-5 force-save checkpoint, key unchanged | **Change** | Forcesave works (PutFile in seconds). "Document key" does not exist in WOPI; say "same lock id and session". |
| AC-6 fresh key after save | **Change** | WOPI has no document key. Replace with "reopening serves the new version (`X-WOPI-ItemVersion` changes)". Not tested in the demo. |
| AC-7 no duplicate versions | **Change** | Same intent (hash + lock dedup, already in the demo store); reword from "status-2 callback" to "repeated PutFile". |
| AC-8 no lost saves, backend down | **Change, unverified** | Depends on DS retrying a failed PutFile and on the forgotten-file store under WOPI. Neither was tested. |
| AC-9 forged callback rejected | **Change** | Callback JWT is replaced by the WOPI access token (+ proof keys, log-only today). The "download URL on another host" check disappears, because PutFile carries the bytes in the request body. |
| AC-10 no cross-file access | **Change** | The download token becomes the access token bound to file and user. Keep the 401 tests. |
| AC-11 lock + lease | **Change** | The Document Server drives LOCK / REFRESH_LOCK / UNLOCK. Keep a host-side backstop sweeper for the lost-UNLOCK case. |
| AC-12 revoke mid-session | **Open** | The demo has no revoke path. Revoking means expiring the access token and `drop`; timing is unmeasured. |
| AC-13 size limit, view-only | Keep | Mode comes from CheckFileInfo. |
| AC-14 crypto-shredding | Keep | Storage-side, protocol-independent. |
| AC-15 Merkle roots | Keep | Protocol-independent. |
| AC-16 no secrets in logs | Keep, extend | Also never log the `access_token` query parameter. |

## API contracts (SPEC.md)

| Endpoint | Verdict |
|---|---|
| `POST /dev/token`, `GET/POST/DELETE /files…`, `GET /files/:id` | Keep |
| `POST /files/:id/sessions` | **Change**: returns `{editorUrl, formFields, heartbeatMs…}` instead of a signed editor config. Demo shape in `API-v0.2.1.md`. |
| `DELETE …/sessions/current/participants/:userId` | **Change**: revoke by token expiry + drop (see AC-12). |
| `GET /files/:id/content?t=` | **Replace** by WOPI GetFile. Keep `GET …/versions/:vid/content` for history. |
| `POST /onlyoffice/callback` | **Drop** from the primary path (see decision below). |
| New: WOPI `CheckFileInfo`, `GetFile`, `PutFile`, lock operations; `/wopi-sessions/:id/heartbeat` and `/leave` | **Add** (written and tested in the demo). |
| `GET /files/:id/versions`, `GET /anchor-batches`, `GET /healthz` | Keep |

## Data model (SPEC.md)

| Table | Verdict |
|---|---|
| tenants, users, files, file_keys, versions, outbox, anchor_batches, anchor_leaves | Keep |
| `versions.document_key` and `UNIQUE (file_id, document_key, content_sha256)` | **Change**: key the dedup on the WOPI lock id + hash. |
| `locks` | **Change**: holder is the WOPI lock id; keep `holder_type` (the `m365` value already fits Word later). |
| `doc_keys` | **Drop** (WOPI has no document key), or keep only if the callback path stays. |
| `participants` | Keep; fill from `X-WOPI-Editors` and heartbeats. |

## ADR-001 decisions

| ADR | Verdict | Note |
|---|---|---|
| D1 storage port | Keep | The demo's `readVersion` / `addVersion` / `promote` map onto it (see guide §10). |
| D2 reliable saving | **Change** | Keep the principles (write before ack, 500 to retry, hash dedup, outbox). Drop the status table and URL download; add forcesave-on-close. Reconciler is unverified under WOPI. |
| D3 document keys | **Drop/replace** | Not used by WOPI. |
| D4 locks | **Change** | Lock ops are DS-driven; 30-min lease already matches WOPI; keep conflict-version rule. |
| D5 immutable versions, shredding | Keep | |
| D6 targets | Keep, re-measure | Close-to-milestone time changes (AC-4). |
| D7 scope | **Reverse** | ADR-001 put WOPI out of scope. |
| D8 one service, three containers | Keep | |

## Tasks (judged from titles only)

| Task | Verdict |
|---|---|
| 001 skeleton, 002 compose + spike, 004 auth, 005 storage + crypto, 006 DS client, 007 files API, 013 versions, 019 delete + shred, 020 anchoring | Keep (006 must expose `forcesave` and `drop`) |
| 003 schema | Change (doc_keys, locks, dedup key) |
| 010 keys + download tokens | Change → WOPI access tokens |
| 011 callback trust + saving | **Replace** → CheckFileInfo / GetFile / PutFile / lock handlers |
| 012 sessions | Change (editor URL + form fields, close detection) |
| 014 test UI core | Change (iframe form POST, postMessage lifecycle) |
| 017 revoke + sweeper | Change |
| 018 forgotten-file reconciler | Hold until WOPI behaviour is tested |
| 021, 022, 023 | Adjust to the above |
| 008, 009, 015, 016, 024 integration/review drops | Re-scope after the changes |

## Open before accepting

1. One real Microsoft Word / Office on the web session against the host (the reason to choose WOPI).
2. Close-button timing and forcesave-on-close, to set a real AC-4 number.
3. DS behaviour when PutFile fails (retry?) and whether the forgotten-file store applies under WOPI.
4. Revoke timing.
