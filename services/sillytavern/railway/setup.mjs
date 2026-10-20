// SillyTavern on Railway: runs as the `node` user right before server.js
// (see entrypoint.sh). Two jobs, both idempotent:
//
//  1. config.yaml: written once, on the first boot, from upstream's
//     default/config.yaml with the template's settings. Later boots leave
//     the file alone (upstream adds keys from newer releases itself).
//  2. Admin account: SillyTavern exits when it listens publicly while an
//     admin has no password, and a fresh data root only has such an admin
//     ("default-user"). This creates the admin from ST_ADMIN_HANDLE and
//     ST_ADMIN_PASSWORD before upstream would create default-user. The pair
//     is applied on the first boot and again only when one of the variables
//     changes (recovery path); otherwise nothing is written, so a password
//     changed inside SillyTavern stays.
//
// Upstream's own helpers are used for hashing and storage keys (the same
// ones its recover.js uses), so stored accounts match what the server expects.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import storage from 'node-persist';
import yaml from 'yaml';
import { setConfigFilePath } from '../src/util.js';

const APP_HOME = path.resolve(import.meta.dirname, '..');
const DEFAULT_CONFIG = path.join(APP_HOME, 'default', 'config.yaml');
// config/ is a symlink to /data/config (see the Dockerfile).
const CONFIG_FILE = path.join(APP_HOME, 'config', 'config.yaml');
const STATE_FILE = '/data/railway/admin-credential.json';
const DATA_ROOT = process.env.SILLYTAVERN_DATAROOT || '/data/data';

const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_HANDLE_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 12;
const ADMIN_DISPLAY_NAME = 'Admin';

// Written into config.yaml on the first boot. The security-relevant ones are
// also forced through SILLYTAVERN_* variables by entrypoint.sh.
const FIRST_BOOT_SETTINGS = Object.freeze([
    [['listen'], true],
    [['listenAddress', 'ipv4'], '0.0.0.0'],
    [['browserLaunch', 'enabled'], false],
    [['whitelistMode'], false],
    [['basicAuthMode'], false],
    [['enableUserAccounts'], true],
    // Hides the account list on the login page, so handles are not public.
    [['enableDiscreetLogin'], true],
    // Railway's edge sets X-Real-IP; logs and rate limits then see the client.
    [['rateLimiting', 'preferRealIpHeader'], true],
    // The host warning suggests a host whitelist, which would reject
    // Railway's healthcheck host; keep the logs free of it.
    [['hostWhitelist', 'scan'], false],
    // No `git pull` of server plugins at every boot (code changes unreviewed).
    [['enableServerPluginsAutoUpdate'], false],
]);

// Settings entrypoint.sh forces; a different value in config.yaml is ignored.
const FORCED_SETTINGS = Object.freeze({
    'listen': true,
    'ssl.enabled': false,
    'enableUserAccounts': true,
    'whitelistMode': false,
    'basicAuthMode': false,
    'securityOverride': false,
    'disableCsrfProtection': false,
    'sso.autheliaAuth': false,
    'sso.authentikAuth': false,
    'browserLaunch.enabled': false,
});

class SetupError extends Error {}

function log(message) {
    console.log(`[railway] ${message}`);
}

function seedConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        return false;
    }
    const doc = yaml.parseDocument(fs.readFileSync(DEFAULT_CONFIG, 'utf8'));
    for (const [keyPath, value] of FIRST_BOOT_SETTINGS) {
        doc.setIn(keyPath, value);
    }
    // Basic auth stays off (it would block the healthcheck); replace the
    // well-known default password anyway, so turning it on is never weak.
    doc.setIn(['basicAuthUser', 'password'], crypto.randomBytes(24).toString('base64url'));
    fs.writeFileSync(CONFIG_FILE, doc.toString(), { mode: 0o600, flag: 'wx' });
    return true;
}

function getPath(object, dottedKey) {
    return dottedKey.split('.').reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), object);
}

function reportForcedSettings() {
    let config;
    try {
        config = yaml.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) ?? {};
    } catch (error) {
        throw new SetupError(`config.yaml is not valid YAML (${error.message}); fix ${CONFIG_FILE} with railway ssh`);
    }
    for (const [key, forced] of Object.entries(FORCED_SETTINGS)) {
        const value = getPath(config, key);
        if (value !== undefined && String(value) !== String(forced)) {
            log(`config.yaml sets ${key}: ${value}; this template always uses ${forced}`);
        }
    }
}

function readAdminInput() {
    const handle = String(process.env.ST_ADMIN_HANDLE ?? '').trim();
    const password = String(process.env.ST_ADMIN_PASSWORD ?? '');
    if (!HANDLE_PATTERN.test(handle) || handle.length > MAX_HANDLE_LENGTH) {
        throw new SetupError(`ST_ADMIN_HANDLE must be 1-${MAX_HANDLE_LENGTH} characters of a-z, 0-9 and single dashes (got '${handle}')`);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new SetupError(`ST_ADMIN_PASSWORD must have at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    return Object.freeze({ handle, password });
}

function credentialDigest(salt, handle, password) {
    return crypto.createHmac('sha256', salt).update(`${handle}\0${password}`).digest('hex');
}

function readState() {
    try {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const valid = ['handle', 'salt', 'digest'].every(key => typeof state?.[key] === 'string');
        if (valid) {
            return state;
        }
        log(`WARNING: ${STATE_FILE} has an unexpected shape; the admin variables will be applied again`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            log(`WARNING: cannot read ${STATE_FILE} (${error.message}); the admin variables will be applied again`);
        }
    }
    return null;
}

function isAlreadyApplied(state, input) {
    if (!state || state.handle !== input.handle) {
        return false;
    }
    const expected = Buffer.from(credentialDigest(state.salt, input.handle, input.password), 'hex');
    const stored = Buffer.from(state.digest, 'hex');
    return stored.length === expected.length && crypto.timingSafeEqual(stored, expected);
}

function writeState(input) {
    const salt = crypto.randomBytes(16).toString('hex');
    const state = {
        handle: input.handle,
        salt,
        digest: credentialDigest(salt, input.handle, input.password),
        appliedAt: new Date().toISOString(),
    };
    const temporary = `${STATE_FILE}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, STATE_FILE);
}

async function applyAdmin(users, input) {
    const key = users.toKey(input.handle);
    const existing = await storage.getItem(key);
    const salt = users.getPasswordSalt();
    const password = users.getPasswordHash(input.password, salt);
    if (existing && typeof existing === 'object') {
        await storage.setItem(key, { ...existing, password, salt, enabled: true, admin: true });
        log(`admin '${input.handle}': password set from ST_ADMIN_PASSWORD, account enabled (its sessions are signed out)`);
        return;
    }
    await storage.setItem(key, {
        handle: input.handle,
        name: ADMIN_DISPLAY_NAME,
        created: Date.now(),
        password,
        salt,
        admin: true,
        enabled: true,
    });
    log(`admin '${input.handle}' created`);
}

async function warnAboutOpenAdmins(users) {
    const accounts = await storage.values(datum => String(datum.key).startsWith(users.KEY_PREFIX));
    const open = accounts.filter(user => user && user.enabled && user.admin && !user.password).map(user => user.handle);
    if (open.length > 0) {
        log(`WARNING: admin account(s) without a password: ${open.join(', ')}. SillyTavern refuses to start like this.`);
        log('WARNING: set ST_ADMIN_HANDLE to that handle and redeploy to give it the ST_ADMIN_PASSWORD password.');
    }
}

async function bootstrapAdmin() {
    const input = readAdminInput();
    // Upstream modules read config.yaml when imported (as in its recover.js).
    setConfigFilePath(path.join(APP_HOME, 'config.yaml'));
    const users = await import('../src/users.js');
    for (const name of ['toKey', 'getPasswordSalt', 'getPasswordHash']) {
        if (typeof users[name] !== 'function') {
            throw new SetupError(`upstream src/users.js no longer exports ${name}()`);
        }
    }
    // Same storage as upstream's initUserStorage(), without creating default-user.
    await storage.init({ dir: path.join(DATA_ROOT, '_storage'), ttl: false, expiredInterval: 0, writeQueue: false });

    if (isAlreadyApplied(readState(), input)) {
        const account = await storage.getItem(users.toKey(input.handle));
        log(account
            ? `admin '${input.handle}': variables unchanged since they were applied, nothing written`
            : `WARNING: admin '${input.handle}' no longer exists; change ST_ADMIN_PASSWORD and redeploy to recreate it`);
    } else {
        await applyAdmin(users, input);
        writeState(input);
    }
    await warnAboutOpenAdmins(users);
}

async function main() {
    if (seedConfig()) {
        log(`first boot: wrote ${CONFIG_FILE} from upstream defaults (accounts on, whitelist off, discreet login)`);
    }
    reportForcedSettings();
    await bootstrapAdmin();
}

try {
    await main();
    process.exit(0);
} catch (error) {
    const message = error instanceof SetupError ? error.message : (error?.stack ?? String(error));
    console.error(`[railway] ERROR: ${message}`);
    process.exit(1);
}
