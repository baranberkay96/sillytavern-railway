# SillyTavern 1.19.0 for Railway: the official image plus a small wrapper.
#
# Nothing of SillyTavern is rebuilt or patched. The wrapper (railway/):
#  - points config/, data/, plugins/ and the global third-party extensions
#    folder at the single Railway volume mounted at /data,
#  - writes a Railway-ready config.yaml on the first boot only,
#  - creates the admin account from ST_ADMIN_HANDLE / ST_ADMIN_PASSWORD before
#    the server starts (SillyTavern exits when it listens publicly while an
#    admin has no password, which is the state of every fresh data root),
#  - forces the settings that keep the instance private (user accounts on,
#    whitelist and basic auth off, no security override) and runs the server
#    as the unprivileged `node` user on $PORT.
#
# Pinned by tag and by the multi-arch index digest of
# ghcr.io/sillytavern/sillytavern:1.19.0 (built 2026-09-14 from git 7e8663cd,
# Node 24.21.0 on Alpine). Upgrade: change both, read the release notes, and
# make sure the build guards below still pass.
FROM ghcr.io/sillytavern/sillytavern:1.19.0@sha256:eef27ff0c7961f1a2f488400f581f48ff38f8b910c5d3b8d389138d71791bb14

WORKDIR /home/node/app

COPY --chmod=0755 railway/entrypoint.sh /home/node/app/railway/entrypoint.sh
COPY --chmod=0644 railway/setup.mjs /home/node/app/railway/setup.mjs

# 1. Fail the build (not the first boot) when upstream files or helpers the
#    wrapper relies on are gone.
# 2. Move the image's state directories to the volume. Upstream's compose file
#    mounts four directories; a Railway service has exactly one volume, so all
#    four become symlinks into /data. The plugins folder ships one file
#    (package.json, "type": "commonjs"), kept as a seed for the volume.
# 3. /.dockerenv: SillyTavern serves the frontend bundle pre-built into dist/
#    only when the is-docker package detects Docker (that file, or "docker" in
#    /proc/self/cgroup). Railway's runtime provides neither, so without it every
#    first boot and every upgrade would recompile the bundle into the volume.
#    dist/ is handed to `node` so webpack's cache check can write if it needs to.
RUN set -eu; \
    need_file() { test -e "$1" || { echo "missing in base image: $1" >&2; exit 1; }; }; \
    need_text() { grep -q "$1" "$2" || { echo "upstream changed: '$1' not found in $2" >&2; exit 1; }; }; \
    for f in server.js recover.js default/config.yaml plugins/package.json public/login.html src/users.js src/util.js dist; do need_file "$f"; done; \
    test -L config.yaml || { echo "upstream changed: config.yaml is no longer a symlink to config/config.yaml" >&2; exit 1; }; \
    need_text '^export function getPasswordHash(' src/users.js; \
    need_text '^export function getPasswordSalt(' src/users.js; \
    need_text '^export function toKey(' src/users.js; \
    need_text "^export const KEY_PREFIX = 'user:';" src/users.js; \
    need_text '^export function setConfigFilePath(' src/util.js; \
    need_text "getConfigValue('enableUserAccounts'" src/users.js; \
    for tool in node su-exec tini git awk stat; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }; done; \
    sh -n railway/entrypoint.sh; \
    node --check railway/setup.mjs; \
    mkdir -p /opt/railway-seed; \
    mv plugins /opt/railway-seed/plugins; \
    rm -rf config data public/scripts/extensions/third-party; \
    ln -s /data/config config; \
    ln -s /data/data data; \
    ln -s /data/plugins plugins; \
    ln -s /data/extensions public/scripts/extensions/third-party; \
    chown -R node:node dist; \
    touch /.dockerenv

ENV PORT=8000 \
    NODE_ENV=production

EXPOSE 8000

# Replaces upstream's ./docker-entrypoint.sh, which runs the server as root
# unless PUID/PGID are set and cannot place config/plugins on one volume.
ENTRYPOINT ["tini", "-s", "--", "/home/node/app/railway/entrypoint.sh"]
CMD []
