'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sharp = require('sharp');
const { createBackgroundRemover, workerFailure } = require('../src/media/background');
const { createLocalMedia } = require('../src/commands/local-media');

test('worker errors expose only allowlisted codes/stages, never stderr paths or secrets', () => {
  const error = workerFailure({ code: 1, stderr: 'token=private\n/path/to/credentials\nBACKGROUND_STAGE:MODEL\nBACKGROUND_ERROR:BACKGROUND_ASSET_MISSING\n' });
  assert.equal(error.code, 'BACKGROUND_ASSET_MISSING'); assert.equal(error.stage, 'MODEL');
  assert.ok(!JSON.stringify(error).includes('private')); assert.ok(!error.message.includes('credentials'));
  const unknown = workerFailure({ stderr: 'BACKGROUND_ERROR:ARBITRARY_TOKEN\nsecret=private' });
  assert.equal(unknown.code, 'BACKGROUND_FAILED');
});

test('timeout and external termination remain distinct; SIGKILL alone does not assert lack of RAM', () => {
  assert.equal(workerFailure({ killed: true, signal: 'SIGKILL' }).code, 'BACKGROUND_TIMEOUT');
  assert.equal(workerFailure({ killed: false, signal: 'SIGKILL' }).code, 'BACKGROUND_TERMINATED');
  assert.equal(workerFailure({ code: 'ENOMEM' }).code, 'BACKGROUND_MEMORY');
  assert.equal(workerFailure({ signal: 'SIGILL' }).code, 'BACKGROUND_NATIVE_UNAVAILABLE');
  assert.equal(workerFailure({ code: 78 }).code, 'BACKGROUND_DEPENDENCY_MISSING');
});

test('worker uses isolated file arguments and a kill deadline without any shell command', async () => {
  let call;
  const remove = createBackgroundRemover({ run: async (...args) => { call = args; }, timeout: 3000 });
  await remove('/tmp/path with spaces/input', '/tmp/output');
  assert.equal(call[0], process.execPath); assert.ok(call[1][0].endsWith('remove-background-worker.js'));
  assert.deepEqual(call[1].slice(1), ['/tmp/path with spaces/input', '/tmp/output']);
  assert.equal(call[2].timeout, 3000); assert.equal(call[2].killSignal, 'SIGKILL'); assert.ok(!call[2].shell);
});

test('runner preserves the worker machine code and discards raw child output', async () => {
  const remove = createBackgroundRemover({ run: async () => { throw { code: 1, stdout: 'private', stderr: 'BACKGROUND_STAGE:ASSETS\nBACKGROUND_ERROR:BACKGROUND_PERMISSION\nprivate' }; } });
  await assert.rejects(remove('input', 'output'), error => error.code === 'BACKGROUND_PERMISSION' && error.stage === 'ASSETS' && !error.message.includes('private'));
});

const context = () => ({ jid: '120000@g.us', args: [], msg: { key: { id: 'failure' }, message: { imageMessage: { caption: '!sfundo' } } } });

test('download, image decoding and model errors produce distinct codes without success reactions', async () => {
  const photo = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'red' } }).png().toBuffer();
  for (const scenario of [
    { code: 'MEDIA_DOWNLOAD_FAILED', read: async () => { throw Error('private media URL'); } },
    { code: 'MEDIA_INVALID_IMAGE', read: async () => Buffer.from('invalid') },
    { code: 'BACKGROUND_ASSET_MISSING', read: async () => photo, remove: async () => { throw Object.assign(Error('private path'), { code: 'BACKGROUND_ASSET_MISSING', stage: 'ASSETS' }); } },
    { code: 'BACKGROUND_TERMINATED', read: async () => photo, remove: async () => { throw Object.assign(Error('private native diagnostics'), { code: 'BACKGROUND_TERMINATED' }); } },
  ]) {
    const sent = [], logs = [];
    const result = await createLocalMedia({ ...scenario, log: entry => logs.push(entry) })('sfundo')({ sendMessage: async (_, value) => sent.push(value) }, context());
    assert.equal(result.ok, false); assert.equal(logs[0].errorCode, scenario.code);
    assert.ok(sent.some(value => value.text?.includes(scenario.code))); assert.ok(!sent.some(value => value.react?.text === '✅'));
    assert.equal(sent.findLast(value => value.react)?.react.text, '❌');
    assert.ok(!JSON.stringify({ sent, logs }).includes('private'));
  }
});

test('grayscale photos are normalized to RGBA before segmentation', async () => {
  const grayscale = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#888888' } }).greyscale().png().toBuffer();
  let channels;
  const sent = [];
  const result = await createLocalMedia({ read: async () => grayscale, remove: async (input, output) => { channels = (await sharp(input).metadata()).channels; fs.copyFileSync(input, output); } })('sfundo')({ sendMessage: async (_, value) => sent.push(value) }, context());
  assert.equal(channels, 4); assert.equal(result.ok, true); assert.ok(sent.some(value => value.image));
});
