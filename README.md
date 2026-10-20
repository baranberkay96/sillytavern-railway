# Deploy and Host SillyTavern with Railway

Run SillyTavern, the open-source chat interface for power users of large language models, on Railway with a login from the first minute. Bring any model provider or your own endpoint, keep characters, lorebooks, chats and extensions on a persistent volume, and reach it from any browser.

## About Hosting SillyTavern

SillyTavern is a single Node.js server: a web UI for chatting with LLMs through character cards, World Info lorebooks, group chats, presets and extensions. It stores everything in files, including your provider API keys, so a hosted copy must never be reachable without a login. Upstream's Docker setup assumes a private network. This community template runs the official `ghcr.io/sillytavern/sillytavern:1.19.0` image as an unprivileged user, forces user accounts on, creates a generated admin account before the server starts, hides account names on the login page, and keeps config, data, plugins and extensions on one Railway volume.

## Common Use Cases

- Long-form roleplay and collaborative fiction with character cards and lorebooks that follow you between phone and desktop
- One interface for many model providers (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, NovelAI, AI Horde) with saved presets per model
- A front end for your own model server (Ollama, KoboldCpp, vLLM or any OpenAI-compatible API) running elsewhere or on Railway
- A shared instance for a small group: each person gets an account with separate chats, characters and API keys
- Trying community extensions for image generation, text-to-speech, translation and vector memory

## Dependencies for SillyTavern Hosting

- An API key or endpoint for at least one model provider, entered in SillyTavern after the first login (AI Horde works without an account). Not needed to deploy.
- A Railway volume at `/data` (included)

### Deployment Dependencies

- SillyTavern repository and releases: https://github.com/SillyTavern/SillyTavern
- Container image: https://github.com/SillyTavern/SillyTavern/pkgs/container/sillytavern
- Documentation: https://docs.sillytavern.app/
- Docker installation and `config.yaml` reference: https://docs.sillytavern.app/installation/docker/ and https://docs.sillytavern.app/administration/config-yaml/
- Multi-user accounts: https://docs.sillytavern.app/administration/multi-user/
- Extensions: https://docs.sillytavern.app/extensions/

### Implementation Details

| Service | Source | Purpose |
|---|---|---|
| SillyTavern | Dockerfile in `services/sillytavern` on `ghcr.io/sillytavern/sillytavern:1.19.0` (pinned by digest) | Web UI and API on port 8000, healthcheck `/login`, volume at `/data`, restart policy always |

**First login**

1. Open the service's public URL once the deployment is healthy.
2. The login page asks for a handle. Enter `ST_ADMIN_HANDLE` and `ST_ADMIN_PASSWORD` from the service's Variables tab. Both are generated at deploy; the handle is random and the login page does not list accounts, so nobody can target the admin's password recovery.
3. Pick a persona name, open **API Connections** (plug icon) and add a provider key or endpoint.
4. Import a character card or open the bundled one and start chatting.
5. Other people: **User Settings → Admin Panel** creates their accounts. Give them hard-to-guess handles.

**Security notes**: the login cannot be switched off in this template. User accounts are pinned on; whitelist mode, basic auth (it would block Railway's healthcheck) and SillyTavern's security override are pinned off. A variable or `config.yaml` value that tries to change them is logged and ignored. API keys are stored on the server, in each user's `secrets.json` on the volume, and are never sent back to the browser. UI extensions are third-party JavaScript running with your session, so install them only from sources you trust. Server plugins run inside the server with access to every user's data and keys; they are off (`SILLYTAVERN_ENABLESERVERPLUGINS=false`) until you enable them for code you have reviewed.

**Password**: change `ST_ADMIN_PASSWORD` and redeploy to reset it. A password changed inside SillyTavern is kept until you change the variable.

**Configuration**: `config.yaml` is created on the first boot at `/data/config/config.yaml` and is never rewritten. Edit it with `railway ssh` and redeploy, or set any key as a variable: `SILLYTAVERN_` plus the key in upper case, dots as underscores (for example `SILLYTAVERN_SESSIONTIMEOUT=604800`).

**Scaling**: SillyTavern keeps its state in files and is a single writer. Keep one replica and scale vertically. It idles at roughly 0.2-0.3 GB RAM; built-in local models for vector memory, captioning or speech add more while used.

**Pinning and upgrades**: the Dockerfile pins `ghcr.io/sillytavern/sillytavern:1.19.0` by tag and digest. To upgrade, change both to a newer release from https://github.com/SillyTavern/SillyTavern/releases and redeploy. SillyTavern migrates its data and adds new config keys on start; everything on the volume is kept. Download a backup from the app first.

### Why Deploy SillyTavern on Railway?

SillyTavern is most useful when it is always there: the same characters, lorebooks and chats on every device. Railway keeps it running with HTTPS, a persistent volume, automatic restarts, logs and SSH access, without a server to maintain. You pay for the small amount of RAM and CPU it uses; model usage is billed by your provider.
