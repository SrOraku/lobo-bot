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
  if (!def.name || !def.handler) throw new Error(`Comando inválido: falta name ou handler`);

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
  };

  registry.set(cmd.name, cmd);
  for (const alias of cmd.aliases) registry.set(alias, cmd);
}

// Executar comando pelo nome
async function execute(commandName, sock, ctx) {
  const cmd = registry.get(commandName);
  if (cmd && !await require('../activations/gate').checkActivation(sock,ctx,commandName,cmd)) return;

  // Verificar plugins dinamicamente
  if (!cmd) {
    const { getPluginCommands } = require('./pluginLoader');
    const pluginCmds = getPluginCommands();
    if (pluginCmds[commandName]) {
      if (!await require('../activations/gate').checkActivation(sock,ctx,commandName)) return;
      return pluginCmds[commandName](sock, ctx);
    }
    return; // Comando desconhecido — silencioso
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

  if (userLevel < cmd.minLevel) {
    return sock.sendMessage(ctx.jid, {
      text: R.noPermission(LEVEL_NAMES[cmd.minLevel])
    }, { quoted: ctx.msg });
  }

  // Executar
  try {
    logCommand(ctx.sender, commandName, ctx.isGroup ? ctx.jid : null);
    await cmd.handler(sock, ctx);
    bus.emit(EVENTS.COMMAND_EXECUTED, { command: commandName, sender: ctx.sender });
  } catch (err) {
    logError(`command:${commandName}`, err, { sender: ctx.sender });
    bus.emit(EVENTS.COMMAND_ERROR, { command: commandName, error: err });
    await sock.sendMessage(ctx.jid, {
      text: R.error('Erro Inesperado!', `Ocorreu um erro ao executar *!${commandName}*.\n_Tente novamente em instantes._`, 'Se o erro persistir, contate o desenvolvedor.')
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

module.exports = { register, execute, listAll, getByCategory, registry };
