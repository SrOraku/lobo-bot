'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const semver = require('semver');
const { githubSnapshot, managedPath, ROOT_FILES, ROOT_DIRS } = require('./source');
const execute = promisify(execFile);

class UpdateError extends Error {
  constructor(message, code = 'UPDATE_FAILED') { super(message); this.code = code; }
}

function describeFailure(error, stage) {
  stage = error.updateStage || stage;
  const text = String(error.stderr || '') + ' ' + String(error.message || '');
  const code = ['EALLOWREMOTE', 'EALLOWGIT', 'ENOSPC', 'EACCES', 'EPERM', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ENOMEM'].find(c => text.includes(c)) ||
    (/^[A-Z][A-Z0-9_]{1,48}$/.test(String(error.code || '')) ? error.code : null);
  const status = error.response?.status;
  let reason = 'Não consegui concluir esta etapa.';
  if (code === 'EALLOWREMOTE' || code === 'EALLOWGIT') reason = 'A hospedagem bloqueou o download de uma dependência. Solicite ao suporte a liberação da dependência oficial do Baileys (libsignal).';
  else if (code === 'ENOSPC') reason = 'Falta espaço em disco para preparar a atualização e o backup.';
  else if (['EACCES','EPERM'].includes(code)) reason = 'O processo não tem permissão para gravar nos arquivos da instalação.';
  else if (code === 'BACKUP_SYMLINK') reason = 'Há um link simbólico dentro da sessão ou dos dados. O backup foi interrompido para não copiar arquivos externos. Verifique os volumes e atalhos da instalação.';
  else if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') reason = 'O banco de dados está ocupado. Aguarde alguns segundos e tente novamente; confira se há outra instância do bot usando o mesmo banco.';
  else if (code === 'SQLITE_CANTOPEN') reason = 'O SQLite não conseguiu abrir o banco ou criar sua cópia de segurança. Confira as permissões dos volumes.';
  else if (code === 'ENOENT') reason = 'Um arquivo necessário não foi encontrado durante a operação. Confira o console e o estado da instalação.';
  else if (code === 'EXDEV' || code === 'EBUSY') reason = 'A hospedagem não permitiu trocar o diretório de dependências. Ele pode estar em um volume separado ou em uso.';
  else if (code === 'EROFS') reason = 'A instalação ou um volume está somente para leitura.';
  else if (code === 'ENOMEM') reason = 'Memória insuficiente para instalar as dependências.';
  else if (status === 403 || status === 429) reason = 'O GitHub limitou ou recusou o acesso deste servidor. Aguarde e tente novamente.';
  else if (status === 404) reason = 'O GitHub não encontrou um arquivo ou referência necessário à atualização.';
  else if (['ENOTFOUND','ETIMEDOUT','ECONNRESET'].includes(code)) reason = 'Falha de rede ao acessar o GitHub ou o registro npm.';
  else if (stage === 'instalação de dependências') reason = 'O npm não conseguiu instalar as dependências. Consulte o erro npm no console da hospedagem.';
  else if (stage === 'verificação de inicialização') reason = 'A versão preparada falhou na verificação de inicialização; ela não foi aplicada.';
  return { stage, code: code || (status ? 'HTTP_' + status : 'UPDATE_FAILED'), reason };
}

async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function readJSON(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
async function safeTarget(root, name) {
  const parts = name.split('/');
  if (path.isAbsolute(name) || parts.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) throw new UpdateError('Caminho de atualização inválido.');
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new UpdateError('A atualização não pode substituir atalhos de pastas ou arquivos.'); }
    catch (e) { if (e.code === 'ENOENT') break; throw e; }
  }
  return path.join(root, ...parts);
}
async function atomicWrite(file, data, mode = 0o644) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { const handle = await fs.open(temporary, 'wx', mode); try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); } await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
function githubRepository(value) {
  try {
    const url = new URL(String(value || '').replace(/^git\+/, '').replace(/^git@github.com:/, 'https://github.com/'));
    return url.hostname === 'github.com' && /^\/WhiskeySockets\/Baileys(?:\.git)?$/i.test(url.pathname);
  } catch { return false; }
}
function childEnvironment() {
  const env = { ...process.env };
  const count = Number(env.GIT_CONFIG_COUNT || 0);
  if (!Number.isInteger(count) || count < 0 || count > 100) throw new UpdateError('Configuração do Git inválida no servidor.');
  for (const [i, value] of ['ssh://git@github.com/', 'git@github.com:'].entries()) {
    env[`GIT_CONFIG_KEY_${count + i}`] = 'url.https://github.com/.insteadOf';
    env[`GIT_CONFIG_VALUE_${count + i}`] = value;
  }
  env.GIT_CONFIG_COUNT = String(count + 2);
  return env;
}

class UpdateService {
  constructor({ root = path.resolve(__dirname, '../..'), snapshot = githubSnapshot, run = execute,
    nodeVersion = process.versions.node, logger = console } = {}) {
    this.root = path.resolve(root); this.snapshot = snapshot; this.run = run;
    this.nodeVersion = nodeVersion; this.logger = logger; this.running = false; this.needsRestart = false;
    this.directory = path.join(this.root, 'updates');
  }
  async status() {
    const pkg = await readJSON(path.join(this.root, 'package.json'));
    const installed = await readJSON(path.join(this.root, 'node_modules/@whiskeysockets/baileys/package.json'));
    const last = await readJSON(path.join(this.directory, 'state.json'));
    return { version: pkg.version, node: this.nodeVersion,
      baileys: installed?.version || pkg.dependencies?.['@whiskeysockets/baileys'] || 'não identificado',
      active: this.running, needsRestart: this.needsRestart, last };
  }
  async update(action) {
    if (!['bot', 'baileys'].includes(action)) throw new UpdateError('Use atualizar bot ou atualizar baileys.');
    if (this.running) throw new UpdateError('Já existe uma atualização em andamento.', 'BUSY');
    if (this.needsRestart) throw new UpdateError('Reinicie o bot pelo painel antes de outra atualização.', 'RESTART_REQUIRED');
    this.running = true;
    let lock, stage, phase = 'preparação';
    const lockPath = path.join(this.directory, 'update.lock');
    try {
      if (!semver.satisfies(this.nodeVersion, '>=22.12.0')) throw new UpdateError('Configure Node.js 22.12 ou superior no painel do servidor.');
      await safeTarget(this.root, 'updates'); await fs.mkdir(this.directory, { recursive: true });
      try { lock = await fs.open(lockPath, 'wx'); }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        const previous = await readJSON(lockPath);
        let alive = true;
        if (Number.isInteger(previous?.pid) && previous.pid > 0) {
          try { process.kill(previous.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
        }
        if (alive) throw new UpdateError('Outra instância está atualizando o bot.', 'BUSY');
        throw new UpdateError('Uma atualização anterior foi interrompida. Confira o backup e remova updates/update.lock pelo painel antes de tentar novamente.', 'STALE_LOCK');
      }
      await lock.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
      stage = await fs.mkdtemp(path.join(this.directory, 'stage-'));
      let files, sha = null, targetVersion;
      if (action === 'bot') {
        phase = 'consulta ao GitHub';
        const source = await this.snapshot(); sha = source.sha;
        const previous = await readJSON(path.join(this.directory, 'state.json'));
        // Reaplicar o snapshot também repara arquivos locais alterados no mesmo commit.
        files = source.files;
        phase = 'download dos arquivos';
        let bytes = 0, cursor = 0;
        const downloads = await Promise.allSettled(Array.from({ length: 4 }, async () => {
          while (cursor < files.length) {
            const item = files[cursor++];
            if (!managedPath(item.path)) throw new UpdateError('Arquivo protegido no manifesto.');
            const data = await source.download(item); bytes += data.length;
            if (bytes > 15 * 1024 * 1024) throw new UpdateError('A atualização excede o limite de tamanho.');
            await atomicWrite(path.join(stage, item.path), data, item.mode === '100755' ? 0o755 : 0o644);
          }
        }));
        const failed = downloads.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      } else {
        const result = await this._run('npm', ['view', 'baileys@latest', 'version', 'engines', 'repository', 'deprecated', '--json'], this.root);
        const latest = JSON.parse(result.stdout);
        if (!semver.valid(latest.version) || !githubRepository(latest.repository?.url) || latest.deprecated) throw new UpdateError('Não consegui validar a versão oficial do Baileys.');
        if (!semver.satisfies(this.nodeVersion, latest.engines?.node || '*')) throw new UpdateError('O Baileys mais recente exige outra versão do Node. Atualize o Node pelo painel primeiro.');
        const current = await this.status();
        if (semver.valid(current.baileys) && semver.gte(current.baileys, latest.version)) return { already: true, action, version: current.baileys };
        await this._copyCode(stage);
        const pkg = await readJSON(path.join(stage, 'package.json'));
        pkg.dependencies['@whiskeysockets/baileys'] = `npm:baileys@${latest.version}`;
        await atomicWrite(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
        await this._run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], stage);
        targetVersion = latest.version;
        files = [{ path: 'package.json' }, { path: 'package-lock.json' }];
      }
      const pkg = await readJSON(path.join(stage, 'package.json'));
      if (pkg?.name !== 'lobo-bot' || !semver.valid(pkg.version) || !semver.satisfies(this.nodeVersion, pkg.engines?.node || '>=22.12.0')) {
        throw new UpdateError('Esta atualização do bot não é compatível com o Node do servidor.');
      }
      // Prefer HTTPS for the public libsignal repository on restricted hosting.
      const lockfile = await readJSON(path.join(stage, 'package-lock.json'));
      if (!lockfile?.packages?.['']) throw new UpdateError('A atualização não contém um lockfile válido.');
      for (const value of Object.values(lockfile.packages)) if (value.resolved?.startsWith('git+ssh://git@github.com/')) value.resolved = value.resolved.replace('git+ssh://git@github.com/', 'git+https://github.com/');
      await atomicWrite(path.join(stage, 'package-lock.json'), JSON.stringify(lockfile, null, 2) + '\n');
      // Reutilizar a instalação verificada quando só o código mudou evita downloads
      // e compilações desnecessários em hospedagens com recursos limitados.
      const graph = lock => {
        if (!lock?.packages) return null;
        const packages = structuredClone(lock.packages);
        if (packages['']) { delete packages[''].version; delete packages[''].name; }
        return JSON.stringify(packages);
      };
      const installedLock = await readJSON(path.join(this.root, 'package-lock.json'));
      let reuseDependencies = action === 'bot' && graph(installedLock) === graph(lockfile) &&
        await exists(path.join(this.root, 'node_modules'));
      if (reuseDependencies) {
        await fs.symlink(path.join(this.root, 'node_modules'), path.join(stage, 'node_modules'), 'dir');
        try { phase = 'verificação de inicialização'; await this._run(process.execPath, ['scripts/check-startup.js'], stage); }
        catch { await fs.unlink(path.join(stage, 'node_modules')); reuseDependencies = false; }
      }
      if (!reuseDependencies) {
        phase = 'instalação de dependências';
        await this._run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], stage);
        phase = 'verificação de inicialização';
        await this._run(process.execPath, ['scripts/check-startup.js'], stage);
      }
      phase = 'verificação de sintaxe';
      await this._run('npm', ['run', 'check:syntax'], stage);
      phase = 'testes críticos';
      await this._run('npm', ['test'], stage);
      phase = 'backup e aplicação';
      const result = await this._apply(stage, files, { action, sha, version: targetVersion || pkg.version, reuseDependencies });
      this.needsRestart = true;
      return result;
    } catch (error) {
      if (error instanceof UpdateError) throw error;
      const diagnostic = describeFailure(error, phase);
      this.logger.error?.(diagnostic, 'Falha na atualização do bot.');
      await atomicWrite(path.join(this.directory, 'last-error.json'), JSON.stringify({ ...diagnostic, at: new Date().toISOString() }), 0o600).catch(() => {});
      throw new UpdateError(`Etapa: ${diagnostic.stage}. Código: ${diagnostic.code}. ${diagnostic.reason} Os arquivos anteriores foram preservados.`, diagnostic.code);
    } finally {
      if (stage) await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
      if (lock) { await lock.close().catch(() => {}); await fs.rm(lockPath, { force: true }).catch(() => {}); }
      this.running = false;
    }
  }
  async _run(command, args, cwd) {
    return this.run(command === 'npm' && process.platform === 'win32' ? 'npm.cmd' : command, args,
      { cwd, env: childEnvironment(), shell: false, encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  }
  async _copyCode(stage) {
    const copy = async name => {
      const from = await safeTarget(this.root, name);
      if (!await exists(from)) return;
      const info = await fs.lstat(from);
      if (info.isDirectory()) {
        for (const child of await fs.readdir(from)) if (!['node_modules', 'data', 'sessions', 'auth', 'storage', 'logs', 'backups', 'updates', '.git'].includes(child)) await copy(`${name}/${child}`);
      } else if (info.isFile() && managedPath(name)) {
        await atomicWrite(path.join(stage, name), await fs.readFile(from));
      }
    };
    for (const name of [...ROOT_FILES, ...ROOT_DIRS]) await copy(name);
  }
  async _apply(stage, files, result) {
    const previous = await readJSON(path.join(this.directory, 'state.json'));
    const incoming = new Set(files.map(f => f.path));
    const removed = result.action === 'bot' ? (previous?.files || []).filter(name => managedPath(name) && !incoming.has(name)) : [];
    const names = [...incoming, ...removed];
    const backup = path.join(this.directory, `backup-${Date.now()}-${randomUUID()}`);
    try {
      await fs.mkdir(backup, { mode: 0o700 });
      await require('./data-backup').backupData(this.root, path.join(backup, 'protected-data'));
    } catch (error) { error.updateStage = 'backup dos dados e sessão'; throw error; }
    const saved = [];
    let oldModules = false, newModules = false, applyStep = 'backup dos arquivos de código';
    const modules = await safeTarget(this.root, 'node_modules');
    try {
      for (const name of names) {
        if (!managedPath(name)) throw new UpdateError('Arquivo protegido na atualização.');
        const target = await safeTarget(this.root, name);
        const present = await exists(target);
        if (present) {
          if (!(await fs.lstat(target)).isFile()) throw new UpdateError('O destino da atualização não é um arquivo.');
          await atomicWrite(path.join(backup, name), await fs.readFile(target));
        }
        saved.push({ name, present, sha256: present ? require('node:crypto').createHash('sha256').update(await fs.readFile(target)).digest('hex') : null, mode: present ? (await fs.stat(target)).mode & 0o777 : 0o644 });
      }
      await atomicWrite(path.join(this.directory, 'apply-journal.json'), JSON.stringify({ backup: path.basename(backup), saved, previous, hadModules: await exists(modules), reuseDependencies: result.reuseDependencies }), 0o600);
      if (!result.reuseDependencies) {
        applyStep = 'troca de dependências';
        if (await exists(modules)) { await fs.rename(modules, path.join(backup, 'node_modules')); oldModules = true; }
        await fs.rename(path.join(stage, 'node_modules'), modules); newModules = true;
      }
      applyStep = 'aplicação dos arquivos de código';
      for (const file of files) {
        await atomicWrite(await safeTarget(this.root, file.path), await fs.readFile(path.join(stage, file.path)), file.mode === '100755' ? 0o755 : 0o644);
      }
      for (const name of removed) await fs.rm(await safeTarget(this.root, name), { force: true });
      applyStep = 'registro da atualização';
      const state = { ...result, at: new Date().toISOString(), backup: path.basename(backup),
        sha: result.sha || previous?.sha || null,
        files: result.action === 'bot' ? [...incoming] : previous?.files || [] };
      await atomicWrite(path.join(this.directory, 'state.json'), JSON.stringify(state));
      await fs.rm(path.join(this.directory, 'apply-journal.json'), { force: true });
    } catch (error) {
      error.updateStage = applyStep;
      try {
        for (const { name, present, mode } of saved) {
          const target = await safeTarget(this.root, name);
          if (present) await atomicWrite(target, await fs.readFile(path.join(backup, name)), mode);
          else await fs.rm(target, { force: true });
        }
        if (newModules) await fs.rm(modules, { recursive: true, force: true });
        if (oldModules) await fs.rename(path.join(backup, 'node_modules'), modules);
        await fs.rm(path.join(this.directory, 'apply-journal.json'), { force: true });
      } catch (rollback) {
        this.logger.error?.({ error: rollback.message, backup }, 'Restauração manual necessária.');
        throw new UpdateError('Não consegui concluir a restauração. Pare o bot e restaure o backup em updates/.', 'ROLLBACK_FAILED');
      }
      throw error;
    }
    // Code + lock remain backed up; old dependencies can be recreated with npm ci.
    await fs.rm(path.join(backup, 'node_modules'), { recursive: true, force: true }).catch(() => {});
    return { ...result, backup: path.basename(backup), needsRestart: true };
  }
}
module.exports = { UpdateService, UpdateError, safeTarget, githubRepository, describeFailure };
