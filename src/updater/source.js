'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');

const REPOSITORY = 'SrOraku/lobo-bot';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const ROOT_FILES = new Set(['.version','manifest.json','manifest.sig','EXPANSAO.md','atualizar.sh', 'package.json', 'package-lock.json', 'README.md', 'DEPLOY.md',
  'MENUS.md', 'BRONXYS.md', 'MODERNIZACAO.md', 'MOEDA-UNIVERSAL.md', 'eslint.config.js', 'ATALHOS.md', 'ATIVACOES.md', 'ISOLAMENTO.md', 'SECURITY.md', '.dockerignore', 'Dockerfile', 'docker-compose.yml', 'ecosystem.config.js', '.gitignore', '.env.example', 'INICIAR-AQUI.txt']);
const ROOT_DIRS = ['src', 'scripts', 'plugins', 'addons', 'test'];
const BLOCKED = new Set(['.git', '.env', 'node_modules', 'data', 'sessions', 'auth', 'storage', 'logs', 'backups', 'updates']);

function managedPath(name) {
  if (typeof name !== 'string' || name.includes('\\') || name.includes('\0') || path.posix.isAbsolute(name)) return false;
  const parts = name.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || BLOCKED.has(p))) return false;
  if (ROOT_FILES.has(name) || ['src/assets/bem-vindo.jpg','src/assets/menu-principal.jpg','src/assets/despedida.jpg'].includes(name)) return true;
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

function downloadError(message, code, file, original) {
  const error = Object.assign(new Error(message), { code, updateFile: file.path });
  const status = original?.response?.status;
  if (Number.isInteger(status)) error.response = { status };
  return error;
}

async function retryRequest(run, wait) {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      const status = error.response?.status;
      const transient = [408, 429, 500, 502, 503, 504].includes(status) ||
        ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK'].includes(error.code);
      if (!transient || attempt >= 2) throw error;
      await wait(attempt === 0 ? 500 : 1500);
    }
  }
}

async function githubSnapshot({ get = request, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const fetch = (url, binary = false) => retryRequest(() => get(url, binary), wait);
  const commit = await fetch(`${API}/commits/main`);
  const sha = commit?.sha;
  const tree = commit?.commit?.tree?.sha;
  if (![sha, tree].every(v => /^[a-f0-9]{40}$/.test(v || ''))) throw new Error('Referência inválida do repositório.');
  const root = await fetch(`${API}/git/trees/${tree}`);
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
    const nested = await fetch(`${API}/git/trees/${directory.sha}?recursive=1`);
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
    const validate = data => {
      if (data.length > 2 * 1024 * 1024) throw downloadError('Arquivo da atualização excede o limite.', 'DOWNLOAD_FILE_TOO_LARGE', file);
      const digest = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
      if (digest !== file.sha) throw downloadError('Falha na integridade de um arquivo da atualização.', 'DOWNLOAD_HASH_MISMATCH', file);
      return data;
    };
    let rawFailure;
    try { return validate(Buffer.from(await fetch(url, true))); }
    catch (error) { rawFailure = error; }
    // Same repository and pinned blob hash: a transient raw/CDN failure must not
    // require accepting unverified bytes or downloading from an arbitrary URL.
    try {
      const blob = await fetch(`${API}/git/blobs/${file.sha}`);
      const content = typeof blob?.content === 'string' ? blob.content.replace(/\s/g, '') : '';
      if (blob?.sha !== file.sha || blob.encoding !== 'base64' || !/^[A-Za-z0-9+/]*={0,2}$/.test(content) || blob.size > 2 * 1024 * 1024) {
        throw downloadError('Resposta inválida ao baixar o arquivo pela API do GitHub.', 'DOWNLOAD_INVALID_BLOB', file);
      }
      return validate(Buffer.from(content, 'base64'));
    } catch (error) {
      if (error.updateFile) throw error;
      if (rawFailure.updateFile) throw rawFailure;
      const code = /^[A-Z][A-Z0-9_]{1,48}$/.test(String(error.code || '')) ? error.code : 'DOWNLOAD_FAILED';
      throw downloadError('Não foi possível baixar o arquivo pelas origens oficiais do GitHub.', code, file, error.response ? error : rawFailure);
    }
  } };
}

module.exports = { REPOSITORY, ROOT_FILES, ROOT_DIRS, managedPath, githubSnapshot, retryRequest };
