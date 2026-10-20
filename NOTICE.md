# NOTICE: SillyTavern template

## Software deployed

| Component | Source | License | How it is used |
|---|---|---|---|
| SillyTavern | https://github.com/SillyTavern/SillyTavern, tag `1.19.0` (commit `7e8663cd9c184a550b37238218bdd32c6efc68e9`); image `ghcr.io/sillytavern/sillytavern:1.19.0@sha256:eef27ff0c7961f1a2f488400f581f48ff38f8b910c5d3b8d389138d71791bb14` | GNU Affero General Public License v3.0 (repository `LICENSE`; image label `org.opencontainers.image.licenses=AGPL-3.0`) | Used as the base image. No SillyTavern source file is modified, copied into this repository or redistributed by it; the Dockerfile only adds the wrapper files, replaces four empty directories with symlinks to the volume and creates an empty `/.dockerenv`. |

Third-party software inside the official image (Node.js, Alpine packages, npm dependencies, bundled default content) keeps its own licenses.

SillyTavern is a name of its respective owners. This is a community template; it is not affiliated with or endorsed by the SillyTavern project.

## AGPL-3.0 notes

- **Source of what runs**: SillyTavern runs unmodified; its complete corresponding source is the upstream tag above (https://github.com/SillyTavern/SillyTavern/tree/1.19.0). The wrapper that builds the deployed image is the `services/sillytavern/` folder of this repository.
- **Wrapper license**: the wrapper files were written for this template. `railway/setup.mjs` loads SillyTavern modules (`src/util.js`, `src/users.js`) into its own process and the image is built on SillyTavern's, so the wrapper is offered under the same license, AGPL-3.0.
- **If you modify SillyTavern** in your deployment (for example by patching files in the image), AGPL-3.0 section 13 requires you to offer the modified source to everyone who uses your instance over the network. Installing extensions or plugins is not a modification of SillyTavern itself, but those come with their own licenses.
- AGPL-3.0 text: https://github.com/SillyTavern/SillyTavern/blob/1.19.0/LICENSE

These notes describe how the template is put together; they are not legal advice.

## Upstream material used at runtime (not copied)

- `default/config.yaml` from the image is the base of the first-boot `config.yaml`; the wrapper sets a few keys with the `yaml` library and keeps upstream's comments.
- `src/users.js` helpers `getPasswordSalt`, `getPasswordHash`, `toKey` and `KEY_PREFIX`, and `src/util.js` `setConfigFilePath`, are imported by `setup.mjs` to create the admin account the same way upstream's `recover.js` does.
- `plugins/package.json` from the image is copied to the volume when missing.

## Upstream files checked (tag `1.19.0`, released 2026-09-14, checked 2026-10-20)

- `Dockerfile`, `docker/docker-entrypoint.sh`, `docker/docker-compose.yml`, `docker/build-lib.js`, `.dockerignore`, `default/config.yaml`, `package.json`, `package-lock.json` (versions of `yaml`, `node-persist`, `is-docker`), `server.js`, `recover.js`, `plugins/package.json`
- `src/server-main.js` (middleware order, public routes, startup sequence, exit handler), `src/server-startup.js` (IPv4/IPv6 listeners), `src/command-line.js`, `src/config-init.js`, `src/util.js` (environment variables over `config.yaml`), `src/users.js` (default user, security check, login page, session versioning), `src/recover-password.js`, `src/constants.js`, `src/express-common.js`, `src/endpoints/users-public.js` (discreet login, login and recovery rate limits), `src/endpoints/users-admin.js`, `src/endpoints/extensions.js`, `src/endpoints/secrets.js`, `src/plugin-loader.js`, `src/private-request-filter.js`, `src/middleware/basicAuth.js`, `whitelist.js`, `hostWhitelist.js`, `webpack-serve.js`, `webpack.config.js`, `src/healthcheck.js`, `public/login.html`, `public/scripts/login.js`
- Release: https://github.com/SillyTavern/SillyTavern/releases/tag/1.19.0
- Dependencies read for behaviour (not redistributed): `is-docker@3.0.0`, `node-persist@4.0.4`
- Railway networking headers: https://docs.railway.com/networking/public-networking/specs-and-limits (`X-Real-IP`)

## Market templates and repositories reviewed (ideas only, nothing copied)

| Template / repo | License | Use |
|---|---|---|
| `YuyzZp` "SillyTavern" (image `ghcr.io/null2264/st-railway:latest`) | marketplace config only | Read for the starting point (single volume, discreet-login variable). No text copied. |
| `sillytavern-cloud` "SillyTavern in the Cloud" (same image) | marketplace config only | Read; nothing used. |
| `sillytavern` / `gridalpha/sillytavern-railway` | no license (all rights reserved) | Read only. Ideas that informed this template: create the admin password before the server starts, re-apply it only when the variable changes, link plugins and global extensions into the one volume, run as `node`, its report that Railway's edge address rotates. The code, scripts and prose here were written independently; no files or text were copied. |

All template files (TEMPLATE.md, template.json, README.md, this NOTICE, the Dockerfile and the wrapper scripts) were written for this package.
