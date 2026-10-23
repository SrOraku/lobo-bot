'use strict';

// Additive integration: never starts a WhatsApp socket or changes legacy data.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIRECT_COMMANDS = Object.freeze([
  'start', 'treino', 'formacao', 'ataque', 'rank', 'clan', 'evento', 'admin',
  'rp', 'profissoes', 'profissao', 'trabalhar', 'acao', 'carteira', 'transferir',
  'rploja', 'rpcomprar', 'usar', 'inventario', 'familia',
]);
const DISTINCT_ALIASES = Object.freeze({
  perfilalcateia: 'perfil', lojaalcateia: 'loja', compraralcateia: 'comprar',
});

function textReply(sock, ctx, text) {
  return sock.sendMessage(ctx.msg?.key?.remoteJid || ctx.jid, { text }, { quoted: ctx.msg });
}

function getConfig(config, key) {
  return typeof config?.get === 'function' ? config.get(key) : config?.[key];
}

function enabled(value) { return value === true || value === 1 || value === '1'; }

function rewrittenText(value, prefix = '!') {
  let result = String(value);
  // Domain validation messages still contain the default prefix. Keep every
  // displayed command usable, including the three names owned by the old bot.
  const routeNames = new Set([...DIRECT_COMMANDS, ...Object.values(DISTINCT_ALIASES), 'alcateia']);
  const prefixes = [...new Set(['!', prefix])].sort((a, b) => b.length - a.length);
  const choices = prefixes.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?:${choices.join('|')})([a-z][a-z0-9]*)(?![\\p{L}\\p{N}_])`, 'gu');
  result = result.replace(pattern, (original, command) => {
    if (!routeNames.has(command)) return original;
    const alias = Object.entries(DISTINCT_ALIASES).find(([, target]) => target === command)?.[0];
    return `${prefix}${alias || command}`;
  });
  return result;
}

/** Build trusted addon contexts without importing or running the legacy bot. */
function createAdapter({ modules, db, config, logger = console, startedAt = Date.now(), runInBackground }) {
  return async function adapt(sock, ctx, route) {
    const key = ctx.msg?.key;
    const chatId = key?.remoteJid;
    if (!chatId || chatId === 'status@broadcast' || !key?.id) return null;
    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup && !modules.normalizeJid(chatId)) return null;
    if (String(ctx.body || '').length > 8000) {
      await textReply(sock, ctx, '🐺 Comando longo demais. Use até 8.000 caracteres.');
      return null;
    }
    let metadata = null;
    if (isGroup) {
      try { metadata = await sock.groupMetadata(chatId); }
      catch (error) {
        logger.warn({ error: error.message }, 'Não foi possível verificar o grupo para a alcateia.');
        await textReply(sock, ctx, '🐺 Não consegui verificar as permissões do grupo. Tente novamente.');
        return null;
      }
    }
    const ownerNumber = String(getConfig(config, 'BOT_OWNER') || '').replace(/\D/g, '');
    const identities = new modules.IdentityResolver(sock, `${ownerNumber}@s.whatsapp.net`, metadata);
    const sender = modules.normalizeJid(key.fromMe ? sock.user?.id : isGroup ? key.participant : chatId);
    if (!sender) return null;
    const alternative = key.fromMe ? sock.user?.lid : isGroup ? key.participantAlt : key.remoteJidAlt;
    const actor = await identities.member(sender, alternative);
    if (!actor?.phoneNumber) {
      await textReply(sock, ctx, '🐺 Não consegui confirmar seu número. Tente novamente no privado do bot.');
      return null;
    }
    if (key.fromMe && !actor.isOwner && !modules.isGameOwner(actor.phoneNumber)) return null;
    const aliases = [...new Set([sender, actor.jid, actor.phoneNumber, ...(actor.aliases || [])].filter(Boolean))];
    if (typeof sock.signalRepository?.lidMapping?.getLIDForPN === 'function') {
      try {
        const reverse = modules.normalizeJid(await sock.signalRepository.lidMapping.getLIDForPN(actor.phoneNumber));
        if (reverse?.endsWith('@lid') && !aliases.includes(reverse)) aliases.push(reverse);
      } catch (error) {
        logger.warn({ error: error.message }, 'Não foi possível verificar os bloqueios do usuário.');
        await textReply(sock, ctx, '🐺 Não consegui verificar suas permissões. Tente novamente em instantes.');
        return null;
      }
    }
    // The normal legacy pipeline checks these flags before calling plugins.
    // Repeat against trusted PN/LID aliases so an identifier change cannot
    // bypass an existing global bot ban or command mute.
    for (const jid of aliases) {
      const user = db.getUser?.(jid);
      if (user && (enabled(user.banned) || enabled(user.muted))) return null;
    }
    const group = isGroup ? db.getGroup?.(chatId) || {} : {};
    const botAdmin = aliases.some(jid => db.isBotAdmin?.(jid));
    if ((group.enabled === false || group.enabled === 0) && !actor.isOwner) return null;
    if ((enabled(group.adminOnly) || enabled(group.admin_only)) && !actor.isOwner && !actor.isAdmin && !botAdmin) {
      await textReply(sock, ctx, '🐺 Neste grupo os comandos estão liberados apenas para administradores.');
      return null;
    }
    const prefix = getConfig(config, 'PREFIX') || ctx.PREFIX || '!';
    const reply = (text, extra = {}) => sock.sendMessage(chatId,
      { text: rewrittenText(text, prefix), ...extra }, { quoted: ctx.msg });
    return {
      sock, msg: ctx.msg, chatId, sender, senderPhone: actor.phoneNumber,
      senderKey: actor.phoneNumber, displayName: ctx.msg.pushName || ctx.pushName || actor.phoneNumber.split('@')[0],
      isGroup, metadata, group, isOwner: actor.isOwner, isAdmin: actor.isAdmin,
      startedAt, config: { prefix, ownerNumber, botName: getConfig(config, 'BOT_NAME') || ctx.BOT_NAME || '🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑',
        botDescription: getConfig(config, 'BOT_DESCRIPTION') || '' },
      command: route.command, args: route.args, argText: route.argText,
      reply, runInBackground,
      resolveMember: jid => identities.member(jid),
      resolveTarget: async () => {
        const mentions = modules.contextOf(ctx.msg).mentionedJid;
        return mentions?.length === 1 ? identities.member(mentions[0]) : null;
      },
    };
  };
}

async function defaultLoadModules(root) {
  const base = path.join(root, 'addons/alcateia/src');
  const imported = await Promise.all([
    'store.js', 'game/service.js', 'game/commands.js', 'identity.js', 'messages.js',
    'game/backup.js', 'game/validation.js', 'game/rate-limit.js',
  ].map(file => import(pathToFileURL(path.join(base, file)).href)));
  return Object.assign({}, ...imported);
}

function defaultLoadUpstream() {
  const registry = require('../src/core/commandRegistry');
  return {
    registry: registry.registry, register: registry.register,
    db: require('../src/utils/database'), config: require('../src/config'),
    logger: require('../src/config/logger').logger,
  };
}

/** Dependency injection keeps adapter tests independent of SQLite and Baileys. */
function createPlugin({ root = path.join(__dirname, '..'), loadModules = defaultLoadModules,
  loadUpstream = defaultLoadUpstream, now = () => Date.now() } = {}) {
  let initialization;
  const startedAt = now();
  const background = new Set();

  async function initialize() {
    if (!initialization) initialization = (async () => {
      const [modules, upstream] = await Promise.all([loadModules(root), loadUpstream()]);
      const logger = upstream.logger || console;
      const store = new modules.Store(path.join(root, 'storage/alcateia/database.json'));
      const service = new modules.GameService({ store, now });
      const backupManager = new modules.BackupManager({ store,
        directory: path.join(root, 'storage/alcateia/backups'), logger, now });
      function runInBackground(task) {
        const job = Promise.resolve().then(task).catch(error => {
          logger.warn({ error: error.message }, 'Falha em uma tarefa de fundo da alcateia.');
        });
        background.add(job);
        job.finally(() => background.delete(job));
        return job;
      }
      const adapter = createAdapter({ modules, ...upstream, logger, startedAt, runInBackground });
      const handler = modules.createGameCommandHandler({ service, backupManager, logger, now });
      return { modules, upstream, logger, store, service, backupManager, adapter, handler,
        dedup: new modules.Deduplicator() };
    })().catch(error => { initialization = null; throw error; });
    return initialization;
  }

  async function route(sock, ctx, command, args = ctx.args || []) {
    const state = await initialize();
    const id = `${ctx.msg?.key?.remoteJid}:${ctx.msg?.key?.participant || ''}:${ctx.msg?.key?.id}`;
    if (ctx.msg?.key?.id && !state.dedup.accept(id, now())) return;
    const request = { command, args, argText: args.join(' ') };
    const adapted = await state.adapter(sock, ctx, request);
    if (!adapted) return;
    if (command === 'menu' || (command === 'rp' && (!args.length || args[0]?.toLowerCase() === 'menu'))) {
      try {
        const jid = state.modules.canonicalPlayerJid(adapted.senderPhone);
        const allowance = await state.store.transactionGame(game => state.modules.consumeCommand(game, jid, now()));
        if (!allowance.allowed) return adapted.reply(state.modules.ANTI_SPAM_MESSAGE);
        const current = state.upstream.registry.get('menu');
        if (current) return current.handler(sock, {
          ...ctx, command: 'menu', args: [command === 'rp' ? 'rp' : 'alcateia'],
        });
        await adapted.reply(state.modules.gameMenu(adapted.config));
      } catch (error) {
        if (error?.name === 'GameError') await adapted.reply(`🐺 ${error.message}`);
        else throw error;
      }
    } else if (state.modules.isGameCommand(command, args)) {
      await state.handler(adapted);
    } else {
      await adapted.reply(`🐺 Comando da alcateia desconhecido. Use ${adapted.config.prefix}alcateia menu.`);
    }
  }

  function routes() {
    const result = { alcateia: (sock, ctx) => {
      const args = ctx.args || [];
      return route(sock, ctx, args[0]?.toLowerCase() || 'menu', args.slice(1));
    } };
    for (const command of DIRECT_COMMANDS) result[command] = (sock, ctx) => route(sock, ctx, command);
    for (const [alias, command] of Object.entries(DISTINCT_ALIASES)) result[alias] = (sock, ctx) => route(sock, ctx, command);
    return result;
  }

  const plugin = {
    name: 'alcateia-rp', version: '1.0.0',
    description: '100 Lobisomens Estratégia e RP com WOK Coin, preservando o bot legado.',
    commands: routes(),
    async onLoad() {
      const state = await initialize();
      // Registered legacy names always win. A future upstream command can also
      // claim a direct alias; the namespaced !alcateia route remains available.
      plugin.commands = routes();
      for (const command of Object.keys(plugin.commands)) {
        if (state.upstream.registry.has(command)) delete plugin.commands[command];
      }
      state.backupManager.start();
    },
    async onUnload() {
      if (initialization) (await initialization).backupManager.stop();
    },
    async drain() { await Promise.all([...background]); },
  };
  return plugin;
}

module.exports = createPlugin();
module.exports.createPlugin = createPlugin;
module.exports.createAdapter = createAdapter;
