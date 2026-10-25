'use strict';
// Presentation only; command permissions, results and persistence stay in callers.
const { card, notice, command, BOTTOM, DIVIDER } = require('../ui/text');
const BORDER_TOP = '╭━━━〔 🐺 〕━━━╮';
const BORDER_BOT = BOTTOM;
function success(title, body, footer = '') { return notice('success', title, [body], footer); }
function error(title, body, tip = '') { return notice('error', title, [body], tip); }
function warn(title, body) { return notice('warn', title, [body]); }
function info(title, body) { return card(title, [body]); }
function wolf(title, body) { return card(title, [body]); }
function ranking(title, lines) { return card(title, lines); }
function usage(value, example, description = '') {
  return notice('error', 'Faltou um argumento ou o formato não confere.', [description].filter(Boolean), '*Use assim:* ' + command(value) + ' • ' + command(example));
}
function noPermission(needed) { return notice('error', '🔒 *Acesso restrito*', ['_Você precisa ser ' + needed + ' para usar este comando._']); }
function devFooter() { return ''; }
module.exports = { success, error, warn, info, wolf, usage, ranking, noPermission, devFooter, BORDER_TOP, BORDER_BOT, DIVIDER };
