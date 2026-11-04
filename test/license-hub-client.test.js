'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CLIENT_PATH = require.resolve('../src/licensing/licenseClient');

function loadFreshClient() {
  delete require.cache[CLIENT_PATH];
  return require('../src/licensing/licenseClient');
}

test('license client requires HTTPS when configured', () => {
  const oldUrl = process.env.LOBO_API_URL;
  const oldKey = process.env.LOBO_LICENSE_KEY;
  try {
    process.env.LOBO_API_URL = 'http://example.com/api';
    process.env.LOBO_LICENSE_KEY = 'LOBO-TEST';
    const client = loadFreshClient();
    assert.throws(() => client.validateConfig(), { code: 'LOBO_LICENSE_HTTPS_REQUIRED' });
  } finally {
    if (oldUrl === undefined) delete process.env.LOBO_API_URL; else process.env.LOBO_API_URL = oldUrl;
    if (oldKey === undefined) delete process.env.LOBO_LICENSE_KEY; else process.env.LOBO_LICENSE_KEY = oldKey;
    delete require.cache[CLIENT_PATH];
  }
});

test('licensing remains opt-in when environment variables are absent', () => {
  const oldUrl = process.env.LOBO_API_URL;
  const oldKey = process.env.LOBO_LICENSE_KEY;
  try {
    delete process.env.LOBO_API_URL;
    delete process.env.LOBO_LICENSE_KEY;
    const client = loadFreshClient();
    assert.equal(client.configured(), false);
    assert.deepEqual(client.validateConfig(), false);
  } finally {
    if (oldUrl !== undefined) process.env.LOBO_API_URL = oldUrl;
    if (oldKey !== undefined) process.env.LOBO_LICENSE_KEY = oldKey;
    delete require.cache[CLIENT_PATH];
  }
});
