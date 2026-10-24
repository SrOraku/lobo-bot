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

// Console: apenas erros, mesmo que uma instalação antiga tenha LOG_LEVEL=info.
// Avisos continuam disponíveis no arquivo para diagnóstico.
const logger = pino(
  { level: 'warn', redact: ['creds','auth','session','key','*.privKey','*.rootKey','*.chainKey','*.privateKey'] },
  pino.multistream([
    { level: 'error', stream: process.stderr },
    { level: 'error', stream: fs.createWriteStream(path.join(LOG_DIR,'error.log'),{flags:'a',mode:0o600}) },
    { level: 'warn', stream: fs.createWriteStream(LOG_FILE, { flags: 'a', mode: 0o600 }) },
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
