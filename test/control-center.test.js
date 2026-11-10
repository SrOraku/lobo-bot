'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizationFrom, normalizeBaseUrl } = require('../src/integrations/control-center/client');
const { createControlCenterService } = require('../src/integrations/control-center');

test('control center normalizes URL and authorization responses', () => {
  assert.equal(normalizeBaseUrl('https://example.test///'), 'https://example.test');
  assert.deepEqual(
    authorizationFrom({ authorization: { allowed: false, status: 'blocked', reason: 'manual' } }),
    { allowed: false, status: 'blocked', reason: 'manual', license: null, permissions: [] },
  );
  assert.equal(authorizationFrom({ status: 'authorized' }).allowed, true);
});

test('disabled control center never blocks a group', async () => {
  const client = {
    enabled: () => false,
    clientInstanceId: 'test',
  };
  const service = createControlCenterService({ client });
  const result = await service.authorizeGroup({}, '120363000000000000@g.us');
  assert.equal(result.allowed, true);
  assert.equal(result.status, 'disabled');
});

test('central denial blocks protected group access and is cached', async () => {
  let calls = 0;
  const client = {
    enabled: () => true,
    clientInstanceId: 'test',
    entry: () => ({ installationId: 'installation-1', installationToken: 'local-secret' }),
    validateServer: async () => {
      calls += 1;
      return { authorization: { allowed: false, status: 'blocked', reason: 'admin_block' } };
    },
    registerServer: async () => { throw new Error('unexpected register'); },
    heartbeat: async () => ({ authorization: { allowed: false, status: 'blocked' } }),
    sendEvent: async () => true,
  };
  const service = createControlCenterService({ client, now: () => 1000 });
  const first = await service.authorizeGroup({}, '120363000000000001@g.us');
  const second = await service.authorizeGroup({}, '120363000000000001@g.us');
  assert.equal(first.allowed, false);
  assert.equal(first.status, 'blocked');
  assert.equal(second.allowed, false);
  assert.equal(calls, 1);
});
