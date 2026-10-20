# SillyTavern 1.19 AI Chat and Character UI: Railway template spec

## Listing

| Field | Value |
|---|---|
| Name | **SillyTavern 1.19 AI Chat and Character UI** (`1.19` = minor version of the pinned `1.19.0`; upstream spelling "SillyTavern") |
| Description | Power-user chat UI for any LLM: characters, lorebooks, extensions, login. (73 chars, unchanged) |
| Category | AI/ML |
| Tags | sillytavern, llm, ai-chat, roleplay, character-cards, lorebook, openai-compatible, self-hosted |
| Icon | `https://cdn.jsdelivr.net/gh/SillyTavern/SillyTavern@1.19.0/public/img/logo.png` (upstream logo pinned to the tag; HTTP 200 `image/png`, checked 2026-10-20) |

The description holds as written:
- **Any LLM**: SillyTavern talks to OpenAI, Anthropic, Google, Mistral, DeepSeek, OpenRouter, NovelAI, AI Horde, KoboldCpp, Ollama, vLLM and any OpenAI-compatible endpoint. No model is bundled; nothing is needed at deploy.
- **Characters, lorebooks**: character cards and World Info are core features stored on the volume.
- **Extensions**: UI extensions install from the app (per user, or for everyone by an admin) and persist on the volume. Server plugins are supported but off by default (see Extensions and plugins).
- **Login**: multi-user accounts are forced on; the admin account is created from generated credentials before the server starts.

## Base market templates

| Market template | Source | State on 2026-10-20 | Verdict |
|---|---|---|---|
| `YuyzZp` "SillyTavern" (leader) | third-party image `ghcr.io/null2264/st-railway:latest` | 405 projects, **312 active** | Not the official image and tag `latest`. Its own README says the default user has **no password** after deploy and asks you to set one "as soon as you're able to access ST", so the instance and any API keys in it are open until then. No healthcheck, no `PORT`, volume at `/home/node/app/persist/`. Kept as an idea: discreet login as a variable. |
| `sillytavern-cloud` "SillyTavern in the Cloud" | same third-party image, `latest` | 43 projects, 33 active | Same image and same open default. Its README promises v1.17.0, a `/data` volume and `WHITELIST_MODE` / `BASIC_AUTH_*` variables that its config does not contain (volume is `/home/node/app/persist/`, domain on port 8080), and says API keys stay in the browser. They do not: SillyTavern stores them server-side in each user's `secrets.json`. |
| `sillytavern` (repo `gridalpha/sillytavern-railway`) | Dockerfile on the official `ghcr.io/sillytavern/sillytavern:latest` | 37 projects, 31 active | **Strongest base, ideas only (no license).** Kept: official image, user accounts on with whitelist off, admin password set before the server starts, re-applied only when the variable changes, one volume with plugins and global extensions linked into it, app runs as `node`. Problems: tag `latest`; the well-known handle `default-user` is listed on the login page, so the 6-digit password-recovery code is the only barrier besides rate limits it reports as ineffective on Railway; `config.yaml` lives on the container layer (edits are lost on redeploy); the template's config has no healthcheck; restart `ON_FAILURE`, but upstream's crash handler exits with code 0, so a crash is not restarted; it patches upstream source with `sed` at boot. |

Upstream references checked at tag `1.19.0` (commit `7e8663cd`): `Dockerfile`, `docker/docker-entrypoint.sh`, `docker/docker-compose.yml` (four bind mounts: `config`, `data`, `plugins`, `public/scripts/extensions/third-party`; port 8000; heartbeat healthcheck), `default/config.yaml`, and the server code listed in NOTICE.md. The local `_upstream` copy is byte-identical to the tag for every file used (checked with `git hash-object` against `gh api …/contents?ref=1.19.0`).

## Pinned versions

| Component | Source | Version | Released | Checked |
|---|---|---|---|---|
| SillyTavern | `ghcr.io/sillytavern/sillytavern:1.19.0@sha256:eef27ff0c7961f1a2f488400f581f48ff38f8b910c5d3b8d389138d71791bb14` (OCI index, amd64 + arm64; amd64 manifest `sha256:6d254526…`, 13 layers, 211 MB compressed) | 1.19.0 = git tag `1.19.0`, commit `7e8663cd9c184a550b37238218bdd32c6efc68e9` (image label `org.opencontainers.image.revision`) | 2026-09-14 | 2026-10-20 |

Image facts read from the registry (anonymous GHCR token, manifest and config blob): Node 24.21.0 on Alpine, `WORKDIR /home/node/app`, no `USER` (runs as root unless `PUID`/`PGID` are set), `ENTRYPOINT ["tini","--","./docker-entrypoint.sh"]`, `EXPOSE 8000`, label `org.opencontainers.image.licenses=AGPL-3.0`. Tags `latest` and `release` point to a different digest built from the same commit; the template pins the versioned tag.

The service is built from `services/sillytavern/Dockerfile` (repo `baranberkay96/sillytavern-railway`, root `/services/sillytavern`), a thin layer on the pinned image. Upgrade: change tag and digest in the Dockerfile, read the release notes, redeploy. The build fails early if upstream files or helpers the wrapper uses disappear. Upstream adds new `config.yaml` keys and migrates data by itself on start.

## Architecture

```
 Browser ──HTTPS──► Railway edge (sets X-Real-IP) ──► :8000  healthcheck GET /login
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ SillyTavern (official image 1.19.0 + railway/ wrapper)                     │
 │  podman-init (PID 1) → tini -s → railway/entrypoint.sh (root)              │
 │   1. /data/{config,data,plugins,extensions,railway} created, chown node   │
 │   2. security settings exported as SILLYTAVERN_* (win over config.yaml)   │
 │   3. railway/setup.mjs (as node): first-boot config.yaml, admin account   │
 │   4. exec su-exec node node server.js --listen   ← main process           │
 │      Express: login page, static UI, /api/* behind the session login     │
 │      relays prompts to the configured LLM APIs, git clones extensions    │
 │  volume /data                                                              │
 │   config/config.yaml   ← /home/node/app/config (symlink)                   │
 │   data/                ← dataRoot: users, chats, characters, lorebooks,    │
 │                          secrets.json (API keys), _storage (accounts)      │
 │   plugins/             ← /home/node/app/plugins (server plugins)           │
 │   extensions/          ← public/scripts/extensions/third-party (global)    │
 │   railway/admin-credential.json  (HMAC of the applied admin variables)     │
 └────────────────────────────────────────────────────────────────────────────┘
```

One service, no database: SillyTavern keeps everything in files (accounts in a `node-persist` store under the data root). Upstream's compose file is a single container too; nothing was dropped. There are no workers or schedulers to add, and the app is single-writer on its files, so one replica.

### Why one volume and symlinks

Upstream's compose file mounts four directories. A Railway service gets one volume, so the Dockerfile replaces the four image directories with symlinks into `/data` at build time (no runtime file juggling). `config.yaml` at the app root is upstream's own symlink to `config/config.yaml`, so upstream's `recover.js` keeps working over `railway ssh`. The data root is also forced to `/data/data` through `SILLYTAVERN_DATAROOT`, so an edited `dataRoot` in `config.yaml` cannot move data off the volume. SillyTavern resolves these paths lexically (`isPathUnderParent` uses `path.normalize`/`path.relative`, no `realpath`), so the symlinks are transparent.

### Why the wrapper replaces upstream's entrypoint

`docker-entrypoint.sh` runs the server as root unless `PUID`/`PGID` are set, only knows the four separate mounts, and runs `npm run init` (a second Node start; the server's own `initConfig()` already adds missing config keys). The wrapper does the same three steps (create directories, seed `config.yaml`, `exec node server.js --listen`) with the volume layout above and always as `node`.

### Frontend bundle (`/.dockerenv`)

SillyTavern pre-builds its frontend library bundle into `dist/` during the image build and uses it only when the `is-docker` package (3.0.0) detects Docker: `/.dockerenv` exists or `/proc/self/cgroup` mentions docker. Railway's runtime provides neither, so the server would recompile the bundle with webpack into the data root on the first boot and after every upgrade. The Dockerfile creates `/.dockerenv` and hands `dist/` to `node`. The only other `is-docker` use is whitelisting Docker host IPs in whitelist mode, which this template keeps off.

## Service: SillyTavern

| Setting | Value |
|---|---|
| Source | repo `baranberkay96/sillytavern-railway`, root `/services/sillytavern` (Dockerfile) |
| Start | image ENTRYPOINT `tini -s -- /home/node/app/railway/entrypoint.sh` (no start command override) |
| Healthcheck | `GET /login` on `PORT=8000`, timeout 600 s (see below) |
| Public domain | yes, target port 8000 |
| TCP proxy | none |
| Volume | `/data` |
| Restart policy | `ALWAYS` (upstream's `uncaughtException` handler calls `process.exit()` with code 0, which `ON_FAILURE` would not restart) |
| Replicas | 1 (file-based state, single writer) |
| Draining | `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10`; SIGTERM makes SillyTavern save usage stats and exit |

### Healthcheck path

`/login` answers **200 without authentication by design**: it is the login page (`loginPageMiddleware` sends `public/login.html` when accounts are on and nobody is signed in). Everything with data sits behind `requireLoginMiddleware` and returns 403 without a session; `/` redirects to `/login`. The server only starts listening after user storage, migrations, content checks and the frontend bundle are ready, so a 200 means ready. Other options do not work here: basic auth (`basicAuthMode`) has no exempt path and answers 401 to everything, including Railway's probe; upstream's Docker healthcheck (`src/healthcheck.js`) checks a heartbeat file, not HTTP. The probe's `Host: healthcheck.railway.app` is accepted because the host whitelist stays off.

### What the wrapper does on every start

| Step | Effect |
|---|---|
| `PORT` | Validated (1-65535), exported as `SILLYTAVERN_PORT`. |
| Forced settings | Exported as `SILLYTAVERN_*` variables, which SillyTavern reads before `config.yaml`: `LISTEN=true`, `LISTENADDRESS_IPV4=0.0.0.0`, `PROTOCOL_IPV4=true`, `SSL_ENABLED=false`, `ENABLEUSERACCOUNTS=true`, `WHITELISTMODE=false`, `BASICAUTHMODE=false`, `SECURITYOVERRIDE=false`, `DISABLECSRFPROTECTION=false`, `SSO_AUTHELIAAUTH=false`, `SSO_AUTHENTIKAUTH=false`, `DATAROOT=/data/data`, `BROWSERLAUNCH_ENABLED=false`. A Railway variable with a different value is logged and overridden; a different value in `config.yaml` is logged too. |
| `/data` check | Warning in the log when `/data` is not a mounted volume. |
| Directories | `/data/{config,data,plugins,extensions,railway}` created; `chown -R node:node` only for a directory whose top-level owner is not `node` (as upstream does); `plugins/package.json` (`"type": "commonjs"`) copied from the image when missing. |
| `config.yaml` (first boot only) | Written from upstream's `default/config.yaml` with comments kept: `listen: true`, whitelist off, user accounts on, `enableDiscreetLogin: true`, `rateLimiting.preferRealIpHeader: true` (Railway documents `X-Real-IP` as the client IP), `hostWhitelist.scan: false` (its warning recommends a host whitelist, which would reject Railway's healthcheck host), `enableServerPluginsAutoUpdate: false`, `browserLaunch.enabled: false`, and a random `basicAuthUser.password` instead of the default `password`. Mode 0600. Later boots never rewrite it; it must parse as YAML or the boot stops with a clear message. |
| Admin account | See below. |
| Environment | `ST_ADMIN_HANDLE` and `ST_ADMIN_PASSWORD` are unset before the server starts. The server runs as `node`, which cannot read `/proc/1/environ` (root-owned). |

### Admin account

SillyTavern refuses to start when it listens on a public address while an enabled admin has no password, and a fresh data root only contains such an admin (`default-user`). `railway/setup.mjs` runs before the server and uses upstream's own `getPasswordSalt`/`getPasswordHash`/`toKey` (the helpers its `recover.js` uses) on the same `node-persist` store:

- **First boot**: creates the admin `ST_ADMIN_HANDLE` with `ST_ADMIN_PASSWORD` (display name "Admin"). Because an account now exists, upstream never creates `default-user`.
- **Later boots, variables unchanged**: nothing is written. A password changed inside SillyTavern stays. The state file holds an HMAC of the applied pair with a random salt, not the password.
- **Variables changed** (recovery path): an existing account with that handle gets the new password and is enabled and made admin again (its sessions are signed out, because upstream ties sessions to the password hash); a new handle creates a new admin, the old account stays.
- **Fails closed**: a handle outside `a-z`, `0-9` and single dashes, longer than 64, or a password under 12 characters stops the boot. Invalid YAML in `config.yaml` stops the boot.
- **Warnings**: an enabled admin without a password (e.g. a `default-user` from an older volume) is reported with the fix (set `ST_ADMIN_HANDLE` to that handle); an applied account that was deleted is reported, not silently recreated.

### Variables

None is required at deploy.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8000` | Healthcheck port = app port = domain target port (Rule 8.1); upstream's default port |
| `ST_ADMIN_HANDLE` | `admin-${{secret(10, "…")}}` | Random handle (about 50 bits). With discreet login it is not shown anywhere, so the password-recovery flow cannot be aimed at the admin |
| `ST_ADMIN_PASSWORD` | `${{secret(32)}}` | Applied on the first boot and when it changes |
| `SILLYTAVERN_ENABLEDISCREETLOGIN` | `true` | Upstream setting; hides the account list on the login page |
| `SILLYTAVERN_ENABLESERVERPLUGINS` | `false` | Upstream setting; see Extensions and plugins |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `10` | Graceful stop window |

Every other `config.yaml` key can be set as a variable: `SILLYTAVERN_` plus the key in upper case with dots as underscores (`sessionTimeout` → `SILLYTAVERN_SESSIONTIMEOUT`, `extensions.autoUpdate` → `SILLYTAVERN_EXTENSIONS_AUTOUPDATE`), or by editing `/data/config/config.yaml` over `railway ssh` and redeploying. The forced settings above cannot be changed.

Not set on purpose: LLM provider keys (entered per user in the UI, stored in that user's `secrets.json` on the volume); `allowKeysExposure` (stays `false`, so the API never returns stored keys to a browser); `privateAddressWhitelist` (upstream default off: with it on, requests to a private Ollama or KoboldCpp service on Railway's private network are blocked until you list its range; turn it on with `SILLYTAVERN_PRIVATEADDRESSWHITELIST_ENABLED=true` when you create accounts for people you do not fully trust).

## Security model

- **Not publicly open**: every data and API route needs a signed-in session (cookie session with a secret on the volume, CSRF tokens on). Whitelist mode is off because Railway's edge, not the browser, is the TCP peer; basic auth is off because it would also block the healthcheck. Neither can be switched on by mistake, and the security override that lets SillyTavern listen without any protection is forced off.
- **Why the handle is random and hidden**: SillyTavern's password recovery mails nothing; it prints a 6-digit code to the server log and accepts it from anyone who knows the handle, with a per-IP limit of 5 tries per 5 minutes. Upstream keys that limit on the TCP peer (plus the forwarded client IP when `preferRealIpHeader` is on, as here), and the `gridalpha` repo reports that Railway's edge connects from rotating addresses, which would spread attempts over many buckets (not verified here). With a well-known handle such as `default-user` that limit would be the only barrier. A random handle that the login page does not list removes the target; the 32-character password removes login guessing. Accounts you create later should also get hard-to-guess handles, or keep discreet login on.
- **What an attacker would get otherwise**: each user's `secrets.json` holds their provider API keys in plain text on the volume. The UI never shows them back (`allowKeysExposure: false`), but anyone signed in can generate text with them at the owner's expense, read every chat and character, and install extensions.
- **Process**: the server runs as `node`, not root. Anyone with access to the Railway project can read the volume (`railway ssh`), including API keys and account hashes.

## Extensions and plugins

- **UI extensions** (Extensions → Install extension) are git repositories of browser JavaScript. Any user can install them for themselves; an admin can install them for everyone. They run in the browser with the user's session: they can read that user's chats and settings, call SillyTavern's API (including generation through stored keys) and send data to other sites. Install only from sources you trust. Upstream updates installed extensions automatically when SillyTavern's version changes (`extensions.autoUpdate: true`, upstream default); set `SILLYTAVERN_EXTENSIONS_AUTOUPDATE=false` to review updates yourself. Global extensions live in `/data/extensions`, per-user ones in `/data/data/{handle}/extensions`.
- **Server plugins** are Node.js modules loaded into the server process. They can read and change every file on the volume (all users' chats, `secrets.json`, account hashes, the cookie secret) and reach the network. They are off (`SILLYTAVERN_ENABLESERVERPLUGINS=false`). To use one: `railway ssh`, `cd /data/plugins && git clone {plugin-repo}` as the `node` user (or `chown -R node:node` afterwards), review the code, set the variable to `true`, redeploy. Upstream's `git pull` of all plugins on every start is switched off in the seeded config; update plugins by hand.

## First login

1. Wait for the deployment to turn healthy (first build pulls the 211 MB image; first boot copies the default content into the admin's folder).
2. Open the public URL. The login page asks for a handle: enter `ST_ADMIN_HANDLE` and `ST_ADMIN_PASSWORD` from the service's Variables tab.
3. Choose a persona name, then open **API Connections** (plug icon) and add a provider key or endpoint. AI Horde works without an account for a first test.
4. Import a character card (`.png`/`.json`) or open the bundled one and send a message.
5. Optional: **User Settings → Admin Panel** creates accounts for other people (use hard-to-guess handles); **Extensions** installs UI extensions.

Forgot the password: change `ST_ADMIN_PASSWORD` in Railway and redeploy. Without a redeploy: `railway ssh`, then `cd /home/node/app && su-exec node node recover.js {handle} '{new-password}'` (upstream's tool; it reads the volume through `config.yaml`).

## Improvements over market templates

1. **Official image, pinned twice**: `ghcr.io/sillytavern/sillytavern:1.19.0` by tag and index digest (market: a third-party `latest` image in the two largest templates, upstream `latest` in the third).
2. **Never publicly open**: user accounts forced on, generated admin created before the server starts, security override, whitelist and basic auth pinned (the two largest market templates start with a password-less default user, per their own README).
3. **Admin handle not guessable or listed**: random handle plus discreet login, so the 6-digit recovery code cannot be aimed at the admin (market: well-known `default-user` shown on the login page).
4. **Config survives redeploys**: `config.yaml` lives on the volume, seeded once with comments kept (market: container layer or the third-party image's own scheme).
5. **Credentials written once**: first boot only, re-applied only when the variable changes, so in-app password changes stay; fails closed on bad input.
6. **Healthcheck that works with auth on**: `/login` on `PORT=8000`, explained above (market: none).
7. **Crashes restart**: `ALWAYS` instead of `ON_FAILURE`, because upstream's crash handler exits 0.
8. **No source patching**: upstream code runs unmodified (one market template rewrites `src/express-common.js` with `sed` at every boot).
9. **Faster boots**: the pre-built frontend bundle is used instead of a webpack compile into the volume.
10. **Documented risk of extensions and server plugins**; plugin auto-update off; plugins and global extensions persist on the volume.
11. **Correct statement about API keys**: they are stored server-side on the volume, not in the browser (one market README says otherwise).

## Resource estimate

Railway prices: RAM $10/GB-month, vCPU $20/vCPU-month, volume $0.15/GB-month. Figures are estimates (not measured; Docker was not used).

| Service | Idle RAM / CPU | Typical RAM / CPU | Notes |
|---|---|---|---|
| SillyTavern | ~0.2-0.3 GB / <0.01 vCPU | 0.3-0.6 GB / 0.02-0.1 vCPU | Node 24 + Express; CPU only while requests are relayed. Built-in local models (vector storage embeddings, captioning, speech, classification via transformers.js/ONNX) add 0.3-1.5 GB while used. |
| Volume | ~20 MB after first boot | 0.5-3 GB | Chats, chat backups (kept without limit by default), characters, images, extensions, downloaded local models |

Estimated monthly cost: **idle ≈ $3**, **typical ≈ $5-8**, with local models ≈ $10-20. LLM usage is billed by your provider.

Minimum plan: **Trial** runs it (1 GB RAM, 0.5 GB volume) for light use; **Hobby** recommended for chat history, images and local models (5 GB volume).

## Verification results (2026-10-20, no Docker)

**The Dockerfile has not been built and the container has not been run.** Checks done instead:

| Check | How | Result |
|---|---|---|
| Image tag and digest | GHCR anonymous token, `HEAD`/`GET` manifests, config blob | `1.19.0` exists (index `sha256:eef27ff0…`, amd64 + arm64); config as described above; revision label = tag commit |
| Image contents | tar listing (no extraction) of the small amd64 layers | `home/node/app/config.yaml -> ./config/config.yaml`; empty `public/scripts/extensions/third-party/`; pre-built bundle `dist/_webpack/079ea4f19654d4f4/output/lib.js` owned `root:node` without group write (hence the `chown`, a ~12.5 MB layer); `root/.gitconfig` only (`safe.directory` applies to root, not to `node`, which owns the extension repos it clones) |
| Release and tag | `gh api repos/SillyTavern/SillyTavern/releases/latest`, `commits/1.19.0` | 1.19.0 is the latest release (2026-09-14), commit `7e8663cd`; license AGPL-3.0 |
| Local source = tag | `git hash-object` vs `gh api contents?ref=1.19.0` for 15 files | identical |
| Scripts | `sh -n`, `dash -n`, `bash -n`, `bash --posix -n` on `entrypoint.sh`; `dash -n` on the Dockerfile `RUN` body; `node --check setup.mjs` (Node 24.3) | clean |
| `setup.mjs` logic | run with Node 24 against upstream's real `default/config.yaml`, the exact `yaml@2.8.3` and `node-persist@4.0.4` versions upstream locks, and test doubles of `src/users.js`/`src/util.js` with upstream's scrypt hashing; 31 scenarios | all pass: first-boot config (values, comments kept, mode 0600), admin created and no `default-user`, unchanged reboot writes nothing, in-app password kept, variable change resets and re-enables, new handle adds an admin, 7 invalid handles and short/missing passwords fail closed, forced-setting notices, invalid YAML stops the boot, legacy password-less `default-user` warned and fixable, corrupt state re-applied, deleted account warned |
| `force`/`check_port` helpers | extracted and run under dash | override + log, silent when equal, hostile values not evaluated, exported to children, ports validated |
| Upstream behaviour relied on | reading 1.19.0 source | env-over-config (`getConfigValue`), security check and exit, `/login` public, data routes behind login, basic auth without exempt paths, discreet login, recovery flow and limits, `is-docker` 3.0.0 logic, `node-persist` write path |
| template.json | JSON parse, `_tools/to_serialized.py` | converts: one service, Dockerfile builder, domain 8000, volume `/data`, healthcheck `/login`/600 s, `ALWAYS` |
| Icon | curl | 200 `image/png` |
| Docker build, container run, Railway networking | Docker / Railway | **not run (unverified)** |

## Verification checklist

- [ ] Build log: the guard `RUN` passes (upstream files and helper exports found, tools present, scripts parse); build finishes.
- [ ] Deploy log: `first boot: wrote …/config/config.yaml`, `admin 'admin-…' created`, no `/data is not a mounted volume` warning, `starting SillyTavern on 0.0.0.0:8000`, upstream's `SillyTavern is listening on IPv4: 0.0.0.0:8000`; **no** "Compiling frontend libraries" webpack run into `/data/data/_webpack` (only the cached check); no security alert exit. Healthcheck `/login` passes.
- [ ] `curl -s -o /dev/null -w '%{http_code}' https://{domain}/login` → 200; `/` → 302 to `/login`. API calls need a CSRF token first: `curl -s -c jar -b jar https://{domain}/csrf-token` → `{"token":"…"}`; then `curl -s -o /dev/null -w '%{http_code}' -b jar -H 'X-CSRF-Token: {token}' -H 'Content-Type: application/json' -d '{}' -X POST https://{domain}/api/users/list` → 204 (discreet login: no account list), and the same request to `/api/characters/all` → 403 (not signed in). The login page in a browser shows handle and password fields and no accounts.
- [ ] Sign in with `ST_ADMIN_HANDLE` / `ST_ADMIN_PASSWORD`; add an AI Horde or OpenRouter connection; a character replies.
- [ ] Install a UI extension (for all users) and one for the user only; redeploy; both are still there (`/data/extensions`, `/data/data/{handle}/extensions`).
- [ ] Persistence: create a character and a chat, change the admin password in the UI, edit `/data/config/config.yaml` (e.g. `sessionTimeout`), redeploy: all kept, the deploy log says `variables unchanged … nothing written`.
- [ ] Change `ST_ADMIN_PASSWORD`, redeploy: the log says `password set`, the old session is signed out, the new password works.
- [ ] Set `SILLYTAVERN_WHITELISTMODE=true` as a variable, redeploy: the log says `ignoring SILLYTAVERN_WHITELISTMODE=true`, login still works. Remove it again.
- [ ] `railway ssh`: `ps -o user,args` shows `node server.js` as `node`; `tr '\0' '\n' < /proc/$(pgrep -f 'node server.js')/environ | grep -c ST_ADMIN` → 0; `ls -l /home/node/app/config /home/node/app/plugins` shows the symlinks.
- [ ] Restart test: `railway ssh` → `kill $(pgrep -f 'node server.js')`; the deployment restarts and comes back healthy.
- [ ] Login rate limit: six wrong passwords in a minute from one browser → the sixth gets "Too many attempts" (429). If all six get "Incorrect credentials", Railway's edge address rotates (see Open questions); the log line `Login failed: Rate limited from …` shows the key.

## Open questions

- **The image has never been built or run.** First Railway build is the first build. Likely failure points: BuildKit `COPY --chmod` (used by other templates here), the entrypoint's BusyBox commands (`stat -c`, `su-exec`, `awk` on `/proc/mounts`; only checked for syntax and with dash on macOS), and the real import of upstream `src/users.js` by `setup.mjs` (the same import upstream's `recover.js` does; only test doubles were used locally).
- Whether `/.dockerenv` really makes SillyTavern skip the runtime webpack compile on Railway (check the deploy log); if not, the first boot compiles into `/data/data/_webpack`, which still works, just slower.
- Whether Railway's edge connects from rotating addresses (reported by the `gridalpha` repo, not verified). If it does, upstream's per-IP login and recovery limits are weak on Railway; the random hidden handle and strong password are what protect the admin.
- The session cookie name is derived from the container hostname; if Railway changes it on each deploy, users have to sign in again after a redeploy (harmless, not verified).
- RAM figures are estimates without a measurement.
