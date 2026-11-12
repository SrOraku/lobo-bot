'use strict';
// Cliente do LOBO-BOT LICENSE (painel de licenças no Base44).
//
// O endereço do painel é fixo no código. LOBO_API_URL continua aceito por
// compatibilidade, mas só quando aponta para o próprio painel oficial em
// HTTPS: uma instalação não pode trocar o servidor por um que sempre
// responda "autorizado".

const OFFICIAL_URL = 'https://lobo-license-hub.base44.app/functions/loboApi';
const OFFICIAL_HOST = new URL(OFFICIAL_URL).host;
const TIMEOUT_MS = 8000;
const GRACE_MS = 24 * 60 * 60 * 1000;

function failure(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

// Motivo devolvido pelo painel, reduzido a um identificador seguro para o console.
function cleanReason(value) {
  const text = String(value ?? '').toLowerCase().replace(/[^a-z0-9_ -]/g, '').trim().slice(0, 80);
  return text || undefined;
}

function createClient({ env = process.env, fetchImpl = (...args) => fetch(...args), timeoutMs = TIMEOUT_MS } = {}) {
  const key = () => String(env.LOBO_LICENSE_KEY || '').trim();
  const configured = () => Boolean(key());

  function endpoint() {
    const custom = String(env.LOBO_API_URL || '').trim();
    if (!custom) return OFFICIAL_URL;
    let url;
    try { url = new URL(custom); } catch { throw failure('LOBO_LICENSE_URL_INVALID'); }
    if (url.protocol !== 'https:') throw failure('LOBO_LICENSE_HTTPS_REQUIRED');
    if (url.host !== OFFICIAL_HOST) throw failure('LOBO_LICENSE_URL_NOT_OFFICIAL');
    return url.href;
  }

  function validateConfig() {
    if (!configured()) return false;
    endpoint();
    return true;
  }

  async function request(action, payload = {}) {
    if (!validateConfig()) return { disabled: true };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint(), {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-lobo-key': key() },
        body: JSON.stringify({ action, ...payload }),
      });
      let body;
      try { body = await response.json(); } catch {
        throw failure('LOBO_LICENSE_INVALID_RESPONSE', { communication: response.status >= 500 });
      }
      // Indisponibilidade ou limite de requisições do painel não é negação de licença.
      if (response.status >= 500 || response.status === 408 || response.status === 429)
        throw failure('LOBO_LICENSE_SERVER_ERROR', { communication: true });
      if (!response.ok) {
        // O painel responde 4xx com { authorized: false, motivo } para chave
        // inválida, expirada ou suspensa: é uma negação explícita, com motivo.
        const reason = cleanReason(body?.motivo || body?.error);
        throw failure(body?.authorized === false ? 'LOBO_LICENSE_DENIED' : 'LOBO_LICENSE_REQUEST_REJECTED', { communication: false, reason });
      }
      return body;
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TypeError' || error.code === 'ECONNRESET') {
        throw failure('LOBO_LICENSE_NETWORK_ERROR', { communication: true });
      }
      throw error;
    } finally { clearTimeout(timer); }
  }

  return { request, configured, validateConfig, endpoint, GRACE_MS };
}

module.exports = { ...createClient(), createClient, cleanReason, OFFICIAL_URL, OFFICIAL_HOST, GRACE_MS };
