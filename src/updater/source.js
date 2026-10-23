'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');

const REPOSITORY = 'SrOraku/lobo-bot';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const ROOT_FILES = new Set(['package.json', 'package-lock.json', 'README.md', 'DEPLOY.md',
  'MENUS.md', 'MODERNIZACAO.md', 'eslint.config.js', 'ATALHOS.md', 'ATIVACOES.md', 'ISOLAMENTO.md', 'SECURITY.md', '.dockerignore', 'Dockerfile', 'docker-compose.yml', 'ecosystem.config.js', '.gitignore', '.env.example', 'INICIAR-AQUI.txt']);
const ROOT_DIRS = ['src', 'scripts', 'plugins', 'addons', 'test'];
const BLOCKED = new Set(['.git', '.env', 'node_modules', 'data', 'sessions', 'auth', 'storage', 'logs', 'backups', 'updates']);

function managedPath(name) {
  if (typeof name !== 'string' || name.includes('\\') || name.includes('\0') || path.posix.isAbsolute(name)) return false;
  const parts = name.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || BLOCKED.has(p))) return false;
  if (ROOT_FILES.has(name) || name === 'src/assets/bem-vindo.jpg') return true;
  return /^(?:src|scripts|plugins|test)\/.+\.(?:js|json|md|txt)$/.test(name)
    || /^addons\/alcateia\/.+\.(?:js|json|md|txt)$/.test(name);
}

async function request(url, binary = false) {
  const response = await require('axios').get(url, {
    timeout: 30_000, maxContentLength: 4 * 1024 * 1024,
    responseType: binary ? 'arraybuffer' : 'json',
    headers: { 'User-Agent': 'Lobo-bot-updater', Accept: 'application/vnd.github+json' },
  });
  return response.data;
}

async function githubSnapshot({ get = request } = {}) {
  const commit = await get(`${API}/commits/main`);
  const sha = commit?.sha;
  const tree = commit?.commit?.tree?.sha;
  if (![sha, tree].every(v => /^[a-f0-9]{40}$/.test(v || ''))) throw new Error('Referência inválida do repositório.');
  const root = await get(`${API}/git/trees/${tree}`);
  if (!Array.isArray(root.tree) || root.truncated) throw new Error('Árvore incompleta do repositório.');
  const files = [];
  const add = (item, prefix = '') => {
    const name = prefix + item.path;
    if (!managedPath(name)) return;
    if (!['100644', '100755'].includes(item.mode) || item.type !== 'blob' || !/^[a-f0-9]{40}$/.test(item.sha || '')) {
      throw new Error('O código da atualização contém um arquivo não suportado.');
    }
    if (item.size > 2 * 1024 * 1024) throw new Error('Arquivo da atualização excede o limite.');
    files.push({ path: name, sha: item.sha, mode: item.mode });
  };
  for (const item of root.tree) if (ROOT_FILES.has(item.path)) add(item);
  for (const name of ROOT_DIRS) {
    const directory = root.tree.find(e => e.path === name && e.type === 'tree' && e.mode === '040000');
    if (!directory) continue;
    const nested = await get(`${API}/git/trees/${directory.sha}?recursive=1`);
    if (!Array.isArray(nested.tree) || nested.truncated) throw new Error('Diretório incompleto na atualização.');
    for (const item of nested.tree) if (item.type !== 'tree') add(item, `${name}/`);
  }
  if (files.length > 500 || new Set(files.map(f => f.path)).size !== files.length) throw new Error('Manifesto de atualização inválido.');
  for (const name of ['package.json', 'package-lock.json', 'src/index.js', 'src/bootstrap.js', 'scripts/check-startup.js']) {
    if (!files.some(f => f.path === name)) throw new Error('A atualização não contém todos os arquivos necessários.');
  }
  return { sha, files, async download(file) {
    if (!files.includes(file)) throw new Error('Arquivo não pertence ao manifesto.');
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${sha}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    const data = Buffer.from(await get(url, true));
    const digest = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    if (data.length > 2 * 1024 * 1024 || digest !== file.sha) throw new Error('Falha na integridade de um arquivo da atualização.');
    return data;
  } };
}

module.exports = { REPOSITORY, ROOT_FILES, ROOT_DIRS, managedPath, githubSnapshot };
