'use strict';
// Run inference in a child so its model memory is released after each job.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { classifyBackgroundError } = require('./background-errors');

// "medium" é o ISNet FP16 (recorte mais fiel em cabelo e bordas). "small"
// gasta menos memória; SFUNDO_MODEL=small força o pequeno.
const MODELS = Object.freeze(['medium', 'small']);

function preferredModel(env = process.env) {
  const value = String(env.SFUNDO_MODEL || '').trim().toLowerCase();
  return value === 'small' ? 'small' : 'medium';
}

function modelAssets(resolveModule = require.resolve, model = 'medium') {
  // IMG.LY's default publicPath is relative to cwd. Hosts and supervisors can
  // start the bot elsewhere, so resolve assets beside the installed package.
  const directory = path.dirname(resolveModule('@imgly/background-removal-node'));
  const resources = JSON.parse(fs.readFileSync(path.join(directory, 'resources.json'), 'utf8'));
  const entry = resources['/models/' + model];
  if (!entry || !Array.isArray(entry.chunks) || !entry.chunks.length)
    throw Object.assign(Error('Invalid model resource map'), { code: 'BACKGROUND_ASSET_MISSING' });
  for (const chunk of entry.chunks) {
    // Bundled chunks are SHA-256 filenames, never arbitrary relative paths.
    if (!/^[a-f0-9]{64}$/.test(chunk.hash))
      throw Object.assign(Error('Invalid model chunk'), { code: 'BACKGROUND_ASSET_MISSING' });
    const stat = fs.statSync(path.join(directory, chunk.hash));
    const size = Array.isArray(chunk.offsets) ? chunk.offsets[1] - chunk.offsets[0] : NaN;
    if (!stat.isFile() || !Number.isSafeInteger(size) || size <= 0 || stat.size !== size)
      throw Object.assign(Error('Incomplete model chunk'), { code: 'BACKGROUND_ASSET_MISSING' });
  }
  return pathToFileURL(directory + path.sep).href;
}

// Usa o modelo preferido; se os arquivos dele estiverem incompletos, tenta o outro.
function resolveModel(resolveModule = require.resolve, env = process.env) {
  const preferred = preferredModel(env);
  let first;
  for (const model of [preferred, ...MODELS.filter(name => name !== preferred)]) {
    try {
      return { model, publicPath: modelAssets(resolveModule, model) };
    } catch (error) {
      first ||= error;
    }
  }
  throw first;
}

async function refine(png) {
  const sharp = require('sharp');
  const { refineCutout } = require('./matting');
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = refineCutout({ data, width: info.width, height: info.height });
  const output = await sharp(result.data, { raw: { width: result.width, height: result.height, channels: 4 } }).png().toBuffer();
  return { output, result };
}

async function runBackground({ input, output, load = () => require('@imgly/background-removal-node'), resolveModule = require.resolve, env = process.env, onStage = () => {} }) {
  let stage;
  const report = next => {
    if (stage !== next) {
      stage = next;
      onStage(stage);
    }
  };
  try {
    report('DEPENDENCIES');
    const { removeBackground } = load();
    if (typeof removeBackground !== 'function')
      throw Object.assign(Error('Missing segmentation entrypoint'), { code: 'BACKGROUND_DEPENDENCY_MISSING' });
    report('INPUT');
    const image = new Blob([fs.readFileSync(input)], { type: 'image/png' });
    report('ASSETS');
    const { model, publicPath } = resolveModel(resolveModule, env);
    report('MODEL');
    const blob = await removeBackground(image, {
      publicPath,
      model,
      debug: false,
      output: { format: 'image/png' },
      progress: key => {
        if (key === 'compute:inference') report('INFERENCE');
      },
    });
    report('OUTPUT');
    const refined = await refine(Buffer.from(await blob.arrayBuffer()));
    fs.writeFileSync(output, refined.output);
    const { bbox, coverage, width, height } = refined.result;
    // Somente números e o nome do modelo saem do worker: nada de caminhos.
    return { model, bbox, coverage, width, height };
  } catch (error) {
    // Tag a safe stage internally; the entrypoint emits only the allowlisted code.
    throw Object.assign(error instanceof Error ? error : Error('Worker failed'), { backgroundStage: stage });
  }
}

function resultLine({ model, bbox, coverage, width, height }) {
  const number = value => (Number.isFinite(value) ? value : 0);
  return 'BACKGROUND_RESULT:' + JSON.stringify({
    model: MODELS.includes(model) ? model : 'medium',
    bbox: bbox ? { left: number(bbox.left), top: number(bbox.top), width: number(bbox.width), height: number(bbox.height) } : null,
    coverage: number(coverage),
    width: number(width),
    height: number(height),
  });
}

if (require.main === module) {
  runBackground({ input: process.argv[2], output: process.argv[3], onStage: stage => process.stderr.write(`BACKGROUND_STAGE:${stage}\n`) })
    .then(result => process.stdout.write(resultLine(result) + '\n', () => process.exit(0)))
    .catch(error => {
      const code = classifyBackgroundError(error, error.backgroundStage);
      process.stderr.write(`BACKGROUND_ERROR:${code}\n`, () => process.exit(code === 'BACKGROUND_DEPENDENCY_MISSING' ? 78 : 1));
    });
}

module.exports = { MODELS, preferredModel, modelAssets, resolveModel, runBackground, resultLine };
