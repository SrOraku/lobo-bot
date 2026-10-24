'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — REGISTRO DE COMANDOS
// ============================================================

const { LEVELS } = require('../middlewares/permissions');
const { checkRateLimit } = require('../middlewares/rateLimit');
const { bus, EVENTS } = require('./eventBus');
const { logCommand, logError } = require('../config/logger');
const R = require('./response');
const config = require('../config');

// Mapa central de comandos
const registry = new Map();
const commandLimiter=require('../middlewares/command-limits').createCommandLimiter();

/**
 * Registrar um comando com contrato definido
 * @param {Object} def - Definição do comando
 * @param {string}   def.name        - Nome principal (sem prefixo)
 * @param {string[]} def.aliases     - Aliases
 * @param {string}   def.description - Descrição
 * @param {string}   def.usage       - Uso: "!cmd [arg1] [arg2]"
 * @param {string}   def.example     - Exemplo de uso
 * @param {string}   def.category    - Categoria (lobo/gold/mod/midia/fun/admin)
 * @param {number}   def.minLevel    - Nível mínimo (LEVELS.USER por padrão)
 * @param {boolean}  def.groupOnly   - Apenas em grupos
 * @param {Function} def.handler     - Função async (sock, ctx) => {}
 */
function register(def) {
  if (!def.name || typeof def.handler !== 'function') throw new Error('Comando inválido: falta name ou handler');
  const previous=registry.get(def.name);
  const replacement=def.replace || (def.replaceMenu && previous?.menuShortcut);
  if(previous && previous.handler!==def.handler && !replacement) throw Error('Colisão de comando: '+def.name);
  const keys=[def.name,...(def.aliases||[])];
  if(new Set(keys).size!==keys.length) throw Error('Alias duplicado: '+def.name);
  for(const key of keys) if(registry.has(key) && registry.get(key).name!==def.name) throw Error('Colisão de alias: '+key);

  const cmd = {
    name:        def.name,
    menuShortcut: def.menuShortcut || false,
    activationControl: def.activationControl || false,
    aliases:     def.aliases     || [],
    description: def.description || 'Sem descrição',
    usage:       def.usage       || `!${def.name}`,
    example:     def.example     || `!${def.name}`,
    category:    def.category    || 'geral',
    minLevel:    def.minLevel    ?? LEVELS.USER,
    groupOnly:   def.groupOnly   ?? false,
    handler:     def.handler,
    cooldown:def.cooldown ?? 0,rateLimit:def.rateLimit,cost:def.cost ?? (def.category==='midia'?5:1),
    ownerOnly:!!def.ownerOnly,adminOnly:!!def.adminOnly,premiumOnly:!!def.premiumOnly,
    requiresBotAdmin:!!def.requiresBotAdmin,feature:def.feature,hidden:!!def.hidden,
    timeout:def.timeout,concurrency:def.concurrency,auditLevel:def.auditLevel,
  };

  registry.set(cmd.name, cmd);
  for (const alias of cmd.aliases) registry.set(alias, cmd);
}

// Executar comando pelo nome
async function executeCommand(commandName, sock, ctx) {
  const pluginCommands = require('./pluginLoader').getPluginCommands();
  const resolved = require('../commands/shortcuts').resolveInput(commandName,ctx.args,name=>registry.has(name)||!!pluginCommands[name], [...new Set([...registry.values()].map(cmd=>cmd.name).concat(Object.keys(pluginCommands)))]);
  commandName = resolved.command;
  ctx = {...ctx,command:commandName,args:resolved.args,argText:resolved.args.join(' ')};
  const cmd = registry.get(commandName);
  if (cmd && !await require('../activations/gate').checkActivation(sock,ctx,commandName,cmd)) return;

  // Verificar plugins dinamicamente
  if (!cmd) {
    const { getPluginCommands } = require('./pluginLoader');
    const pluginCmds = getPluginCommands();
    if (pluginCmds[commandName]) {
      if (!await require('../activations/gate').checkActivation(sock,ctx,commandName)) return;
      try { return await pluginCmds[commandName](sock, ctx); }
      catch (error) {
        logError(`plugin:${commandName}`, error);
        return sock.sendMessage(ctx.jid, { text: R.error('ERRO NO COMANDO', 'Tente novamente em instantes.', `Consulte ${config.get('PREFIX')}menu para verificar o uso.`) }, { quoted: ctx.msg }).catch(() => {});
      }
    }
    return sock.sendMessage(ctx.jid, { text: R.warn('COMANDO NÃO ENCONTRADO', `Use ${config.get('PREFIX')}menu para consultar os comandos disponíveis.`) }, { quoted: ctx.msg });
  }

  // Rate limit
  const rl = checkRateLimit(ctx.sender);
  if (!rl.allowed) {
    if (rl.reason === 'flood') {
      return sock.sendMessage(ctx.jid, {
        text: R.warn('FLOOD DETECTADO!', `🚫 Você está enviando comandos muito rápido!\n⏳ Aguarde *${rl.remaining}s* antes de continuar.`)
      }, { quoted: ctx.msg });
    }
    return; // Cooldown silencioso
  }

  const budget=commandLimiter.check({chat:ctx.jid,user:ctx.sender,command:cmd.name,category:cmd.category,cooldown:cmd.cooldown,rateLimit:cmd.rateLimit,cost:cmd.cost});
  if(!budget.allowed) return sock.sendMessage(ctx.jid,{text:R.warn('AGUARDE',`Tente novamente em ${budget.remaining}s.`)},{quoted:ctx.msg});

  // Grupo only
  if (cmd.groupOnly && !ctx.isGroup) {
    return sock.sendMessage(ctx.jid, {
      text: R.error('Apenas em Grupos!', 'Este comando só pode ser usado dentro de um grupo.')
    }, { quoted: ctx.msg });
  }

  // Nível de permissão
  const { resolveLevel, LEVEL_NAMES } = require('../middlewares/permissions');
  const userLevel = await resolveLevel(sock, ctx.sender, ctx.isGroup ? ctx.jid : null);
  ctx.senderLevel = userLevel;

  if (userLevel < Math.max(cmd.minLevel,cmd.ownerOnly?LEVELS.OWNER:cmd.adminOnly?LEVELS.GROUP_ADMIN:0)) {
    return sock.sendMessage(ctx.jid, {
      text: R.noPermission(LEVEL_NAMES[cmd.minLevel])
    }, { quoted: ctx.msg });
  }

  if(cmd.premiumOnly && !require('../services/economy').isPremium(require('../utils/database').getUser(ctx.sender))) return sock.sendMessage(ctx.jid,{text:R.warn('PREMIUM','Este comando exige Premium ativo.')},{quoted:ctx.msg});
  if(cmd.requiresBotAdmin && !(await require('../activations/access').resolveActor(sock,ctx)).botAdmin) return sock.sendMessage(ctx.jid,{text:R.warn('ADMINISTRADOR','O bot precisa ser administrador.')},{quoted:ctx.msg});
  if(cmd.feature && !require('../activations/manager').manager.isEnabled(ctx.jid,cmd.feature)) return;
  // Executar
  try {
    logCommand(ctx.sender, commandName, ctx.isGroup ? ctx.jid : null);
    const administrative={ban:'remove',mute:'mute',kick:'remove',promover:'promote',rebaixar:'demote',advertir:'warn',abrirgrupo:'settings',fechargrupo:'settings',limparinatividade:'remove',add:'add'};
    if(ctx.isGroup&&administrative[cmd.name]){
      try{await require('../security/groups/service').security().permissions.guardCommand(sock,ctx,administrative[cmd.name]);}
      catch(error){return sock.sendMessage(ctx.jid,{text:require('../menus/render').frameNotice('🛡️ LOBO SECURITY',[error.code?'Ação administrativa bloqueada; confira as permissões atuais.':error.message])},{quoted:ctx.msg});}
    }
    await cmd.handler(sock, ctx);
    bus.emit(EVENTS.COMMAND_EXECUTED, { command: commandName, sender: ctx.sender });
  } catch (err) {
    logError(`command:${commandName}`, err, { sender: ctx.sender });
    bus.emit(EVENTS.COMMAND_ERROR, { command: commandName, error: err });
    await sock.sendMessage(ctx.jid, {
      text: R.error('Erro Inesperado!', `Ocorreu um erro ao executar *${config.get('PREFIX')}${commandName}*.\n_Tente novamente em instantes._`, 'Se o erro persistir, contate o desenvolvedor.')
    }, { quoted: ctx.msg }).catch(() => {});
  }
}

// Listar todos os comandos únicos (sem aliases duplicados)
function listAll() {
  const seen = new Set();
  const result = [];
  for (const cmd of registry.values()) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      result.push(cmd);
    }
  }
  return result;
}

function getByCategory(category) {
  return listAll().filter(c => c.category === category);
}

const economicQueue = new (require('./keyed-queue').KeyedQueue)();
function execute(commandName,sock,ctx) {
  const plugins=require('./pluginLoader').getPluginCommands();
  const resolved=require('../commands/shortcuts').resolveInput(commandName,ctx.args,name=>registry.has(name)||!!plugins[name],[...new Set([...registry.values()].map(c=>c.name).concat(Object.keys(plugins)))]);
  const canonical=registry.get(resolved.command)?.name || resolved.command;
  const critical=new Set(['enviargold','comprar','daily','atacar','curarlobos','resetarlobos','mudar','titulo']);
  const run=()=>executeCommand(resolved.command,sock,{...ctx,args:resolved.args});
  return (critical.has(canonical) || registry.get(resolved.command)?.concurrency==='chat') ? economicQueue.run(ctx.jid,run) : run();
}

module.exports = { register, execute, listAll, getByCategory, registry };
