'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — RESPOSTAS PADRONIZADAS
// ============================================================

const config = require('../config');

const BOT_NAME  = () => config.get('BOT_NAME');
const DEV_NAME  = () => config.get('DEVELOPER_NAME');
const DEV_TEL   = () => config.get('DEVELOPER_CONTACT');

// Borda decorativa
const BORDER_TOP    = `🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹`;
const BORDER_BOT    = `🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹`;
const DIVIDER       = `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ✅ Sucesso
function success(title, body, footer = '') {
  return `${BORDER_TOP}\n\n*[ ${BOT_NAME()} ]*\n\n✅ *${title}*\n\n${body}${footer ? `\n\n${footer}` : ''}\n\n${BORDER_BOT}`;
}

// ❌ Erro
function error(title, body, tip = '') {
  return `🚫 *[ ${BOT_NAME()} ]*\n\n❌ *${title}*\n\n${body}${tip ? `\n\n💡 _${tip}_` : ''}`;
}

// ⚠️ Aviso
function warn(title, body) {
  return `⚠️ *[ ${BOT_NAME()} ]*\n\n🌙 *${title}*\n\n${body}`;
}

// ℹ️ Info
function info(title, body) {
  return `🌹 *[ ${BOT_NAME()} ]*\n\n📋 *${title}*\n\n${body}`;
}

// 🐺 Tema Lobo (batalha, eventos)
function wolf(title, body) {
  return `${BORDER_TOP}\n\n🌹 *[ ${BOT_NAME()} ]*\n\n🐺 *${title}*\n\n${body}\n\n_Uuuuuuwooooo! 🐺🌕_\n\n${BORDER_BOT}`;
}

// 📋 Uso incorreto de comando
function usage(command, example, description = '') {
  return `❌ *[ ${BOT_NAME()} ]*\n\n📋 *Uso correto:*\n\`${command}\`\n\n💡 *Exemplo:*\n\`${example}\`${description ? `\n\n_${description}_` : ''}`;
}

// 🏆 Ranking
function ranking(title, lines) {
  const body = lines.join('\n\n');
  return `${BORDER_TOP}\n\n🌹 *[ ${BOT_NAME()} ]*\n\n${DIVIDER}\n🏆 *${title}*\n${DIVIDER}\n\n${body}\n\n${BORDER_BOT}`;
}

// 🔒 Sem permissão
function noPermission(needed) {
  return `🚫 *[ ${BOT_NAME()} ]*\n\n_Você precisa ser_ *${needed}* _para usar este comando!_ 🐺`;
}

// 👣 Rodapé do dev
function devFooter() {
  return `${DIVIDER}\n👨‍💻 _Dev: *${DEV_NAME()}*_\n📞 _${DEV_TEL()}_`;
}

module.exports = { success, error, warn, info, wolf, usage, ranking, noPermission, devFooter, BORDER_TOP, BORDER_BOT, DIVIDER };
