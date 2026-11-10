'use strict';

const { createLicenseClient } = require('./license-client');
const { createLicenseCache } = require('./license-cache');

async function validateInstallation(options = {}) {
  const client = createLicenseClient(options);
  if (!client.enabled) return { enabled: false, valid: true, status: 'disabled' };

  const cache = createLicenseCache(options);
  const result = await client.validate();
  if (result.valid) {
    cache.write(result);
    return result;
  }

  // Somente erros transitórios podem recorrer ao cache. Revogação, expiração,
  // chave inválida ou configuração incorreta nunca são mascaradas pelo cache.
  if (['timeout', 'network_error', 'http_error'].includes(result.status)) {
    const cached = cache.read();
    if (cached) return { ...cached, warning: 'Validação remota indisponível; cache temporário utilizado.' };
  }
  return result;
}

module.exports = { validateInstallation };
