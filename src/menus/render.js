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
  return `🌹 *Dev:* ${IDENTITY.developer}\n${IDENTITY.motto}`;
}
function frameMenu(title, sections, { identity = false } = {}) {
  return `🌹╔═══❖♆❖═══🐾═══❖♆❖═══╗${identity ? `\n*${IDENTITY.name}*` : ''}\n\n╭──── 🌹 ⚜️ 🐾 ⚜️ 🌹 ────╮\n   *${title}*\n╰──────────────────────╯\n\n${sections.join('\n\n')}\n\n${DIVIDER}${identity ? `\n${footer()}` : ''}\n╚═══❖🌹❖═══♆═══❖🐾❖═══╝🐺`;
}
function frameNotice(title, sections) {
  const heading = String(title).replace(/^(\S+)\s+(.+)$/u, (_, icon, text) => `${icon} *${text}*`);
  return `🌹╔═══❖♆❖═══╗\n${DIVIDER}\n${heading}\n${sections.join('\n')}\n${DIVIDER}\n╚═══❖♆❖═══╝🐺`;
}
function connectionNotice() { return frameNotice('✅ CONEXÃO ESTABELECIDA', ['🐺 Matilha pronta para batalha!', '_Uuuuuuwooooo! 🐺🌕_']); }

module.exports = { IDENTITY, clean, uptime, frameMenu, frameNotice, connectionNotice };
