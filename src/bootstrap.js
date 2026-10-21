'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INSTALL_FLAGS = ['--omit=dev', '--no-audit', '--no-fund'];

function sameDependencies(left = {}, right = {}) {
  const names = Object.keys(left);
  return names.length === Object.keys(right).length
    && names.every(name => left[name] === right[name]);
}

function hasUsableLock(rootDir, manifest) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
    const root = lock.packages && lock.packages[''];
    if (![2, 3].includes(lock.lockfileVersion) || !root) return false;
    if (root.name !== manifest.name || root.version !== manifest.version) return false;

    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (!sameDependencies(root[field], manifest[field])) return false;
      for (const name of Object.keys(manifest[field] || {})) {
        const dependency = lock.packages[`node_modules/${name}`];
        if (!dependency || (!dependency.version && !dependency.link)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Prepare production dependencies before any application module is loaded. */
function ensureDependencies({
  rootDir = path.resolve(__dirname, '..'),
  spawn = spawnSync,
  resolve = require.resolve,
  log = console,
} = {}) {
  const root = path.resolve(rootDir);
  const report = (message, error = false) => {
    if (typeof log === 'function') log(message);
    else if (log) {
      const write = error ? log.error || log.log : log.log;
      if (typeof write === 'function') write.call(log, message);
    }
  };

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch (error) {
    report(`❌ Não foi possível ler o package.json do bot: ${error.message}`, true);
    return false;
  }

  const dependencies = Object.keys(manifest.dependencies || {});
  const findMissing = () => dependencies.filter(name => {
    try {
      resolve(name, { paths: [root] });
      return false;
    } catch {
      return true;
    }
  });

  const missing = findMissing();
  if (missing.length === 0) return true;

  const command = hasUsableLock(root, manifest) ? 'ci' : 'install';
  report(`📦 Instalando dependências ausentes: ${missing.join(', ')}.`);
  let result;
  try {
    result = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [command, ...INSTALL_FLAGS], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
    });
  } catch (error) {
    report(`❌ Não foi possível executar o npm: ${error.message}`, true);
    return false;
  }

  if (!result || result.error || result.status !== 0) {
    const reason = result?.error?.message || (result?.signal ? `sinal ${result.signal}` : `código ${result?.status ?? 'desconhecido'}`);
    report(`❌ Falha ao instalar as dependências do bot (${reason}). Verifique o npm, a rede e o log acima antes de reiniciar.`, true);
    return false;
  }

  const remaining = findMissing();
  if (remaining.length > 0) {
    report(`❌ Dependências ainda ausentes após a instalação: ${remaining.join(', ')}. Verifique o log do npm antes de reiniciar.`, true);
    return false;
  }
  return true;
}

module.exports = { ensureDependencies };
