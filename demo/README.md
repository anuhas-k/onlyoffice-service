# Demo slice — ONLYOFFICE co-editing (SPIKE, never merged)

A throwaway slice that proves the core loop: upload a file, open it in two browser windows, edit together, close, get a version. The real service is the factory build on `feature/onlyoffice-prototype`.

## Run

```bash
cd demo
./up.sh          # first run creates demo/.env with random secrets (gitignored), builds, starts, waits for health
```

Open http://localhost:3000 in two windows. Pick **Alice** in one and **Bob** in the other, upload a `.docx`, and click **Open** in both. Each user sees the other's cursor and typing. Close both editor tabs, and within about 10 seconds a **milestone** version appears under **History**.

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
