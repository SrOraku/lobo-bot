'use strict';
const config = require('../config');
const { card, command } = require('../ui/text');
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
function footer() {
  return `🌹 *Dev:* ${IDENTITY.developer}\n_${IDENTITY.motto}_`;
}
function frameMenu(title, sections, { identity = false } = {}) {
  return card(title, [...(identity ? [`*${IDENTITY.name}*`] : []), ...sections, ...(identity ? [footer()] : [])], { tip: sections.some(section => /(?:^|\n)> /u.test(section)) ? undefined : '🌹 _Volte ao menu com_ ' + command(config.get('PREFIX') + 'menu') + '.' });
}
function frameNotice(title, sections) {
  return card(title, sections);
}
function connectionNotice() { return frameNotice('✅ CONEXÃO ESTABELECIDA', ['🐺 Matilha pronta para batalha!', '_Uuuuuuwooooo! 🐺🌕_']); }

module.exports = { IDENTITY, clean, uptime, frameMenu, frameNotice, connectionNotice };
