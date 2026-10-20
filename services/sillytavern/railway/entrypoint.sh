#!/bin/sh
# shellcheck shell=sh
# SillyTavern on Railway. Railway's init (podman-init) is PID 1 and tini (-s,
# subreaper) runs this script, which ends by exec'ing the server, so the
# container lives and dies with SillyTavern and the restart policy covers
# crashes (upstream's uncaughtException handler exits with code 0).
#
#  1. Volume layout: /data/{config,data,plugins,extensions,railway}, owned by
#     the unprivileged `node` user (Railway mounts volumes as root).
#  2. Settings that keep the instance private are exported as SILLYTAVERN_*
#     variables. SillyTavern reads those before config.yaml, so neither a
#     Railway variable nor an edited config.yaml can switch them off.
#  3. railway/setup.mjs (as `node`): first-boot config.yaml, admin account.
#  4. exec `node server.js --listen` as `node` on 0.0.0.0:$PORT.
set -eu

APP_HOME=/home/node/app
VOLUME=/data
SEED=/opt/railway-seed
RUN_AS=node:node

log() {
    printf '[railway] %s\n' "$*" >&2
}

die() {
    log "ERROR: $*"
    exit 1
}

# force NAME VALUE: export NAME=VALUE and say so when a different value was set.
force() {
    eval "was_set=\${$1+x}"
    eval "previous=\${$1-}"
    if [ -n "$was_set" ] && [ "$previous" != "$2" ]; then
        log "ignoring $1=$previous: this template always uses $2"
    fi
    export "$1=$2"
}

check_port() {
    case "$PORT" in
        ''|*[!0-9]*) die "PORT must be a number, got '$PORT'" ;;
    esac
    if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
        die "PORT must be between 1 and 65535, got '$PORT'"
    fi
}

check_volume() {
    if ! awk -v mnt="$VOLUME" '$2 == mnt { found = 1 } END { exit !found }' /proc/mounts; then
        log "WARNING: $VOLUME is not a mounted volume. Characters, chats, settings,"
        log "WARNING: API keys and the admin account will be lost on the next deploy."
    fi
}

prepare_volume() {
    for dir in config data plugins extensions railway; do
        mkdir -p "$VOLUME/$dir"
    done
    # "type": "commonjs" so that CommonJS server plugins load (upstream file).
    if [ ! -e "$VOLUME/plugins/package.json" ]; then
        cp "$SEED/plugins/package.json" "$VOLUME/plugins/package.json"
    fi
    owner="$(id -u node):$(id -g node)"
    for dir in config data plugins extensions railway; do
        if [ "$(stat -c '%u:%g' "$VOLUME/$dir")" != "$owner" ]; then
            log "chown -R node:node $VOLUME/$dir"
            chown -R "$RUN_AS" "$VOLUME/$dir"
        fi
    done
    chmod 0700 "$VOLUME/railway"
}

cd "$APP_HOME"
[ "$(id -u)" = "0" ] || die "the entrypoint must start as root (it prepares the volume, then drops to node)"

PORT="${PORT:-8000}"
check_port
export PORT

# Network: Railway's edge and healthcheck connect over IPv4.
force SILLYTAVERN_PORT "$PORT"
force SILLYTAVERN_LISTEN true
force SILLYTAVERN_LISTENADDRESS_IPV4 0.0.0.0
force SILLYTAVERN_PROTOCOL_IPV4 true
force SILLYTAVERN_SSL_ENABLED false
# Access control: login with user accounts, never an open listener.
force SILLYTAVERN_ENABLEUSERACCOUNTS true
force SILLYTAVERN_WHITELISTMODE false
force SILLYTAVERN_BASICAUTHMODE false
force SILLYTAVERN_SECURITYOVERRIDE false
force SILLYTAVERN_DISABLECSRFPROTECTION false
force SILLYTAVERN_SSO_AUTHELIAAUTH false
force SILLYTAVERN_SSO_AUTHENTIKAUTH false
# Container hygiene: data on the volume, no desktop browser to launch.
force SILLYTAVERN_DATAROOT "$VOLUME/data"
force SILLYTAVERN_BROWSERLAUNCH_ENABLED false

check_volume
prepare_volume

export HOME=/home/node
su-exec "$RUN_AS" node "$APP_HOME/railway/setup.mjs" || die "setup failed, see the messages above"

# The server never needs the bootstrap credentials; keep them out of its environment.
unset ST_ADMIN_HANDLE ST_ADMIN_PASSWORD

log "starting SillyTavern on 0.0.0.0:$PORT (config $VOLUME/config/config.yaml, data $VOLUME/data)"
exec su-exec "$RUN_AS" node server.js --listen "$@"
