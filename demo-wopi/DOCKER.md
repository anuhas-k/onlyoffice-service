# Running the demo from a Docker image

The demo is **two containers**:

| Container | Image | You build it? |
|---|---|---|
| **app** — this code (uploads, versions, WOPI, history, diff) | `demo-wopi-app:1.0` | **Yes** — from `Dockerfile` (about 239 MB; a saved archive is about 54 MB) |
| **documentserver** — the editor itself | `onlyoffice/documentserver:8.2.2` | No — pulled from ONLYOFFICE |

You need both running. `docker-compose.yml` (builds the app from source) and `docker-compose.image.yml` (runs an already-built image) wire them together. Nothing secret is stored in the image: the two secrets and all URLs are settings you pass in when it starts.

## 1. Build the app image

On a machine with the source code:

```bash
cd demo-wopi
docker build -t demo-wopi-app:1.0 .
```

The base image is pinned to an exact Node and Alpine version and digest, so a rebuild months later starts from the same base. To update it, replace the tag and digest in `Dockerfile` together (the comment there says how).

Check it:

```bash
docker run --rm --entrypoint sh demo-wopi-app:1.0 -c 'id -un; ls /app/src | wc -l'
# node      <- it runs as a non-root user
# 18        <- runtime files only; test files are left out
```

## 2. Hand the image to someone

**As a file** (no registry needed):

```bash
docker save demo-wopi-app:1.0 | gzip > demo-wopi-app-1.0.tar.gz    # about 54 MB
```

Give them that file plus **`docker-compose.image.yml`** and **`.env.example`**. On their machine:

```bash
gunzip -c demo-wopi-app-1.0.tar.gz | docker load
# Loaded image: demo-wopi-app:1.0
```

**Through a registry:** tag and push it under your registry's name, for example `docker tag demo-wopi-app:1.0 <registry>/<team>/demo-wopi-app:1.0` and `docker push …`, then set `APP_IMAGE=<registry>/<team>/demo-wopi-app:1.0` in `.env`. Pushing publishes the image to whoever can read that registry, so check that first.

## 3. Run it

Put `docker-compose.image.yml` and `.env.example` in one folder, then:

```bash
cp .env.example .env
sed -i "s/^DS_JWT_SECRET=.*/DS_JWT_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^APP_SECRET=.*/APP_SECRET=$(openssl rand -hex 32)/" .env

docker compose -f docker-compose.image.yml up -d
```

The first start downloads the Document Server image (large, one time), then the Document Server needs a minute or two to become ready (about 25 seconds when its image is already on the machine). Open **http://localhost:3001**.

The compose file refuses to start if either secret is empty. Do not commit `.env`.

### What to check

```bash
docker compose -f docker-compose.image.yml ps          # app: healthy
curl http://localhost:3001/healthz                      # {"ok":true}
curl http://localhost:3001/formats                      # "dsReachable":true
```

In the browser the **Supported file types** card shows the 57 types and "Document Server reachable". Click **Create sample** on any row, then open it with **Open (WOPI)**.

## 4. Settings (`.env`)

| Setting | Default | Meaning |
|---|---|---|
| `DS_JWT_SECRET` | none, required | Shared secret between the app and the Document Server. 32+ characters. |
| `APP_SECRET` | none, required | Signs download links and WOPI access tokens. 32+ characters. |
| `APP_IMAGE` | `demo-wopi-app:1.0` | Which app image to run. |
| `APP_PORT` / `DS_PORT` | `3001` / `8081` | Ports on this machine. |
| `APP_PUBLIC_URL` | `http://localhost:3001` | How **browsers** reach the app. The port must match `APP_PORT`. |
| `DS_PUBLIC_URL` | `http://localhost:8081` | How **browsers** reach the Document Server. The port must match `DS_PORT`. |
| `WOPI_PROOF` | `log` | `off`, `log` (report mismatches, still allow) or `enforce`. |

The two internal addresses (`http://app:3000`, `http://documentserver`) are how the containers reach each other over Docker's network. They are fixed in the compose file and rarely need changing.

**If other people connect from other machines**, replace `localhost` in `APP_PUBLIC_URL` and `DS_PUBLIC_URL` with this machine's real host name or IP. Their browsers load the editor from the Document Server directly, so a wrong address here means a blank editor. Steps for Windows are in the next section.

## 4a. Letting other machines connect (Windows with WSL2 and Docker Desktop)

This is the setup used when showing the demo to a colleague on the same network. Replace `192.168.1.50` with your Windows machine's IPv4 address from `ipconfig` (not the address `hostname -I` shows inside WSL).

1. In `.env`, set `APP_PUBLIC_URL=http://192.168.1.50:3001` and `DS_PUBLIC_URL=http://192.168.1.50:8081`, then `docker compose -f docker-compose.image.yml up -d --force-recreate`.
2. In an **administrator** PowerShell, allow the two ports:
   ```powershell
   New-NetFirewallRule -DisplayName "demo-wopi" -Direction Inbound -Protocol TCP -LocalPort 3001,8081 -Action Allow
   ```
3. From the other machine, check `curl http://192.168.1.50:3001/healthz` and `http://192.168.1.50:8081/healthcheck` (answers `true`), then open `http://192.168.1.50:3001`.

With Docker Desktop you normally do **not** need WSL mirrored networking: Docker Desktop publishes the ports on Windows itself. Mirrored mode (`networkingMode=mirrored` in `%UserProfile%\.wslconfig`) was tried and caused two problems, below. It can also need `Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow` in an administrator PowerShell, which is only relevant if you use mirrored mode.

**Known problems seen on this setup**

- **The page opens on the host machine but the editor is blank, while a phone or colleague gets a working editor.** The editor is loaded by the browser from `DS_PUBLIC_URL`, and the host machine could not connect to its own LAN address. Remove `networkingMode=mirrored` from `.wslconfig`, run `wsl --shutdown`, restart Docker Desktop and recreate the stack. **This fix has not been confirmed yet**; if it does not work, use another device for the editor on that machine's behalf, or ask for the host-derived editor address change (see `API-v0.2.1.md` §12, problem 11).
- **"Empty reply from server" from a published port, nothing in the app log, but the container answers from inside.** Docker Desktop's port proxy kept stale network state after the networking mode changed. Quit Docker Desktop, run `wsl --shutdown`, start Docker Desktop, recreate the stack.
- **A browser on the same network cannot connect at all.** Check the firewall rule above exists, and that both machines are on the same subnet; some Wi-Fi networks isolate clients from each other.

This is plain HTTP with no login. Use it only on a network you trust.

## 5. Stop, restart, reset

```bash
docker compose -f docker-compose.image.yml stop        # stop, keep all files and versions
docker compose -f docker-compose.image.yml up -d       # start again
docker compose -f docker-compose.image.yml down        # remove containers, KEEP files and versions
docker compose -f docker-compose.image.yml down -v     # remove containers AND all files and versions
```

Files and versions live in the `demo-data` volume. `down -v` deletes them for good.

To run a second copy next to the first, give it another project name and other ports: `docker compose -p second -f docker-compose.image.yml up -d` with different `APP_PORT`, `DS_PORT` and URLs in its `.env`.

## 6. Troubleshooting

| What you see | Likely cause |
|---|---|
| Compose says `required variable … is missing a value` | `.env` is missing or a secret is empty. Re-run the two `sed` lines. |
| The types card says the Document Server is **not reachable** | It is still starting (first start takes a while), or `DS_JWT_SECRET` differs from the one it started with. `docker compose … logs documentserver`. |
| The editor area stays blank | `DS_PUBLIC_URL` is not an address your **browser** can reach, or its port does not match `DS_PORT`. |
| "port is already allocated" | Another program uses that port. Change `APP_PORT` or `DS_PORT` and the matching URL. |
| `docker load` says the image is not found when you run it | `APP_IMAGE` in `.env` does not match the name you loaded. `docker images` shows the real name. |
| Page opens but the editor is blank on the machine running Docker, other devices are fine | That machine cannot reach its own LAN address. See section 4a. |
| `Empty reply from server` on a published port | Docker Desktop port proxy state. See section 4a. |
| History shows nothing new after closing the editor | Closing is detected by the page, so a tab that was killed or lost its network is cleaned up after about 90 seconds. |

## 7. Before using this for anything real

This is a demo, not a deployment. These are known and deliberate:

- **No real login.** Users are picked from a list (Alice, Bob, Carol) and sent as a header. Anyone who can reach the app can act as anyone.
- **No HTTPS.** Put a reverse proxy with TLS in front, and set both public URLs to the `https://` addresses.
- **State is in memory** for locks and who-is-editing, so a restart of the app forgets them. Files and versions are kept in the volume, unencrypted.
- **One app instance only.** Running two behind a load balancer would not share that in-memory state.
- **Proof-key checking is log-only by default** and its byte order is unconfirmed; see the WOPI section of `README.md` before using `enforce`.
