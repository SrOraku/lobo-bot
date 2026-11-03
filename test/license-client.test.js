'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLicenseClient } = require('../src/integrations/license/license-client');

test('licenciamento desativado preserva o comportamento existente', async () => {
  const client = createLicenseClient({ enabled: false });
  assert.deepEqual(await client.validate(), { enabled: false, valid: true, status: 'disabled' });
});

test('configuração ausente falha de forma explícita', async () => {
  const client = createLicenseClient({ enabled: true, apiUrl: '', instanceId: '', licenseKey: '' });
  const result = await client.validate();
  assert.equal(result.valid, false);
  assert.equal(result.status, 'configuration_error');
});

test('resposta válida exige nonce correspondente e estado ativo/trial', async () => {
  let body;
  const client = createLicenseClient({
    enabled: true, apiUrl: 'https://license.example', instanceId: 'instance-1', licenseKey: 'secret-key',
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ valid: true, status: 'active', nonce: body.nonce, expiresAt: null, cacheTtlSeconds: 300 }) };
    },
  });
  const result = await client.validate();
  assert.equal(result.valid, true);
  assert.equal(result.status, 'active');
  assert.ok(result.checkedAt);
});

test('recusa resposta sem nonce correspondente', async () => {
  const client = createLicenseClient({
    enabled: true, apiUrl: 'https://license.example', instanceId: 'instance-1', licenseKey: 'secret-key',
    fetch: async () => ({ ok: true, json: async () => ({ valid: true, status: 'active', nonce: 'wrong' }) }),
  });
  const result = await client.validate();
  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid_response');
});

test('timeout de rede resulta em erro transitório sem liberar licença', async () => {
  const client = createLicenseClient({
    enabled: true, apiUrl: 'https://license.example', instanceId: 'instance-1', licenseKey: 'secret-key', timeoutMs: 1000,
    fetch: async () => { const error = new Error('offline'); error.name = 'AbortError'; throw error; },
  });
  const result = await client.validate();
  assert.equal(result.valid, false);
  assert.equal(result.status, 'timeout');
});
