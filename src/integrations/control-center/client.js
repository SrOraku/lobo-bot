'use strict';

const axios = require('axios');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = path.join(__dirname, '../../../data/control-center.json');

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function positiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function createEmptyState() {
  return {
    clientInstanceId: crypto.randomUUID(),
    installations: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return createEmptyState();
    if (!parsed.clientInstanceId) parsed.clientInstanceId = crypto.randomUUID();
    if (!parsed.installations || typeof parsed.installations !== 'object') parsed.installations = {};
    return parsed;
  } catch {
    return createEmptyState();
  }
}

function persistState(state) {
  const dir = path.dirname(STATE_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch { /* best effort */ }
  fs.renameSync(tmp, STATE_FILE);
  try { fs.chmodSync(STATE_FILE, 0o600); } catch { /* best effort */ }
}

function unwrap(response) {
  const payload = response?.data;
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'data')) return payload.data;
  return payload;
}

function authorizationFrom(data) {
  const auth = data?.authorization || data?.auth || data?.access || {};
  const status = String(auth.status || data?.status || '').toLowerCase();
  const explicit = auth.allowed ?? data?.allowed ?? data?.authorized;
  const allowed = typeof explicit === 'boolean'
    ? explicit
    : ['active', 'authorized', 'online', 'valid', 'allowed'].includes(status);
  return {
    allowed,
    status: status || (allowed ? 'authorized' : 'denied'),
    reason: auth.reason || data?.reason || null,
    license: data?.license || auth.license || null,
    permissions: auth.permissions || data?.permissions || [],
  };
}

function createControlCenterClient({ http = axios, now = () => Date.now() } = {}) {
  const baseUrl = normalizeBaseUrl(process.env.CONTROL_CENTER_URL);
  const enrollmentToken = String(process.env.CONTROL_CENTER_ENROLLMENT_TOKEN || '').trim();
  const timeout = positiveInt(process.env.CONTROL_CENTER_TIMEOUT_MS, 8000, 1000, 30000);
  const state = loadState();

  function enabled() {
    return Boolean(baseUrl && enrollmentToken);
  }

  function entry(serverId) {
    return state.installations[String(serverId)] || null;
  }

  function saveEntry(serverId, patch) {
    state.installations[String(serverId)] = {
      ...(entry(serverId) || {}),
      ...patch,
      serverId: String(serverId),
      updatedAt: new Date(now()).toISOString(),
    };
    persistState(state);
    return state.installations[String(serverId)];
  }

  async function request(method, endpoint, { token, data, params } = {}) {
    if (!baseUrl) throw Object.assign(new Error('CONTROL_CENTER_URL não configurada.'), { code: 'CONTROL_CENTER_DISABLED' });
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'lobo-bot/control-center',
      'X-Lobo-Client-Id': state.clientInstanceId,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const response = await http.request({
        method,
        url: `${baseUrl}${endpoint}`,
        headers,
        data,
        params,
        timeout,
        validateStatus: status => status >= 200 && status < 300,
      });
      return unwrap(response);
    } catch (error) {
      const status = error?.response?.status;
      const code = error?.code || (status ? `HTTP_${status}` : 'CONTROL_CENTER_REQUEST_FAILED');
      const safe = new Error(`Control Center indisponível (${code}).`);
      safe.code = code;
      safe.status = status || null;
      throw safe;
    }
  }

  async function registerServer(server) {
    if (!enabled()) return { disabled: true, authorization: { allowed: true, status: 'disabled' } };
    const current = entry(server.externalId);
    const data = await request('POST', '/api/installations/register', {
      token: enrollmentToken,
      data: {
        platform: 'whatsapp',
        server: {
          externalId: server.externalId,
          name: server.name || null,
          ownerExternalId: server.ownerExternalId || null,
          memberCount: Number.isInteger(server.memberCount) ? server.memberCount : null,
        },
        instance: {
          clientInstanceId: state.clientInstanceId,
          botVersion: server.botVersion,
          runtime: `node-${process.version}`,
          environment: process.env.NODE_ENV || 'production',
        },
        timestamp: new Date(now()).toISOString(),
      },
    });
    const installation = data?.installation || data || {};
    const credential = data?.credential || installation?.credential || {};
    const installationId = installation.id || installation.installationId || data?.installationId || current?.installationId || null;
    const installationToken = credential.token || credential.secret || data?.installationToken || current?.installationToken || null;
    const saved = saveEntry(server.externalId, {
      installationId,
      installationToken,
      name: server.name || current?.name || null,
      botVersion: server.botVersion,
      registeredAt: current?.registeredAt || new Date(now()).toISOString(),
    });
    return { data, entry: saved, authorization: authorizationFrom(data) };
  }

  async function validateServer(serverId, payload = {}) {
    const current = entry(serverId);
    if (!enabled()) return { disabled: true, authorization: { allowed: true, status: 'disabled' } };
    if (!current?.installationToken) return registerServer({ externalId: serverId, ...payload });
    const data = await request('POST', '/api/installations/validate', {
      token: current.installationToken,
      data: {
        installationId: current.installationId,
        serverId: String(serverId),
        botVersion: payload.botVersion || current.botVersion || null,
        timestamp: new Date(now()).toISOString(),
      },
    });
    saveEntry(serverId, { lastValidatedAt: new Date(now()).toISOString() });
    return { data, entry: entry(serverId), authorization: authorizationFrom(data) };
  }

  async function heartbeat(serverId, payload = {}) {
    const current = entry(serverId);
    if (!enabled()) return { disabled: true, authorization: { allowed: true, status: 'disabled' } };
    if (!current?.installationToken) return registerServer({ externalId: serverId, ...payload });
    const data = await request('POST', '/api/installations/heartbeat', {
      token: current.installationToken,
      data: {
        installationId: current.installationId,
        serverId: String(serverId),
        botVersion: payload.botVersion || current.botVersion || null,
        timestamp: new Date(now()).toISOString(),
        status: 'online',
      },
    });
    saveEntry(serverId, {
      lastHeartbeatAt: new Date(now()).toISOString(),
      botVersion: payload.botVersion || current.botVersion || null,
    });
    return { data, entry: entry(serverId), authorization: authorizationFrom(data) };
  }

  async function sendEvent(serverId, event) {
    const current = entry(serverId);
    if (!enabled() || !current?.installationToken) return false;
    try {
      await request('POST', '/api/installations/events', {
        token: current.installationToken,
        data: {
          installationId: current.installationId,
          serverId: String(serverId),
          type: event.type,
          name: event.name || null,
          result: event.result || null,
          timestamp: new Date(now()).toISOString(),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  function removeCredential(serverId) {
    const current = entry(serverId);
    if (!current) return false;
    state.installations[String(serverId)] = {
      ...current,
      installationToken: null,
      installationId: null,
      updatedAt: new Date(now()).toISOString(),
    };
    persistState(state);
    return true;
  }

  return {
    enabled,
    entry,
    registerServer,
    validateServer,
    heartbeat,
    sendEvent,
    removeCredential,
    clientInstanceId: state.clientInstanceId,
    baseUrl,
  };
}

module.exports = {
  createControlCenterClient,
  normalizeBaseUrl,
  authorizationFrom,
};
