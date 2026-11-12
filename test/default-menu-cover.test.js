'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { sendMenu } = require('../src/menus/media');

test('default animation accompanies the main menu; submenus and removal remain in text', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-default-cover-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const defaultFile = path.join(directory, 'cover.mp4');
  await fs.writeFile(defaultFile, 'animation');
  const messages = [], sock = { sendMessage: async (jid, payload) => messages.push(payload) };
  const ctx = { jid: '123@g.us', args: [] };
  const options = { getMedia: () => null, useDefault: () => true, defaultFile, directory };

  await sendMenu(sock, ctx, 'main', options);
  assert.deepEqual(messages[0], { video: Buffer.from('animation'), gifPlayback: true, mimetype: 'video/mp4', caption: 'main' });
  await sendMenu(sock, { ...ctx, args: ['jogos'] }, 'games', options);
  assert.deepEqual(messages[1], { text: 'games' });
  await sendMenu(sock, ctx, 'removed', { ...options, useDefault: () => false });
  assert.deepEqual(messages[2], { text: 'removed' });
  await sendMenu(sock, ctx, 'missing', { ...options, defaultFile: path.join(directory, 'missing.mp4') });
  assert.deepEqual(messages[3], { text: 'missing' });

  await fs.writeFile(path.join(directory, 'abc.jpg'), 'custom cover');
  await sendMenu(sock, ctx, 'custom', { ...options, getMedia: () => ({ type: 'image', file: 'abc.jpg' }) });
  assert.equal(messages[4].image.toString(), 'custom cover');
  assert.equal(messages[4].caption, 'custom');
  assert.equal(messages[4].video, undefined);
});

test('animation failures preserve the full menu text and quoted message', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-cover-fallback-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const defaultFile = path.join(directory, 'cover.mp4');
  await fs.writeFile(defaultFile, 'animation');
  const calls = [], msg = { key: { id: 'original' } };
  const sock = { sendMessage: async (jid, payload, options) => {
    calls.push({ jid, payload, options });
    if (payload.video) throw new Error('WhatsApp rejected the video');
  } };
  await sendMenu(sock, { jid: '123@g.us', args: [], msg }, '!menu jogos\n!menu rp', {
    getMedia: () => null, useDefault: () => true, defaultFile
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    jid: '123@g.us', payload: { text: '!menu jogos\n!menu rp' }, options: { quoted: msg }
  });

  const link = path.join(directory, 'link.mp4');
  await fs.symlink(defaultFile, link);
  await sendMenu(sock, { jid: '123@g.us', args: [] }, 'unsafe file', {
    getMedia: () => null, useDefault: () => true, defaultFile: link
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].payload, { text: 'unsafe file' });
});

test('the actual menu command sends the bundled animation and retains menu categories', async t => {
  t.mock.method(require('../src/security/settings'), 'get', (key, fallback) => fallback);
  const { createMenu } = require('../src/commands/menu');
  const menu = createMenu({ catalog: () => [], prefix: () => '!!', at: () => new Date('2026-11-12T12:00:00Z') });
  const messages = [], msg = { key: { id: 'menu' } };
  const sock = { sendMessage: async (jid, payload, options) => messages.push({ jid, payload, options }) };
  const ctx = { jid: '123@g.us', args: [], msg, pushName: 'Lobo' };

  await menu(sock, ctx);
  const expectedVideo = await fs.readFile(path.join(__dirname, '../src/assets/menu-geral.mp4'));
  assert.equal(expectedVideo.subarray(4, 8).toString(), 'ftyp', 'The bundled cover must be an MP4');
  assert.deepEqual(messages[0].payload.video, expectedVideo);
  assert.equal(messages[0].payload.gifPlayback, true);
  assert.equal(messages[0].payload.mimetype, 'video/mp4');
  assert.match(messages[0].payload.caption.replace(/\*/g, '').replace(/\s+/g, ' '), /MENU PRINCIPAL DA MATILHA/);
  assert.match(messages[0].payload.caption, /\*!!menu\* `jogos`/);
  assert.equal(messages[0].options.quoted, msg);

  await menu(sock, { ...ctx, args: ['jogos'] });
  assert.equal(messages.length, 2);
  assert.equal(messages[1].payload.video, undefined);
  assert.equal(typeof messages[1].payload.text, 'string');
});
