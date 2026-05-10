'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — LOGGER ESTRUTURADO
// ============================================================

const pino = require('pino');
const path = require('path');
const fs   = require('fs');

const LOG_DIR  = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, `lobo-${new Date().toISOString().slice(0, 10)}.log`);
fs.mkdirSync(LOG_DIR, { recursive: true });

const level = process.env.LOG_LEVEL || 'info';
const isDev = process.env.NODE_ENV !== 'production';

// pino-pretty como transport (API correta para pino v8+)
const logger = pino(
  { level },
  isDev
    ? pino.transport({
        target:  'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      })
    : pino.multistream([
        { level, stream: process.stdout },
        { level: 'warn', stream: fs.createWriteStream(LOG_FILE, { flags: 'a' }) },
      ])
);

function logError(context, err, extra = {}) {
  logger.error({ context, error: { message: err?.message, stack: err?.stack, code: err?.code }, ...extra },
    `🐺 Erro em [${context}]`);
}

function logCommand(sender, command, groupJid) {
  logger.info({ type: 'command', sender, command, group: groupJid || 'private' },
    `🗡️ CMD: !${command} por ${sender}`);
}

function logBattle(attacker, defender, result) {
  logger.info({ type: 'battle', attacker, defender, result },
    `⚔️ Batalha: ${attacker} vs ${defender} → ${result}`);
}

module.exports = { logger, logError, logCommand, logBattle };
