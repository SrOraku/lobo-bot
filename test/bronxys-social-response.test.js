'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createClient } = require('../src/integrations/bronxys/client');
const { createHandler, definitions } = require('../src/integrations/bronxys/handler');

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(20)]);
const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]);

async function fixture(t, name, { items, mime = 'video/mp4', bytes = mp4, failAt } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-social-response-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const calls = [], sent = [];
  const client = createClient({
    getKey: () => 'FAKE-KEY', lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    request: async options => {
      calls.push(options);
      if (options.responseType === 'json') return { status: 200, headers: {}, data: { msg: items } };
      const index = Number(new URL(options.url).pathname.match(/\/(\d+)$/)?.[1] || 0);
      if (index === failAt) return { status: 401, headers: {}, data: Readable.from([]) };
      const content = Array.isArray(bytes) ? bytes[index] : bytes;
      const type = Array.isArray(mime) ? mime[index] : mime;
      return { status: 200, headers: { 'content-type': type }, data: Readable.from([content]) };
    }
  });
  const handler = createHandler(definitions.find(item => item.name === name), { client, tempRoot: directory });
  const result = await handler({ sendMessage: async (jid, payload, options) => sent.push({ jid, payload, options }) }, {
    jid: '120000@g.us', msg: { key: { id: 'social-fixture' } }, args: ['https://8.8.8.8/reel/fixture'], autoDownload: true
  });
  assert.deepEqual(await fs.readdir(directory), [], 'Each response must clean its temporary files');
  assert.ok(!JSON.stringify(sent).includes('FAKE-KEY'), 'The API credential must never appear in replies');
  return { calls, sent, result };
}

test('Instagram carousel preserves image/video order and uses downloaded MIME even when metadata differs', async t => {
  const f = await fixture(t, 'instagram', {
    items: [
      { url: 'https://cdn.example/0', type: 'video' },
      { url: 'https://cdn.example/1', type: 'mp4' },
      { url: 'https://cdn.example/2', mimetype: 'video/mp4' },
      { url: 'https://cdn.example/3' },
    ],
    mime: ['video/mp4', 'image/jpeg', 'video/mp4', 'video/mp4'], bytes: [mp4, jpeg, mp4, mp4],
  });
  assert.equal(f.calls.length, 5);
  assert.deepEqual(f.result, { ok: true, mediaCount: 4 });
  assert.deepEqual(f.sent.map(item => item.payload.mimetype), ['video/mp4', 'image/jpeg', 'video/mp4', 'video/mp4']);
  assert.deepEqual(f.sent.map(item => Boolean(item.payload.video)), [true, false, true, true]);
  assert.deepEqual(f.sent[1].payload.image, jpeg);
  assert.ok(f.sent.every(item => item.jid === '120000@g.us' && item.options.quoted.key.id === 'social-fixture'));
});

test('TikTok photo response is delivered as an image instead of falsely labelled MP4', async t => {
  const f = await fixture(t, 'tiktok_video', { mime: 'image/jpeg', bytes: jpeg });
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.sent[0].payload.image, jpeg);
  assert.equal(f.sent[0].payload.video, undefined);
  assert.equal(f.sent[0].payload.mimetype, 'image/jpeg');
});

for (const [name, mime, bytes, property, expected] of [
  ['Kwai MP4 without content-type', '', mp4, 'video', 'video/mp4'],
  ['Kwai JPEG with generic content-type', 'application/octet-stream', jpeg, 'image', 'image/jpeg'],
]) test(name, async t => {
  const f = await fixture(t, 'kwai', { mime, bytes });
  assert.deepEqual(f.sent[0].payload[property], bytes);
  assert.equal(f.sent[0].payload.mimetype, expected);
});

test('unknown binary payload and HTML errors never get sent as a fake MP4', async t => {
  for (const mime of ['application/octet-stream', 'text/html']) {
    const f = await fixture(t, 'tiktok_video', { mime, bytes: Buffer.from('<html>provider error</html>') });
    assert.equal(f.sent.length, 1);
    assert.equal(typeof f.sent[0].payload.text, 'string');
    assert.equal(f.sent[0].payload.video, undefined);
    assert.equal(f.sent[0].payload.image, undefined);
    assert.deepEqual(f.result, { ok: false, mediaCount: 0, code: 'BRONXYS_MEDIA' });
  }
});

test('Instagram keeps its five-item limit for carousel responses', async t => {
  const f = await fixture(t, 'instagram', {
    items: Array.from({ length: 8 }, (_, index) => ({ url: `https://cdn.example/${index}`, type: 'video' }))
  });
  assert.equal(f.sent.length, 5);
  assert.equal(f.calls.length, 6);
});

test('partially delivered carousel reports the exact media count when a later item fails', async t => {
  const f = await fixture(t, 'instagram', {
    items: [{ url: 'https://cdn.example/0', type: 'mp4' }, { url: 'https://cdn.example/1', type: 'mp4' }], failAt: 1
  });
  assert.deepEqual(f.result, { ok: false, mediaCount: 1, code: 'BRONXYS_AUTH' });
  assert.equal(f.sent.filter(item => item.payload.video).length, 1);
});

test('automatic video bypasses metadata search and sends one file without an empty information panel', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-social-metadata-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let params;
  const sent = [];
  const client = {
    configured: () => true,
    endpoint: (_endpoint, value) => { params = value; return 'https://cdn.example/fixture'; },
    download: async (_url, destination) => { await fs.writeFile(destination, mp4); return 'video/mp4'; }
  };
  const handler = createHandler(definitions.find(item => item.name === 'play_video'), {
    client, tempRoot: directory, metadata: async () => assert.fail('Automatic download must not perform a second search')
  });
  const result = await handler({ sendMessage: async (_jid, payload) => sent.push(payload) }, {
    jid: '120000@g.us', msg: {}, args: ['fixture'], autoDownload: true
  });
  assert.deepEqual(result, { ok: true, mediaCount: 1 });
  assert.equal(params.nome_url, 'fixture');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].video, mp4);
});

test('queue skip returns an explicit result without calling the provider', async () => {
  const handler = require('../src/integrations/bronxys/handler').queuedHandler(definitions.find(item => item.name === 'kwai'), {
    shouldRun: () => false, client: { configured: () => assert.fail('Skipped task must not reach the provider') }
  });
  assert.deepEqual(await handler({ sendMessage: async () => assert.fail('Skipped task must stay silent') }, { jid: 'skip@g.us', msg: {}, args: ['fixture'] }), {
    ok: false, code: 'BRONXYS_SKIPPED', mediaCount: 0
  });
});
