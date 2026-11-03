'use strict';

/**
 * Cliente HTTP do LOBO-BOT LICENSE HUB.
 * Falha fechada: licença desconhecida/expirada/revogada impede ativação do bot
 * quando LICENSE_ENABLED=true. Falhas transitórias podem usar cache ainda válido.
 */
const crypto = require('node:crypto');

function createLicenseClient(options = {}) {
  const enabled = options.enabled ?? process.env.LICENSE_ENABLED === 'true';
  const baseUrl = (options.apiUrl ?? process.env.LICENSE_API_URL ?? '').replace(/\/+$/, '');
  const instanceId = options.instanceId ?? process.env.LICENSE_INSTANCE_ID ?? '';
  const licenseKey = options.licenseKey ?? process.env.LICENSE_KEY ?? '';
  const timeoutMs = Number(options.timeoutMs ?? process.env.LICENSE_TIMEOUT_MS ?? 5000);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  function configError() {
    if (!baseUrl) return 'LICENSE_API_URL não configurada.';
    try { new URL(baseUrl); } catch { return 'LICENSE_API_URL inválida.'; }
    if (!instanceId) return 'LICENSE_INSTANCE_ID não configurado.';
    if (!licenseKey) return 'LICENSE_KEY não configurada.';
    if (typeof fetchImpl !== 'function') return 'Fetch não está disponível neste Node.js.';
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) return 'LICENSE_TIMEOUT_MS deve ficar entre 1000 e 30000.';
    return null;
  }

  async function validate() {
    if (!enabled) return { enabled: false, valid: true, status: 'disabled' };
    const invalidConfig = configError();
    if (invalidConfig) return { enabled: true, valid: false, status: 'configuration_error', message: invalidConfig };

    const nonce = crypto.randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(baseUrl + '/v1/licenses/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ instanceId, licenseKey, nonce }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { enabled: true, valid: false, status: payload.status || 'http_error', message: payload.message || 'A API de licenças recusou a validação.', httpStatus: response.status };
      }
      if (payload.nonce !== nonce || payload.valid !== true || !['active', 'trial'].includes(payload.status)) {
        return { enabled: true, valid: false, status: payload.status || 'invalid_response', message: 'Resposta de validação inválida.' };
      }
      return {
        enabled: true, valid: true, status: payload.status,
        expiresAt: payload.expiresAt || null,
        checkedAt: new Date().toISOString(),
        cacheTtlSeconds: Math.max(0, Math.min(Number(payload.cacheTtlSeconds) || 300, 3600)),
      };
    } catch (error) {
      return { enabled: true, valid: false, status: error.name === 'AbortError' ? 'timeout' : 'network_error', message: 'Não foi possível alcançar a API de licenças.' };
    } finally {
      clearTimeout(timer);
    }
  }

  return { enabled, validate };
}

module.exports = { createLicenseClient };
