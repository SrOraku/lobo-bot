'use strict';

const { createControlCenterClient } = require('./client');

function intEnv(name, fallback, min, max) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function currentVersion() {
  try { return require('../../../package.json').version || 'unknown'; }
  catch { return 'unknown'; }
}

function createControlCenterService({ client = createControlCenterClient(), now = () => Date.now() } = {}) {
  const authorizations = new Map();
  const knownGroups = new Set();
  const notices = new Map();
  let sock = null;
  let heartbeatTimer = null;
  let starting = null;

  const validateTtl = intEnv('CONTROL_CENTER_VALIDATE_TTL_MS', 60_000, 5_000, 15 * 60_000);
  const heartbeatMs = intEnv('CONTROL_CENTER_HEARTBEAT_MS', 60_000, 15_000, 15 * 60_000);
  const graceMs = intEnv('CONTROL_CENTER_GRACE_MS', 5 * 60_000, 0, 60 * 60_000);
  const failMode = String(process.env.CONTROL_CENTER_FAIL_MODE || 'closed').toLowerCase() === 'open' ? 'open' : 'closed';
  const botVersion = currentVersion();

  function enabled() {
    return client.enabled();
  }

  function remember(serverId, authorization, source) {
    const key = String(serverId);
    knownGroups.add(key);
    const normalized = {
      allowed: Boolean(authorization?.allowed),
      status: authorization?.status || (authorization?.allowed ? 'authorized' : 'denied'),
      reason: authorization?.reason || null,
      license: authorization?.license || null,
      permissions: Array.isArray(authorization?.permissions) ? authorization.permissions : [],
      checkedAt: now(),
      source,
    };
    authorizations.set(key, normalized);
    return normalized;
  }

  async function metadataFor(activeSock, jid) {
    let metadata = null;
    try { metadata = await activeSock?.groupMetadata?.(jid); } catch { /* group may have disappeared */ }
    return {
      externalId: String(jid),
      name: metadata?.subject || null,
      ownerExternalId: metadata?.owner || null,
      memberCount: Array.isArray(metadata?.participants) ? metadata.participants.length : null,
      botVersion,
    };
  }

  async function register(activeSock, jid) {
    const server = await metadataFor(activeSock, jid);
    const result = await client.registerServer(server);
    return remember(jid, result.authorization, 'register');
  }

  async function validate(activeSock, jid, { force = false } = {}) {
    if (!enabled()) return { allowed: true, status: 'disabled', source: 'disabled', checkedAt: now() };
    const key = String(jid);
    knownGroups.add(key);
    const cached = authorizations.get(key);
    if (!force && cached && now() - cached.checkedAt < validateTtl) return cached;
    try {
      let result;
      if (!client.entry(key)?.installationToken) {
        result = await client.registerServer(await metadataFor(activeSock, key));
      } else {
        result = await client.validateServer(key, { botVersion });
      }
      return remember(key, result.authorization, 'validate');
    } catch (error) {
      const stale = authorizations.get(key);
      if (stale?.allowed && now() - stale.checkedAt <= graceMs) return { ...stale, source: 'grace' };
      if (failMode === 'open') return { allowed: true, status: 'control-center-unavailable', reason: error.code, source: 'fail-open', checkedAt: now() };
      return { allowed: false, status: 'control-center-unavailable', reason: error.code, source: 'fail-closed', checkedAt: now() };
    }
  }

  async function authorizeGroup(activeSock, jid) {
    if (!jid?.endsWith('@g.us')) return { allowed: true, status: 'not-group' };
    knownGroups.add(String(jid));
    return validate(activeSock || sock, jid);
  }

  async function heartbeatOne(jid) {
    if (!enabled()) return null;
    try {
      if (!client.entry(jid)?.installationToken) await register(sock, jid);
      const result = await client.heartbeat(jid, { botVersion });
      return remember(jid, result.authorization, 'heartbeat');
    } catch {
      return null;
    }
  }

  async function heartbeatAll() {
    if (!enabled()) return;
    for (const jid of [...knownGroups]) await heartbeatOne(jid);
  }

  async function discoverGroups(activeSock) {
    if (!enabled() || !activeSock) return;
    try {
      const groups = await activeSock.groupFetchAllParticipating?.();
      for (const [jid, meta] of Object.entries(groups || {})) {
        knownGroups.add(jid);
        try {
          const hadCredential = Boolean(client.entry(jid)?.installationToken);
          const server = {
            externalId: jid,
            name: meta?.subject || null,
            ownerExternalId: meta?.owner || null,
            memberCount: Array.isArray(meta?.participants) ? meta.participants.length : null,
            botVersion,
          };
          const result = hadCredential
            ? await client.validateServer(jid, { botVersion })
            : await client.registerServer(server);
          remember(jid, result.authorization, hadCredential ? 'startup-validate' : 'startup-register');
          await client.heartbeat(jid, { botVersion }).then(value => remember(jid, value.authorization, 'startup-heartbeat')).catch(() => {});
        } catch { /* one invalid group must not abort remaining registrations */ }
      }
    } catch { /* startup remains resilient if WhatsApp cannot list groups */ }
  }

  async function start(activeSock) {
    sock = activeSock;
    if (!enabled()) return { enabled: false };
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (!starting) starting = discoverGroups(activeSock).finally(() => { starting = null; });
    heartbeatTimer = setInterval(() => heartbeatAll().catch(() => {}), heartbeatMs);
    heartbeatTimer.unref?.();
    return { enabled: true, clientInstanceId: client.clientInstanceId };
  }

  function stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    sock = null;
  }

  async function notifyDenied(activeSock, jid, authorization, quoted) {
    const key = String(jid);
    const previous = notices.get(key) || 0;
    if (now() - previous < 5 * 60_000) return false;
    notices.set(key, now());
    const status = authorization?.status || 'não autorizado';
    const text = [
      '🌹🐺 LOBO BOT CONTROL CENTER',
      '',
      '⛔ Esta instalação não está autorizada a usar as funções protegidas do bot.',
      `Status: ${status}`,
      'A autorização é controlada pela central administrativa.',
    ].join('\n');
    await activeSock?.sendMessage?.(jid, { text }, quoted ? { quoted } : undefined).catch(() => {});
    return true;
  }

  function recordCommand(jid, command, result = 'success') {
    if (!enabled() || !jid?.endsWith('@g.us')) return;
    knownGroups.add(String(jid));
    client.sendEvent(jid, { type: 'command', name: String(command || '').slice(0, 80), result }).catch(() => {});
  }

  return {
    enabled,
    start,
    stop,
    authorizeGroup,
    notifyDenied,
    heartbeatAll,
    recordCommand,
    forceValidate: (jid) => validate(sock, jid, { force: true }),
    client,
  };
}

let singleton;
function controlCenter() {
  return singleton || (singleton = createControlCenterService());
}

module.exports = { createControlCenterService, controlCenter };
