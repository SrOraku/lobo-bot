'use strict';
const { ensureDependencies } = require('./bootstrap');
if (!ensureDependencies()) process.exit(1);
require('dotenv').config();

// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — PONTO DE ENTRADA PRINCIPAL
// Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
// +5543920030769
// ============================================================

const pino      = require('pino');
const path      = require('path');
const fs        = require('fs');
const readline  = require('readline');
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

let sock              = null;
let reconnectAttempts = 0;
const MAX_RECONNECT   = config.getNumber('MAX_RECONNECT') || 10;

// ============================================================
// HELPER: PERGUNTAR NO TERMINAL
// ============================================================
function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans.trim()); }));
}

// ============================================================
// INICIAR BOT
// ============================================================
async function startBot() {
  const baileys = await loadBaileys();
  const makeWASocket = baileys.default || baileys.makeWASocket;
  const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
  } = baileys;

  if (typeof makeWASocket !== 'function') {
    throw new Error('Baileys 7 não carregou makeWASocket corretamente.');
  }

  printBanner();
  logger.info(`🐺 Iniciando ${BOT_NAME}...`);

  // Redis
  await cache.initRedis();

  // Carregar todos os comandos no registry
  loadAllCommands();
  logger.info('🗡️  Comandos carregados no registry');

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`📦 Baileys v${version.join('.')} | Atualizado: ${isLatest}`);

  const jaConectado = !!state.creds?.registered;
  const silentLogger = pino({ level: 'silent' });

  sock = makeWASocket({
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

  store.bind(sock.ev);

  // ── Carregar plugins após socket criado ──────────────────
  await loadAllPlugins(sock);
  require('./activations/store').getStore().preload();

  // ============================================================
  // PAIR CODE — apenas na primeira vez
  // ============================================================
  if (!jaConectado) {
    await sleep(2000);

    // Sempre escolher no console: o dono e configurações antigas não são o alvo.
    const numero = await require('./utils/pairing-number').choosePairingNumber(askQuestion);

    try {
      const code = await sock.requestPairingCode(numero);
      const fmt  = code?.match(/.{1,4}/g)?.join('-') || code;

      console.log(`
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
      logger.error(`❌ Erro ao gerar código: ${err.message}`);
      logger.info('💡 Dica: confirme que o número está correto e tente novamente.');
      process.exit(1);
    }
  }

  // ============================================================
  // EVENTOS DO SOCKET
  // ============================================================

  // ── Conexão ─────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const code         = lastDisconnect?.error?.output?.statusCode;
      const shouldReconn = code !== DisconnectReason.loggedOut;

      logger.warn(`🔴 Conexão encerrada | código: ${code} | reconectar: ${shouldReconn}`);

      if (shouldReconn && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        const delay = Math.min(reconnectAttempts * 3000, 30_000);
        logger.info(`🔄 Tentativa ${reconnectAttempts}/${MAX_RECONNECT} em ${delay / 1000}s...`);
        await sleep(delay);
        return startBot();
      }

      if (code === DisconnectReason.loggedOut) {
        logger.error('❌ Sessão encerrada! Delete a pasta sessions/ e reinicie.');
      } else {
        logger.error('❌ Máximo de reconexões atingido. Encerrando.');
      }
      process.exit(1);

    } else if (connection === 'open') {
      reconnectAttempts = 0;
      const user = sock.user;
      logger.info(`✅ Conectado como: ${user?.name || user?.id}`);
      logger.info(`🌹 ${BOT_NAME} online e pronto!`);

      // Aplicar automaticamente a descrição/Sobre configurada do bot
      const botDescription = config.get('BOT_DESCRIPTION');
      if (botDescription && typeof sock.updateProfileStatus === 'function') {
        await sock.updateProfileStatus(botDescription)
          .then(() => logger.info('📝 Descrição do WhatsApp atualizada.'))
          .catch((err) => logger.warn(`⚠️ Não foi possível atualizar a descrição: ${err.message}`));
      }

      bus.emit(EVENTS.BOT_READY, { user });

      console.log(require('./menus/render').connectionNotice());

      // Notificar dono
      const ownerJid = config.get('BOT_OWNER');
      if (ownerJid) {
        await sock.sendMessage(`${ownerJid}@s.whatsapp.net`, {
          text: require('./menus/render').connectionNotice()
        }).catch(() => {});
      }
    }
  });

  // ── Credenciais ─────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Mensagens ────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (!msg.message) continue;

      if (type !== 'notify') continue;
      setImmediate(() =>
        handleMessage(sock, msg).catch(err => logger.error({ err }, '❌ handleMessage'))
      );
    }
  });

  // ── Participantes de grupo ───────────────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    setImmediate(() =>
      handleGroupParticipantsUpdate(sock, update).catch(err => logger.error({ err }, '❌ groupParticipants'))
    );
  });

  // ── Grupos atualizados ───────────────────────────────────────
  sock.ev.on('groups.update', async (updates) => {
    setImmediate(() =>
      handleGroupsUpdate(sock, updates).catch(err => logger.error({ err }, '❌ groupsUpdate'))
    );
  });

  return sock;
}

// ============================================================
// TRATAMENTO DE ERROS GLOBAIS
// ============================================================
process.on('uncaughtException',  (err) => logger.error({ err }, '❌ uncaughtException'));
process.on('unhandledRejection', (err) => logger.error({ err }, '❌ unhandledRejection'));

process.on('SIGINT', async () => {
  logger.info('🛑 Encerrando bot (SIGINT)...');
  try { await sock?.end(); } catch {}
  try { db.db.close();     } catch {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Encerrando bot (SIGTERM)...');
  try { await sock?.end(); } catch {}
  try { db.db.close();     } catch {}
  process.exit(0);
});

// ============================================================
// INICIAR
// ============================================================
startBot().catch((err) => {
  logger.error({ err }, '❌ Falha crítica ao iniciar o bot');
  process.exit(1);
});
