'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { runBackground, modelAssets } = require('../src/media/remove-background-worker');
const { BACKGROUND_ERROR_CODES, classifyBackgroundError } = require('../src/media/background-errors');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-background-worker-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, 'installed package #1', 'dist');
  fs.mkdirSync(assets, { recursive: true });
  const hash = 'a'.repeat(64);
  const resources = { '/models/small': { chunks: [{ hash, offsets: [0, 3] }], size: 3 } };
  fs.writeFileSync(path.join(assets, 'resources.json'), JSON.stringify(resources));
  fs.writeFileSync(path.join(assets, hash), 'abc');
  const input = path.join(directory, 'input.png'), output = path.join(directory, 'output.png');
  fs.writeFileSync(input, 'input fixture');
  return { directory, assets, resources, hash, input, output, resolveModule: () => path.join(assets, 'index.cjs') };
}

test('model resources resolve beside installed package with encoded paths instead of cwd', t => {
  const f = fixture(t);
  assert.equal(modelAssets(f.resolveModule), pathToFileURL(f.assets + path.sep).href);
  assert.notEqual(f.assets, process.cwd());
  assert.ok(modelAssets(f.resolveModule).includes('%23'));
});

test('worker passes absolute local assets, small model and PNG output and reports inference stages', async t => {
  const f = fixture(t), stages = [];
  await runBackground({ ...f, onStage: stage => stages.push(stage), load: () => ({
    removeBackground: async (image, config) => {
      assert.equal(await image.text(), 'input fixture');
      assert.equal(config.publicPath, pathToFileURL(f.assets + path.sep).href);
      assert.equal(config.model, 'small');
      assert.equal(config.debug, false);
      assert.deepEqual(config.output, { format: 'image/png' });
      config.progress('fetch:/models/small', 3, 3);
      config.progress('compute:inference', 0, 1);
      config.progress('compute:inference', 1, 1);
      return new Blob(['transparent output']);
    },
  }) });
  assert.equal(fs.readFileSync(f.output, 'utf8'), 'transparent output');
  assert.deepEqual(stages, ['DEPENDENCIES', 'INPUT', 'ASSETS', 'MODEL', 'INFERENCE', 'OUTPUT']);
});

test('worker rejects missing, truncated, malformed or traversing model chunks before inference', async t => {
  for (const scenario of ['missing map', 'invalid JSON', 'missing chunk', 'truncated chunk', 'traversal']) {
    await t.test(scenario, async st => {
      const f = fixture(st);
      if (scenario === 'missing map') fs.unlinkSync(path.join(f.assets, 'resources.json'));
      if (scenario === 'invalid JSON') fs.writeFileSync(path.join(f.assets, 'resources.json'), '{');
      if (scenario === 'missing chunk') fs.unlinkSync(path.join(f.assets, f.hash));
      if (scenario === 'truncated chunk') fs.writeFileSync(path.join(f.assets, f.hash), 'a');
      if (scenario === 'traversal') {
        f.resources['/models/small'].chunks[0].hash = '../outside';
        fs.writeFileSync(path.join(f.assets, 'resources.json'), JSON.stringify(f.resources));
      }
      await assert.rejects(runBackground({ ...f, load: () => ({ removeBackground: () => assert.fail('Invalid assets must not reach inference') }) }), error => {
        assert.equal(error.backgroundStage, 'ASSETS');
        assert.equal(classifyBackgroundError(error, error.backgroundStage), 'BACKGROUND_ASSET_MISSING');
        return true;
      });
      assert.equal(fs.existsSync(f.output), false);
    });
  }
});

test('worker distinguishes failures before and during inference', async t => {
  for (const stage of ['MODEL', 'INFERENCE']) {
    const f = fixture(t);
    await assert.rejects(runBackground({ ...f, load: () => ({ removeBackground: async (_, config) => {
      if (stage === 'INFERENCE') config.progress('compute:inference', 0, 1);
      throw Error('private host path and key must not become an error code');
    } }) }), error => {
      assert.equal(error.backgroundStage, stage);
      assert.equal(classifyBackgroundError(error, stage), `BACKGROUND_${stage}_FAILED`);
      return true;
    });
    assert.equal(fs.existsSync(f.output), false);
  }
});

test('worker preserves dependency and output stages when setup or writing fails', async t => {
  const f = fixture(t);
  await assert.rejects(runBackground({ ...f, load: () => { throw Object.assign(Error('module unavailable'), { code: 'MODULE_NOT_FOUND' }); } }), error => {
    assert.equal(error.backgroundStage, 'DEPENDENCIES');
    assert.equal(classifyBackgroundError(error, error.backgroundStage), 'BACKGROUND_DEPENDENCY_MISSING');
    return true;
  });
  await assert.rejects(runBackground({ ...f, output: path.join(f.directory, 'missing', 'output'), load: () => ({ removeBackground: async () => new Blob(['result']) }) }), error => {
    assert.equal(error.backgroundStage, 'OUTPUT');
    return true;
  });
});

test('worker error classification produces only safe identifiers for native, resource and input failures', () => {
  const cases = [
    ['ENOMEM', '', 'INFERENCE', 'BACKGROUND_MEMORY'],
    [undefined, 'std::bad_alloc with /private/key', 'MODEL', 'BACKGROUND_MEMORY'],
    ['ERR_DLOPEN_FAILED', 'libonnxruntime.so failed', 'DEPENDENCIES', 'BACKGROUND_NATIVE_UNAVAILABLE'],
    ['MODULE_NOT_FOUND', 'Cannot find module /private/onnxruntime_binding.node', 'DEPENDENCIES', 'BACKGROUND_NATIVE_UNAVAILABLE'],
    ['MODULE_NOT_FOUND', 'Cannot find module /private/package', 'DEPENDENCIES', 'BACKGROUND_DEPENDENCY_MISSING'],
    ['EACCES', '/private/model', 'ASSETS', 'BACKGROUND_PERMISSION'],
    ['ENOSPC', '/private/output', 'OUTPUT', 'BACKGROUND_DISK_FULL'],
    ['ENOENT', '/private/resources.json', 'ASSETS', 'BACKGROUND_ASSET_MISSING'],
    [undefined, 'Input buffer contains unsupported image format', 'MODEL', 'BACKGROUND_INVALID_IMAGE'],
    [undefined, '/private/user content', 'OUTPUT', 'BACKGROUND_FAILED'],
  ];
  for (const [code, message, stage, expected] of cases) {
    const actual = classifyBackgroundError(Object.assign(Error(message), { code }), stage);
    assert.equal(actual, expected);
    assert.ok(BACKGROUND_ERROR_CODES.includes(actual));
    assert.ok(!actual.includes('/private'));
  }
});

test('worker stderr protocol never includes raw input paths or errors', async t => {
  const f = fixture(t);
  const { promisify } = require('node:util');
  const execFile = promisify(require('node:child_process').execFile);
  await assert.rejects(execFile(process.execPath, [path.resolve(__dirname, '../src/media/remove-background-worker.js'), path.join(f.directory, 'PRIVATE-INPUT-NOT-EXPOSED'), f.output], { cwd: f.directory }), error => {
    assert.ok(!error.stderr.includes('PRIVATE-INPUT-NOT-EXPOSED'));
    const lines = error.stderr.trim().split('\n');
    for (const line of lines) assert.match(line, /^BACKGROUND_(?:STAGE:(?:DEPENDENCIES|INPUT)|ERROR:BACKGROUND_(?:INVALID_IMAGE|DEPENDENCY_MISSING|NATIVE_UNAVAILABLE))$/);
    assert.ok(lines.some(line => line.startsWith('BACKGROUND_ERROR:')));
    return true;
  });
});
