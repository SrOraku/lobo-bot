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
function frameMenu(title, sections) {
  return `🌹╔═══❖♆❖═══🐾═══❖♆❖═══╗\n${IDENTITY.name}\n\n╭──── 🌹 ⚜️ 🐾 ⚜️ 🌹 ────╮\n*${title}*\n╰──────────────────────╯\n\n${sections.join('\n\n')}\n\n┈┈ ❀ 🌹 ❀ ┈┈ ⚜️ 🐺 ⚜️ ┈┈\n🌹 Dev: ${IDENTITY.developer}\n${IDENTITY.motto}\n╚═══❖🌹❖═══♆═══❖🐾❖═══╝🐺`;
}
module.exports = { IDENTITY, clean, uptime, frameMenu };
