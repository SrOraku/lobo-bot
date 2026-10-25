'use strict';
const { ensureDependencies } = require('./bootstrap');
if (!ensureDependencies()) process.exit(1);
require('dotenv').config();
const terminal = require('./utils/quiet-console').installQuietConsole();

// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — PONTO DE ENTRADA PRINCIPAL
// Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
// +5543920030769
// ============================================================

const path      = require('path');
const fs        = require('fs');
const { CacheMessageStore } = require('./utils/message-store');

// Baileys 7 é ESM. O restante do Lobo-bot continua CommonJS,
// então carregamos o módulo oficialmente via import() dinâmico.
let baileysModulePromise = null;
function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys');
  }
  return baileysModulePromise;
}

// ── Utils & Config ──────────────────────────────────────────
const { printBanner, logger, BOT_NAME, OWNER, sleep } = require('./utils/helpers');
const config    = require('./config');
require('./config/expansion').load();
require('./utils/temp-files').start();
const db        = require('./utils/database');
const cache     = require('./utils/cache');

// ── Core ────────────────────────────────────────────────────
const { bus, EVENTS }       = require('./core/eventBus');
const { loadAllCommands }   = require('./handlers/commands');
const { loadAllPlugins }    = require('./core/pluginLoader');

// ── Handlers ────────────────────────────────────────────────
const { handleMessage }     = require('./handlers/message');
const { handleGroupParticipantsUpdate, handleGroupsUpdate } = require('./handlers/groupEvents');

// ── Validar config ──────────────────────────────────────────
const validation = config.validate();
if (validation.warnings.length) validation.warnings.forEach(w => logger.warn(w));
if (!validation.ok) {
  validation.errors.forEach(e => logger.error(e));
  logger.error('❌ Corrija o arquivo .env antes de iniciar!');
  process.exit(1);
}

// Cache limitado, independente da versão do Baileys.
const store = new CacheMessageStore();

const SESSION_DIR = path.join(__dirname, '../sessions', config.get('SESSION_NAME'));
fs.mkdirSync(SESSION_DIR, { recursive: true });

const { hasSavedSession, resetIncompletePairing, createLifecycle } = require('./connection/lifecycle');
const { logConnection, baileysLogger } = require('./config/logger');
let commonReady = null, pairingNumberPromise = null, shuttingDown = false;
const configuredReconnect = config.getNumber('MAX_RECONNECT');
const MAX_RECONNECT = Number.isInteger(configuredReconnect) ? Math.max(0, Math.min(100, configuredReconnect)) : 10;
const lifecycle = createLifecycle({
  maxReconnect: MAX_RECONNECT,
  reconnect: () => startBot(),
  onState: state => logConnection(state.code === 515
    ? 'WhatsApp solicitou reinício (515). Reconectando com as credenciais salvas.'
    : `Reconectando ao WhatsApp: tentativa ${state.attempt}/${MAX_RECONNECT} em ${state.delay / 1000}s.`, state),
  onError: (error, code) => logger.error({ component: 'connection', code: error.code || code }, 'Falha no ciclo de conexão; a sessão foi preservada.'),
  onFatal: code => {
    logger.error({ component: 'connection', code }, code === 'LOGGED_OUT'
      ? 'Sessão desvinculada pelo WhatsApp. Preserve sessions/ e confira os aparelhos conectados.'
      : 'Não foi possível reconectar com segurança. O supervisor poderá reiniciar o processo.');
    process.exit(1);
  },
});

// ============================================================
// HELPER: PERGUNTAR NO TERMINAL
// ============================================================
function askQuestion(query) {
  return require('./utils/terminal-input').askConsole(query);
}

// ============================================================
// INICIAR BOT
// ============================================================
async function startBot() {
  const baileys = await loadBaileys();
  const makeWASocket = baileys.default || baileys.makeWASocket;
  const {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
  } = baileys;

  if (typeof makeWASocket !== 'function') {
    throw new Error('Baileys 7 não carregou makeWASocket corretamente.');
  }

  if (!commonReady) commonReady = (async () => {
    printBanner();
    await cache.initRedis();
    loadAllCommands();
    require('./activations/store').getStore().preload();
  })();
  await commonReady;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  if (resetIncompletePairing(state.creds)) {
    await saveCreds();
    logConnection('Pareamento anterior incompleto. Preparando uma nova tentativa com as chaves existentes.');
  }
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`📦 Baileys v${version.join('.')} | Atualizado: ${isLatest}`);

  const jaConectado = hasSavedSession(state.creds);
  const silentLogger = baileysLogger();

  const currentSocket = makeWASocket({
    version,
    logger: silentLogger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 30_000,
    keepAliveIntervalMs: 10_000,
    retryRequestDelayMs: 2_000,
    getMessage: async (key) => {
      const message = await store.loadMessage(key.remoteJid, key.id);
      return message?.message;
    },
  });

  let pluginsReady = Promise.resolve();
  const session = lifecycle.attach(currentSocket, { saveCreds, beforeReconnect: () => pluginsReady, onOpen: async () => {
    await pluginsReady;
    if (!session.isActive()) return;
    require('./games/gartic').gartic().resume(currentSocket);
    const user = currentSocket.user;
    const botDescription = config.get('BOT_DESCRIPTION');
    if (botDescription && typeof currentSocket.updateProfileStatus === 'function') {
      await currentSocket.updateProfileStatus(botDescription).catch(error => logger.warn({ code: error.code || 'PROFILE_STATUS_FAILED' }, 'Não foi possível atualizar a descrição do WhatsApp.'));
    }
    if (!session.isActive()) return;
    bus.emit(EVENTS.BOT_READY, { user });
    logConnection('ONLINE — WhatsApp conectado. Acompanhando os comandos dos grupos.');
    terminal.interactive(require('./menus/render').connectionNotice());
    if (process.connected) process.send({ type: 'lobo:ready' });
    require('./utils/file-log').record('bot', { result: 'runtime_ready' });
    const ownerJid = config.get('BOT_OWNER');
    if (ownerJid) await currentSocket.sendMessage(`${ownerJid}@s.whatsapp.net`, { text: require('./menus/render').connectionNotice() }).catch(() => {});
  } });
  store.bind(currentSocket.ev);

  // ============================================================
  // EVENTOS DO SOCKET
  // ============================================================

  // ── Mensagens ────────────────────────────────────────────────
  session.listen('messages.update',updates=>{require('./security/groups/service').security().engine.edits(currentSocket,updates,(jid,id)=>store.loadMessage(jid,id)).catch(error=>logger.error({component:'security',code:error.code||'EDIT_EVENT_FAILED'},'Falha no evento de edição.'));});
  session.listen('messages.upsert', async ({ messages, type }) => {
    await pluginsReady;
    if (!session.isActive()) return;
    for (const msg of messages) {
      if(type==='notify'&&msg.messageStubType===(await loadBaileys()).WAMessageStubType.GROUP_CHANGE_ICON)require('./security/groups/service').security().engine.picture(currentSocket,msg).catch(error=>logger.error({component:'security',code:error.code||'PICTURE_EVENT_FAILED'},'Falha no evento de foto.'));
      if (!msg.message) continue;

      if (type !== 'notify') continue;
      setImmediate(() =>
        session.isActive() && handleMessage(currentSocket, msg).catch(err => logger.error({ err }, '❌ handleMessage'))
      );
    }
  });

  // ── Participantes de grupo ───────────────────────────────────
  session.listen('group-participants.update', async (update) => {
    setImmediate(() =>
      session.isActive() && handleGroupParticipantsUpdate(currentSocket, update).catch(err => logger.error({ err }, '❌ groupParticipants'))
    );
  });

  // ── Grupos atualizados ───────────────────────────────────────
  session.listen('groups.update', async (updates) => {
    setImmediate(() =>
      session.isActive() && handleGroupsUpdate(currentSocket, updates).catch(err => logger.error({ err }, '❌ groupsUpdate'))
    );
  });

  pluginsReady = loadAllPlugins(currentSocket);
  await pluginsReady;
  // ============================================================
  // PAIR CODE — apenas na primeira vez
  // ============================================================
  if (!jaConectado) {
    await sleep(2000);

    // Sempre escolher no console: o dono e configurações antigas não são o alvo.
    if (!session.isActive() || hasSavedSession(state.creds)) return currentSocket;
    if (!pairingNumberPromise) pairingNumberPromise = require('./utils/pairing-number').choosePairingNumber(askQuestion);
    const numero = await pairingNumberPromise;
    if (!session.isActive() || hasSavedSession(state.creds)) return currentSocket;

    try {
      const code = await currentSocket.requestPairingCode(numero);
      if (!session.isActive()) return currentSocket;
      const fmt  = code?.match(/.{1,4}/g)?.join('-') || code;

      terminal.interactive(`
🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹

         🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑

╔═══════════════════════════════════╗
║   🔑 CÓDIGO DE PAREAMENTO LOBO-BOT ║
╚═══════════════════════════════════╝

           ✨  ${fmt}  ✨

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 WhatsApp escolhido para conectar: +${numero}
👑 Dono do bot: +5543920030769

📱 Como usar no WhatsApp:
   1. Abra o WhatsApp
   2. Configurações → Aparelhos Conectados
   3. Conectar Aparelho
   4. "Conectar com número de telefone"
   5. Digite o código acima
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ O código expira em 60 segundos!
   Reinicie o bot se expirar.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👨‍💻 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
📞 Contato do desenvolvedor: +5543920030769

🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹
`);
    } catch (err) {
      if (!session.isActive()) return currentSocket;
      logger.error({ component: 'connection', code: err.code || 'PAIRING_CODE_FAILED' }, 'Não foi possível gerar o código. Confira o número escolhido e a conexão.');
      throw err;
    }
  }


  return currentSocket;
}

// ============================================================
// TRATAMENTO DE ERROS GLOBAIS
// ============================================================
process.on('uncaughtException',err=>{require('./utils/file-log').record('error',{code:err.code||'UNCAUGHT',message:err.message,stack:err.stack});logger.error({code:err.code||'UNCAUGHT'},'Erro fatal; o supervisor reiniciará o runtime.');process.exit(1);});
process.on('unhandledRejection',err=>{require('./utils/file-log').record('error',{code:'UNHANDLED_REJECTION',message:err?.message,stack:err?.stack});process.exit(1);});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logConnection(`Encerrando conexão (${signal}). Preservando a sessão.`);
  try { await lifecycle.stop(); } catch (error) { logger.error({ code: error.code || 'SHUTDOWN_CREDS_FAILED' }, 'Não foi possível concluir o salvamento da sessão.'); }
  for (const plugin of require('./core/pluginLoader').loadedPlugins.values()) {
    try { await plugin.onUnload?.(); } catch (error) { logger.error({ code: error.code || error.name }, 'Falha ao finalizar plugin.'); }
  }
  store.destroy();
  try { db.db.close(); } catch { /* Database may already be closed after a fatal error. */ }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ============================================================
// INICIAR
// ============================================================
startBot().catch((err) => {
  logger.error({ component: 'connection', code: err.code || 'START_FAILED' }, 'Falha crítica ao iniciar o bot; a sessão foi preservada.');
  process.exit(1);
});
