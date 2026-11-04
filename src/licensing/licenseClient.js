'use strict';

const https = require('node:https');
const http = require('node:http');

const API_URL = process.env.LOBO_API_URL || '';
const LICENSE_KEY = (process.env.LOBO_LICENSE_KEY || '').trim();
const TIMEOUT_MS = 8000;
const GRACE_MS = 24 * 60 * 60 * 1000;

function configured() { return Boolean(API_URL || LICENSE_KEY); }
function validateConfig() {
  if (!configured()) return false;
  if (!API_URL || !LICENSE_KEY) throw Object.assign(new Error('LOBO_LICENSE_CONFIG_INCOMPLETE'), { code: 'LOBO_LICENSE_CONFIG_INCOMPLETE' });
  let url;
  try { url = new URL(API_URL); } catch { throw Object.assign(new Error('LOBO_LICENSE_URL_INVALID'), { code: 'LOBO_LICENSE_URL_INVALID' }); }
  if (url.protocol !== 'https:') throw Object.assign(new Error('LOBO_LICENSE_HTTPS_REQUIRED'), { code: 'LOBO_LICENSE_HTTPS_REQUIRED' });
  return true;
}

async function request(action, payload = {}) {
  if (!validateConfig()) return { disabled: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-lobo-key': LICENSE_KEY },
      body: JSON.stringify({ action, ...payload }),
    });
    let body;
    try { body = await response.json(); } catch {
      throw Object.assign(new Error('LOBO_LICENSE_INVALID_RESPONSE'), { code: 'LOBO_LICENSE_INVALID_RESPONSE', communication: response.status >= 500 });
    }
    if (response.status >= 500) throw Object.assign(new Error('LOBO_LICENSE_SERVER_ERROR'), { code: 'LOBO_LICENSE_SERVER_ERROR', communication: true });
    if (!response.ok) throw Object.assign(new Error('LOBO_LICENSE_REQUEST_REJECTED'), { code: 'LOBO_LICENSE_REQUEST_REJECTED', communication: false });
    return body;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TypeError' || error.code === 'ECONNRESET') {
      throw Object.assign(new Error('LOBO_LICENSE_NETWORK_ERROR'), { code: 'LOBO_LICENSE_NETWORK_ERROR', communication: true });
    }
    throw error;
  } finally { clearTimeout(timer); }
}

module.exports = { request, configured, validateConfig, GRACE_MS };
