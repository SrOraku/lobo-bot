'use strict';
// Guardião da licença: decide se esta instalação pode iniciar e continuar rodando.
//
// - Com chave (LOBO_LICENSE_KEY): registra, valida e autoriza no painel antes
//   de iniciar; depois confere a cada 15 minutos. Negação explícita encerra o
//   bot; falha de comunicação usa a tolerância de 24 h desde a última confirmação.
// - Sem chave: a licença é obrigatória. A instalação ganha um período de aviso
//   de 7 dias a partir do primeiro início sem chave e depois não inicia mais.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const defaultClient = require('./licenseClient');
const { DAY_MS } = require('./messages');

const HEARTBEAT_MS = 15 * 60 * 1000;
const NOTICE_DAYS = 7;
// Fim da transição. O aviso de 7 dias existe para quem já usava o bot sem
// chave; a partir desta data ele deixa de existir para todos. Assim, apagar
// os arquivos de data/ para "zerar" o prazo não adia o bloqueio além dela.
const NOTICE_ENDS_AT = Date.parse('2026-12-10T03:00:00.000Z'); // 10/12/2026, 00:00 em Brasília

function failure(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

function createGuard({
  dataDir = path.resolve(__dirname, '../../data'),
  client = defaultClient,
  now = Date.now,
  noticeEndsAt = NOTICE_ENDS_AT,
  hostname = () => os.hostname(),
  version = () => require('../../package.json').version,
} = {}) {
  const INSTALL_FILE = path.join(dataDir, 'lobo-license-installation.json');
  const STATE_FILE = path.join(dataDir, 'lobo-license-state.json');

  function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { return {}; }
  }
  function writeJson(file, value) {
    fs.mkdirSync(dataDir, { recursive: true });
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
    try { fs.chmodSync(temp, 0o600); } catch {}
    fs.renameSync(temp, file);
  }
  // O estado é sempre mesclado: confirmar a licença não apaga o início do aviso.
  function saveState(patch) { writeJson(STATE_FILE, { ...readJson(STATE_FILE), ...patch }); }

  function installationId() {
    const saved = readJson(INSTALL_FILE);
    if (typeof saved.id === 'string' && /^[a-f0-9-]{20,64}$/i.test(saved.id)) return saved.id;
    const id = randomUUID().replace(/-/g, '');
    writeJson(INSTALL_FILE, { id });
    return id;
  }
  function allowed(result) { return result && result.ok === true && result.authorized === true; }
  function deny(result) {
    throw failure('LOBO_LICENSE_DENIED', { reason: String(result?.motivo || result?.error || 'licenca_nao_autorizada').slice(0, 80) });
  }
  function recordSuccess() { saveState({ lastAuthorizedAt: now() }); }
  function useGrace(error) {
    if (!error.communication) throw error;
    const last = Number(readJson(STATE_FILE).lastAuthorizedAt || 0);
    if (!last || now() - last > client.GRACE_MS) throw failure('LOBO_LICENSE_GRACE_EXPIRED');
    return true;
  }

  // Período de aviso de uma instalação sem chave. Lança LOBO_LICENSE_REQUIRED
  // quando ele terminou.
  function noticePeriod() {
    const current = now();
    let started = Number(readJson(STATE_FILE).noticeStartedAt) || 0;
    if (!started || started > current) {
      started = current;
      // Sem permissão de escrita em data/, o prazo individual não é guardado,
      // mas o fim da transição (noticeEndsAt) continua valendo.
      try { saveState({ noticeStartedAt: started }); } catch {}
    }
    const deadline = Math.min(started + NOTICE_DAYS * DAY_MS, noticeEndsAt);
    if (current >= deadline) throw failure('LOBO_LICENSE_REQUIRED', { deadline });
    return { deadline, daysLeft: Math.ceil((deadline - current) / DAY_MS) };
  }

  async function authorizeStartup() {
    if (!client.configured()) return { enabled: false, notice: noticePeriod() };
    client.validateConfig();
    const id = installationId();
    const meta = { installation_id: id, hostname: String(hostname()).slice(0, 120), version: version() };
    try {
      const registered = await client.request('register_installation', meta);
      if (!allowed(registered)) deny(registered);
      const validated = await client.request('validate', { installation_id: id });
      if (!allowed(validated)) deny(validated);
      const pairing = await client.request('authorize_pairing', { installation_id: id });
      if (!allowed(pairing)) deny(pairing);
      // Grace is refreshed only after the complete startup authorization flow succeeds.
      recordSuccess();
      return { enabled: true, installationId: id };
    } catch (error) {
      useGrace(error);
      return { enabled: true, installationId: id, grace: true };
    }
  }

  // Confere a licença periodicamente. onDenied(motivo, erro) é chamado uma vez
  // por negação; quem chama é responsável por encerrar o bot.
  function startHeartbeat({ onDenied = () => process.exit(1), log = () => {}, every = HEARTBEAT_MS, schedule = setInterval, cancel = clearInterval } = {}) {
    if (!client.configured()) return () => {};
    let running = false;
    const timer = schedule(async () => {
      if (running) return;
      running = true;
      try {
        const id = installationId();
        const result = await client.request('heartbeat', { installation_id: id });
        if (!allowed(result)) {
          log('LOBO_LICENSE_DENIED');
          onDenied(String(result?.motivo || 'licenca_nao_autorizada').slice(0, 80), failure('LOBO_LICENSE_DENIED', { reason: result?.motivo }));
          return;
        }
        recordSuccess();
      } catch (error) {
        try { useGrace(error); }
        catch (denied) { log(denied.code || 'LOBO_LICENSE_ERROR'); onDenied(denied.reason || denied.code, denied); }
      } finally { running = false; }
    }, every);
    timer?.unref?.();
    return () => cancel(timer);
  }

  // Encerra o bot quando o período de aviso termina com ele ligado.
  function watchNotice({ deadline, onExpired, schedule = setTimeout, cancel = clearTimeout } = {}) {
    const timer = schedule(() => onExpired(failure('LOBO_LICENSE_REQUIRED', { deadline })), Math.max(0, Number(deadline) - now()));
    timer?.unref?.();
    return () => cancel(timer);
  }

  return { authorizeStartup, startHeartbeat, watchNotice, installationId, noticePeriod };
}

module.exports = { ...createGuard(), createGuard, HEARTBEAT_MS, NOTICE_DAYS, NOTICE_ENDS_AT };
