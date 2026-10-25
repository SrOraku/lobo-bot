'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — LOGGER ESTRUTURADO
// ============================================================

const path = require('path');
const fs   = require('fs');

const LOG_DIR  = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, `lobo-${new Date().toISOString().slice(0, 10)}.log`);
fs.mkdirSync(LOG_DIR, { recursive: true });

const { logger, logCommand, logConnection, baileysLogger } = require('../utils/activity-logger').createActivityLogger({
  level: process.env.LOG_LEVEL || 'info',
  commands: () => !['false', '0'].includes(String(process.env.LOG_COMMANDS || 'true').toLowerCase()),
  prefix: () => require('./index').get('PREFIX'),
  file: fs.createWriteStream(LOG_FILE, { flags: 'a', mode: 0o600 }),
  errorFile: fs.createWriteStream(path.join(LOG_DIR,'error.log'), { flags:'a', mode:0o600 }),
});

function logError(context, err, extra = {}) {
  logger.error({ context, error: { message: err?.message, stack: err?.stack, code: err?.code }, ...extra },
    `🐺 Erro em [${context}]`);
}

function logBattle(attacker, defender, result) {
  logger.info({ type: 'battle', attacker, defender, result },
    `⚔️ Batalha: ${attacker} vs ${defender} → ${result}`);
}

module.exports = { logger, logError, logCommand, logBattle, logConnection, baileysLogger };
