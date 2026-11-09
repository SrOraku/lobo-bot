'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');
const { runBackground, modelAssets, resolveModel, preferredModel, resultLine } = require('../src/media/remove-background-worker');
const { BACKGROUND_ERROR_CODES, classifyBackgroundError } = require('../src/media/background-errors');
const { workerResult } = require('../src/media/background');

// Os dois modelos apontam para o mesmo chunk, então danificá-lo invalida ambos;
// `models` permite montar instalações com apenas um modelo completo.
function fixture(t, { models = ['medium', 'small'] } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-background-worker-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, 'installed package #1', 'dist');
  fs.mkdirSync(assets, { recursive: true });
  const hash = 'a'.repeat(64);
  const resources = {};
  for (const model of models) resources['/models/' + model] = { chunks: [{ hash, offsets: [0, 3] }], size: 3 };
  fs.writeFileSync(path.join(assets, 'resources.json'), JSON.stringify(resources));
  fs.writeFileSync(path.join(assets, hash), 'abc');
  const input = path.join(directory, 'input.png'), output = path.join(directory, 'output.png');
  fs.writeFileSync(input, 'input fixture');
  return { directory, assets, resources, hash, input, output, env: {}, resolveModule: () => path.join(assets, 'index.cjs') };
}

// Recorte simulado: quadrado opaco de 20×20 no centro de 40×40 transparente.
async function cutoutPNG() {
  return sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 20, height: 20, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }, left: 10, top: 10 }])
    .png().toBuffer();
}

test('model resources resolve beside installed package with encoded paths instead of cwd', t => {
  const f = fixture(t);
  assert.equal(modelAssets(f.resolveModule), pathToFileURL(f.assets + path.sep).href);
  assert.equal(modelAssets(f.resolveModule, 'small'), pathToFileURL(f.assets + path.sep).href);
  assert.notEqual(f.assets, process.cwd());
  assert.ok(modelAssets(f.resolveModule).includes('%23'));
});

test('worker prefers the medium model, honours SFUNDO_MODEL and falls back when files are missing', t => {
  assert.equal(preferredModel({}), 'medium');
  assert.equal(preferredModel({ SFUNDO_MODEL: 'small' }), 'small');
  assert.equal(preferredModel({ SFUNDO_MODEL: ' SMALL ' }), 'small');
  assert.equal(preferredModel({ SFUNDO_MODEL: 'large' }), 'medium');
  assert.equal(preferredModel({ SFUNDO_MODEL: '../outside' }), 'medium');
  const both = fixture(t);
  assert.equal(resolveModel(both.resolveModule, {}).model, 'medium');
  assert.equal(resolveModel(both.resolveModule, { SFUNDO_MODEL: 'small' }).model, 'small');
  assert.equal(resolveModel(both.resolveModule, { SFUNDO_MODEL: 'invalido' }).model, 'medium');
  const onlySmall = fixture(t, { models: ['small'] });
  assert.equal(resolveModel(onlySmall.resolveModule, {}).model, 'small');
  const onlyMedium = fixture(t, { models: ['medium'] });
  assert.equal(resolveModel(onlyMedium.resolveModule, { SFUNDO_MODEL: 'small' }).model, 'medium');
});

test('worker falls back to small when a medium chunk is incomplete', async t => {
  const f = fixture(t);
  const mediumHash = 'b'.repeat(64);
  f.resources['/models/medium'].chunks = [{ hash: mediumHash, offsets: [0, 10] }];
  fs.writeFileSync(path.join(f.assets, 'resources.json'), JSON.stringify(f.resources));
  fs.writeFileSync(path.join(f.assets, mediumHash), 'short');
  const png = await cutoutPNG();
  const result = await runBackground({ ...f, load: () => ({ removeBackground: async (_, config) => { assert.equal(config.model, 'small'); return new Blob([png]); } }) });
  assert.equal(result.model, 'small');
});

test('worker passes absolute local assets, medium model and PNG output, refines it and reports inference stages', async t => {
  const f = fixture(t), stages = [], png = await cutoutPNG();
  const result = await runBackground({ ...f, onStage: stage => stages.push(stage), load: () => ({
    removeBackground: async (image, config) => {
      assert.equal(await image.text(), 'input fixture');
      assert.equal(config.publicPath, pathToFileURL(f.assets + path.sep).href);
      assert.equal(config.model, 'medium');
      assert.equal(config.debug, false);
      assert.deepEqual(config.output, { format: 'image/png' });
      config.progress('fetch:/models/medium', 3, 3);
      config.progress('compute:inference', 0, 1);
      config.progress('compute:inference', 1, 1);
      return new Blob([png]);
    },
  }) });
  const written = await sharp(fs.readFileSync(f.output)).metadata();
  assert.equal(written.format, 'png'); assert.equal(written.hasAlpha, true);
  assert.equal(written.width, 40); assert.equal(written.height, 40);
  assert.deepEqual(stages, ['DEPENDENCIES', 'INPUT', 'ASSETS', 'MODEL', 'INFERENCE', 'OUTPUT']);
  assert.equal(result.model, 'medium');
  assert.deepEqual(result.bbox, { left: 10, top: 10, width: 20, height: 20 });
  assert.equal(result.width, 40); assert.equal(result.height, 40);
  assert.ok(Math.abs(result.coverage - 0.25) < 0.01);
});

test('worker result line carries only numbers and the model name, never paths', async t => {
  const f = fixture(t), png = await cutoutPNG();
  const result = await runBackground({ ...f, load: () => ({ removeBackground: async () => new Blob([png]) }) });
  const line = resultLine({ ...result, input: f.input, output: f.output, error: '/private/path' });
  assert.match(line, /^BACKGROUND_RESULT:\{[^\n]*\}$/);
  assert.ok(!line.includes(f.directory)); assert.ok(!line.includes('/private'));
  const parsed = JSON.parse(line.slice('BACKGROUND_RESULT:'.length));
  assert.deepEqual(Object.keys(parsed).sort(), ['bbox', 'coverage', 'height', 'model', 'width']);
  assert.deepEqual(Object.keys(parsed.bbox).sort(), ['height', 'left', 'top', 'width']);
  for (const value of [parsed.coverage, parsed.width, parsed.height, ...Object.values(parsed.bbox)]) assert.equal(typeof value, 'number');
  assert.deepEqual(workerResult('ruído nativo\n' + line + '\n'), parsed);
  // A leitura descarta campos estranhos e valores fora do quadro.
  assert.equal(workerResult('BACKGROUND_RESULT:{"model":"medium","bbox":{"left":0,"top":0,"width":90,"height":5},"coverage":0.1,"width":40,"height":40}'), null);
  assert.equal(workerResult('BACKGROUND_RESULT:{"model":"/private","bbox":null,"coverage":0,"width":40,"height":40}').model, 'medium');
  assert.equal(workerResult('BACKGROUND_RESULT:not json'), null);
  assert.equal(workerResult(''), null);
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
        for (const model of Object.values(f.resources)) model.chunks[0].hash = '../outside';
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

  await assert.rejects(
    execFile(
      process.execPath,
      [
        path.resolve(__dirname, '../src/media/remove-background-worker.js'),
        path.join(f.directory, 'PRIVATE-INPUT-NOT-EXPOSED'),
        f.output,
      ],
      { cwd: f.directory },
    ),
    error => {
      assert.ok(!error.stderr.includes('PRIVATE-INPUT-NOT-EXPOSED'));
      // Em falha, o worker não imprime linha de resultado nem saída nativa.
      assert.equal(error.stdout, '');

      const lines = error.stderr.trim().split('\n').filter(Boolean);
      const protocol = new RegExp(
        '^BACKGROUND_(?:STAGE:(?:DEPENDENCIES|INPUT|ASSETS|MODEL|INFERENCE|OUTPUT)|ERROR:(?:'
          + BACKGROUND_ERROR_CODES.join('|')
          + '))$',
      );

      assert.ok(lines.length > 0, 'worker must emit a protocol status');
      for (const line of lines) assert.match(line, protocol);
      assert.ok(lines.some(line => line.startsWith('BACKGROUND_ERROR:')));
      return true;
    },
  );
});
