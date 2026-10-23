'use strict';
const config = require('../config');
const IDENTITY = Object.freeze({
  name: config.DEFAULTS?.BOT_NAME || '🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑',
  motto: config.DEFAULTS.BOT_DESCRIPTION,
  developer: config.DEFAULTS.DEVELOPER_NAME,
});
function clean(value) {
  return String(value || '')
    .replace(/[\r\n\u0000-\u001f*`]/g, ' ')
    .slice(0, 70);
}
function uptime(seconds) {
  const n = Math.floor(seconds);
  return `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m ${n % 60}s`;
}
const DIVIDER = '┈┈ ❀ 🌹 ❀ ┈┈ ⚜️ 🐺 ⚜️ ┈┈';
function footer() {
  return `🌹 *Dev:* ${IDENTITY.developer}\n📞 +5543920030769\n${IDENTITY.motto}`;
}
function frameMenu(title, sections) {
  return `🌹╔═══❖♆❖═══🐾═══❖♆❖═══╗\n*${IDENTITY.name}*\n\n╭──── 🌹 ⚜️ 🐾 ⚜️ 🌹 ────╮\n*${title}*\n╰──────────────────────╯\n\n${sections.join('\n\n')}\n\n${DIVIDER}\n${footer()}\n╚═══❖🌹❖═══♆═══❖🐾❖═══╝🐺`;
}
function frameNotice(title, sections) {
  return `🌹╔═══❖♆❖═══╗\n*${IDENTITY.name}*\n${IDENTITY.motto}\n*${title}*\n${sections.join('\n')}\n🌹 *Dev:* ${IDENTITY.developer}\n📞 +5543920030769\n╚═══❖♆❖═══╝🐺`;
}
function connectionNotice() {
  return `🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹\n\n*${IDENTITY.name}*\n\n✅ *Bot conectado com sucesso!*\n🐺 Matilha pronta para batalha!\n\n_Uuuuuuwooooo! 🐺🌕_\n\n👨‍💻 Dev: ${IDENTITY.developer}\n📞 +5543920030769\n\n${IDENTITY.motto}\n\n🌹🐺✦❀🌹🐺✦❀🌹`;
}
module.exports = { IDENTITY, clean, uptime, frameMenu, frameNotice, connectionNotice };
