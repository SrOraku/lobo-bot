'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPlatform, describePlatform } = require('../src/utils/platform');

test('identifica Windows, macOS e Linux', () => {
  assert.equal(detectPlatform({ platform: 'win32', env: {}, skipFilesystemCheck: true }).family, 'windows');
  assert.equal(detectPlatform({ platform: 'darwin', env: {}, skipFilesystemCheck: true }).family, 'macos');
  assert.equal(detectPlatform({ platform: 'linux', env: {}, skipFilesystemCheck: true }).family, 'linux');
});

test('identifica Android por variáveis do sistema', () => {
  const android = detectPlatform({
    platform: 'linux',
    env: { ANDROID_ROOT: '/system', ANDROID_DATA: '/data' },
    skipFilesystemCheck: true
  });
  assert.equal(android.family, 'android');
  assert.equal(android.android, true);
  assert.equal(android.termux, false);
});

test('identifica Termux por TERMUX_VERSION ou PREFIX', () => {
  const byVersion = detectPlatform({ platform: 'linux', env: { TERMUX_VERSION: '0.119' }, skipFilesystemCheck: true });
  const byPrefix = detectPlatform({ platform: 'linux', env: { PREFIX: '/data/data/com.termux/files/usr' }, skipFilesystemCheck: true });
  assert.equal(byVersion.termux, true);
  assert.equal(byVersion.family, 'android');
  assert.equal(byPrefix.termux, true);
});

test('identifica contêiner e provedores de hospedagem sem confundir host com sistema', () => {
  const render = detectPlatform({
    platform: 'linux',
    env: { RENDER: 'true', KUBERNETES_SERVICE_HOST: '10.0.0.1' },
    skipFilesystemCheck: true
  });
  assert.equal(render.family, 'linux');
  assert.equal(render.host, 'render');
  assert.equal(render.container, true);
});

test('não altera o ambiente e produz descrição legível', () => {
  const env = { GITHUB_ACTIONS: 'true' };
  const info = detectPlatform({ platform: 'linux', arch: 'arm64', env, nodeVersion: '22.12.0', skipFilesystemCheck: true });
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.match(describePlatform(info), /Linux \| arm64 \| Node 22\.12\.0 \| host: github-actions/);
});
