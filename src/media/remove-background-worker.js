'use strict';
// Run inference in a child so its model memory is released after each job.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { classifyBackgroundError } = require('./background-errors');

function modelAssets(resolveModule = require.resolve) {
  // IMG.LY's default publicPath is relative to cwd. Hosts and supervisors can
  // start the bot elsewhere, so resolve assets beside the installed package.
  const directory = path.dirname(resolveModule('@imgly/background-removal-node'));
  const resources = JSON.parse(fs.readFileSync(path.join(directory, 'resources.json'), 'utf8'));
  const model = resources['/models/small'];
  if (!model || !Array.isArray(model.chunks) || !model.chunks.length)
    throw Object.assign(Error('Invalid model resource map'), { code: 'BACKGROUND_ASSET_MISSING' });
  for (const chunk of model.chunks) {
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

async function runBackground({ input, output, load = () => require('@imgly/background-removal-node'), resolveModule = require.resolve, onStage = () => {} }) {
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
    const publicPath = modelAssets(resolveModule);
    report('MODEL');
    const blob = await removeBackground(image, {
      publicPath,
      model: 'small',
      debug: false,
      output: { format: 'image/png' },
      progress: key => {
        if (key === 'compute:inference') report('INFERENCE');
      },
    });
    report('OUTPUT');
    fs.writeFileSync(output, Buffer.from(await blob.arrayBuffer()));
  } catch (error) {
    // Tag a safe stage internally; the entrypoint emits only the allowlisted code.
    throw Object.assign(error instanceof Error ? error : Error('Worker failed'), { backgroundStage: stage });
  }
}

if (require.main === module) {
  runBackground({ input: process.argv[2], output: process.argv[3], onStage: stage => process.stderr.write(`BACKGROUND_STAGE:${stage}\n`) })
    .then(() => process.exit(0))
    .catch(error => {
      const code = classifyBackgroundError(error, error.backgroundStage);
      process.stderr.write(`BACKGROUND_ERROR:${code}\n`, () => process.exit(code === 'BACKGROUND_DEPENDENCY_MISSING' ? 78 : 1));
    });
}

module.exports = { modelAssets, runBackground };
