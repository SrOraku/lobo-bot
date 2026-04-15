'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — BARRAMENTO DE EVENTOS
// ============================================================

const { EventEmitter } = require('events');
const { logger } = require('../config/logger');

class LoboBotEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // Emitir com log automático
  emit(event, ...args) {
    logger.debug({ event }, `📡 Evento: ${event}`);
    return super.emit(event, ...args);
  }

  // Registrar handler com nome para debug
  on(event, handler) {
    logger.debug(`📡 Listener registrado: ${event}`);
    return super.on(event, handler);
  }
}

const bus = new LoboBotEvents();

// Eventos padrão do bot
const EVENTS = {
  // Lifecycle
  BOT_READY:        'bot:ready',
  BOT_DISCONNECT:   'bot:disconnect',

  // Mensagens
  MESSAGE_RECEIVED: 'message:received',
  COMMAND_EXECUTED: 'command:executed',
  COMMAND_ERROR:    'command:error',

  // Jogo
  BATTLE_START:     'battle:start',
  BATTLE_END:       'battle:end',
  LEVEL_UP:         'level:up',
  GOLD_CHANGED:     'gold:changed',

  // Grupo
  MEMBER_JOIN:      'member:join',
  MEMBER_LEAVE:     'member:leave',
  GROUP_UPDATED:    'group:updated',

  // Sistema
  ERROR:            'system:error',
  PLUGIN_LOADED:    'plugin:loaded',
};

module.exports = { bus, EVENTS };
