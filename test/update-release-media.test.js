'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { githubSnapshot } = require('../src/updater/source');

// Reproduce the release contract with the actual shipped files, not tiny
// image substitutes. The old 2 MiB ceiling rejected both welcome/farewell JPEGs.
// `recursive: false` makes GitHub truncate the one-request tree, forcing the per-folder mode.
function fixture(extra = [], { recursive = true } = {}) {
  const names = ['package.json', 'package-lock.json', 'src/index.js', 'src/bootstrap.js',
    'scripts/check-startup.js', 'src/assets/bem-vindo.jpg', 'src/assets/despedida.jpg', 'src/assets/menu-geral.mp4'];
  const blobs = new Map();
  const entries = names.map(name => {
    const data = fs.readFileSync(path.join(__dirname, '..', name));
    const sha = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    blobs.set(name, data);
    return { path: name, size: data.length, sha, mode: '100644', type: 'blob' };
  }).concat(extra);
  const root = 'b'.repeat(40), src = 'c'.repeat(40), scripts = 'd'.repeat(40), assets = 'e'.repeat(40);
  const calls = [];
  async function get(url, binary) {
    calls.push({ url, binary });
    if (binary) return blobs.get(url.split('/').slice(6).join('/'));
    if (url.endsWith('/commits/main')) return { sha: 'a'.repeat(40), commit: { tree: { sha: root } } };
    if (url.endsWith('/git/trees/' + root + '?recursive=1')) {
      if (!recursive) return { truncated: true, tree: [] };
      return { truncated: false, tree: entries.concat([
        { path: 'src', sha: src, mode: '040000', type: 'tree' },
        { path: 'scripts', sha: scripts, mode: '040000', type: 'tree' },
        { path: 'src/assets', sha: assets, mode: '040000', type: 'tree' },
      ]) };
    }
    const files = prefix => entries.filter(e => e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes('/')).map(e => ({ ...e, path: e.path.slice(prefix.length) }));
    if (url.endsWith('/git/trees/' + root)) return { tree: files('').concat([
      { path: 'src', sha: src, mode: '040000', type: 'tree' },
      { path: 'scripts', sha: scripts, mode: '040000', type: 'tree' },
    ]) };
    if (url.endsWith('/git/trees/' + src)) return { tree: files('src/').concat([{ path: 'assets', sha: assets, mode: '040000', type: 'tree' }]) };
    if (url.endsWith('/git/trees/' + scripts)) return { tree: files('scripts/') };
    if (url.endsWith('/git/trees/' + assets)) return { tree: files('src/assets/') };
    throw Error('Unexpected fixture request');
  }
  return { get, blobs, calls };
}

test('official welcome, farewell and menu media pass snapshot discovery and pinned hash verification', async () => {
  const split = await githubSnapshot({ get: fixture([], { recursive: false }).get });
  const f = fixture();
  assert.ok(f.blobs.get('src/assets/bem-vindo.jpg').length > 2 * 1024 * 1024);
  assert.ok(f.blobs.get('src/assets/despedida.jpg').length > 2 * 1024 * 1024);
  const source = await githubSnapshot({ get: f.get });
  assert.equal(source.files.length, f.blobs.size);
  const byPath = files => [...files].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(byPath(split.files), byPath(source.files), 'one request and per-folder mode find the same files');
  for (const file of source.files.filter(file => file.path.startsWith('src/assets/'))) {
    assert.deepEqual(await source.download(file), f.blobs.get(file.path));
    assert.ok(f.calls.at(-1).url.includes('/' + source.sha + '/' + file.path));
  }
});

test('larger media allowance does not raise the limit for source code', async () => {
  for (const recursive of [true, false]) {
    const f = fixture([{ path: 'src/large.js', size: 2 * 1024 * 1024 + 1, sha: 'f'.repeat(40), mode: '100644', type: 'blob' }], { recursive });
    await assert.rejects(githubSnapshot({ get: f.get }), { code: 'DOWNLOAD_FILE_TOO_LARGE', updateFile: 'src/large.js' });
    assert.equal(f.calls.some(c => c.binary), false);
  }
});

test('approved images still have a bounded ceiling and fail before downloading or applying', async () => {
  const f = fixture([{ path: 'src/assets/bem-vindo.jpg', size: 8 * 1024 * 1024 + 1, sha: 'f'.repeat(40), mode: '100644', type: 'blob' }]);
  await assert.rejects(githubSnapshot({ get: f.get }), { code: 'DOWNLOAD_FILE_TOO_LARGE', updateFile: 'src/assets/bem-vindo.jpg' });
  assert.equal(f.calls.some(c => c.binary), false);
});

test('HTTP transport uses the same media bounds and verifies actual shipped bytes', async () => {
  const axios = require('axios');
  const original = axios.get;
  const f = fixture();
  const snapshot = await githubSnapshot({ get: f.get });
  // A second snapshot uses the real request() and download() functions while
  // replacing only the HTTP boundary. No requests leave this process.
  const limits = [];
  axios.get = async (url, options) => {
    if (options.responseType === 'arraybuffer') limits.push({ url, limit: options.maxContentLength });
    return { data: await f.get(url, options.responseType === 'arraybuffer') };
  };
  try {
    const actual = await githubSnapshot();
    for (const name of ['src/assets/bem-vindo.jpg', 'src/assets/despedida.jpg', 'src/assets/menu-geral.mp4', 'src/index.js']) {
      const file = actual.files.find(file => file.path === name);
      assert.deepEqual(await actual.download(file), f.blobs.get(name));
    }
    assert.equal(actual.sha, snapshot.sha);
    assert.deepEqual(limits.map(item => item.limit), [8, 8, 8, 2].map(n => n * 1024 * 1024));
  } finally { axios.get = original; }
});
