'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const client = require('./licenseClient');

const DATA_DIR = path.resolve(__dirname, '../../data');
const INSTALL_FILE = path.join(DATA_DIR, 'lobo-license-installation.json');
const STATE_FILE = path.join(DATA_DIR, 'lobo-license-state.json');
const HEARTBEAT_MS = 15 * 60 * 1000;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function writeJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  try { fs.chmodSync(temp, 0o600); } catch {}
  fs.renameSync(temp, file);
}
function installationId() {
  const saved = readJson(INSTALL_FILE);
  if (typeof saved.id === 'string' && /^[a-f0-9-]{20,64}$/i.test(saved.id)) return saved.id;
  const id = randomUUID().replace(/-/g, '');
  writeJson(INSTALL_FILE, { id });
  return id;
}
function allowed(result) { return result && result.ok === true && result.authorized === true; }
function deny(result) {
  const reason = String(result?.motivo || result?.error || 'licenca_nao_autorizada').slice(0, 80);
  throw Object.assign(new Error('LOBO_LICENSE_DENIED'), { code: 'LOBO_LICENSE_DENIED', reason });
}
function recordSuccess() { writeJson(STATE_FILE, { lastAuthorizedAt: Date.now() }); }
function useGrace(error) {
  if (!error.communication) throw error;
  const last = Number(readJson(STATE_FILE).lastAuthorizedAt || 0);
  if (!last || Date.now() - last > client.GRACE_MS) {
    throw Object.assign(new Error('LOBO_LICENSE_GRACE_EXPIRED'), { code: 'LOBO_LICENSE_GRACE_EXPIRED' });
  }
  return true;
}

async function authorizeStartup() {
  if (!client.configured()) return { enabled: false };
  client.validateConfig();
  const id = installationId();
  const meta = { installation_id: id, hostname: os.hostname().slice(0, 120), version: require('../../package.json').version };
  try {
    const registered = await client.request('register_installation', meta);
    if (!allowed(registered)) deny(registered);
    const validated = await client.request('validate', { installation_id: id });
    if (!allowed(validated)) deny(validated);
    recordSuccess();
    return { enabled: true, installationId: id };
  } catch (error) {
    useGrace(error);
    return { enabled: true, installationId: id, grace: true };
  }
}

function startHeartbeat({ onDenied = () => process.exit(1), log = () => {} } = {}) {
  if (!client.configured()) return () => {};
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const id = installationId();
      const result = await client.request('heartbeat', { installation_id: id });
      if (!allowed(result)) {
        log('LOBO_LICENSE_DENIED');
        onDenied(result?.motivo || 'licenca_nao_autorizada');
        return;
      }
      recordSuccess();
    } catch (error) {
      try { useGrace(error); }
      catch (failure) { log(failure.code || 'LOBO_LICENSE_ERROR'); onDenied(failure.code); }
    } finally { running = false; }
  }, HEARTBEAT_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { authorizeStartup, startHeartbeat, installationId };
