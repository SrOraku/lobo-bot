'use strict';

// Pure presentation helpers. They never read state or change game values.
const MAX_WIDTH = 26;
const segmenter = new Intl.Segmenter('pt', { granularity: 'grapheme' });
const TOP = '╭━━ 🌹 ━━〔 🐺 〕━━ 🌹 ━━╮';
const HEAD_BOTTOM = '╰━━ 🐺 ━━〔 🌹 〕━━ 🐺 ━━╯';
const BOTTOM = '╰━━ 🌹 ━━〔 🐺 〕━━ 🌹 ━━╯';
const DIVIDER = '  ╌╌╌╌╌ 🌹 🐺 🌹 ╌╌╌╌╌';
const BLOCK_BOTTOM = DIVIDER;
const graphemes = value => [...segmenter.segment(String(value))].map(item => item.segment);
const plain = value => String(value).replace(/[*_`]/g, '');

function width(value) {
  return graphemes(plain(value)).reduce((total, part) => total + (
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F]/u.test(part) || /[\u3000-\u303f\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part) ? 2
      : /^[\p{Mark}\p{Cc}\p{Cf}]+$/u.test(part) ? 0 : 1
  ), 0);
}

function mono(value) {
  const text = String(value ?? '');
  if (/^`[^`\n]*`$/u.test(text)) return text;
  return text.split('\n').map(line => '`' + line + '`').join('\n');
}

function numericText(value) {
  // Preserve existing code, links, JIDs and mentions; never corrupt a target.
  return String(value).replace(/```[\s\S]*?```|`[^`\n]*`|\*[^*\n]+\*|https?:\/\/[^\s]+|\d+@(?:s\.whatsapp\.net|lid|g\.us)|@\d+|(?<![\p{L}\p{N}_#@-])[-+]?\d+(?:[.,:/–-]\d+)*(?:\s?(?:%|ms|s|m|h|d|MB|GB|KB))?(?![\p{L}\p{N}_@])/gu, token =>
    token.startsWith('`') || token.startsWith('*') || /^https?:\/\//u.test(token) || token.includes('@') ? token : mono(token));
}

function command(value) {
  const text = String(value).trim();
  const match = text.match(/^(\S+)(?:\s+([\s\S]+))?$/u);
  if (!match) return text;
  return '*' + match[1] + '*' + (match[2] ? ' ' + mono(match[2]) : '');
}

function progress(value, maximum, segments = 8) {
  const size = Number.isInteger(segments) ? Math.min(20, Math.max(1, segments)) : 8;
  const ratio = Number.isFinite(Number(value)) && Number(maximum) > 0 ? Math.max(0, Math.min(1, Number(value) / Number(maximum))) : 0;
  const filled = Math.round(ratio * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

function wrapTitle(value, available) {
  const result = [];
  let row = '';
  for (const word of String(value).trim().split(/\s+/u)) {
    if (row && width(row + ' ' + word) <= available) { row += ' ' + word; continue; }
    if (row) { result.push(row); row = ''; }
    for (const part of graphemes(word)) {
      if (row && width(row + part) > available) { result.push(row); row = ''; }
      row += part;
    }
  }
  if (row) result.push(row);
  return result;
}

function center(value, available = MAX_WIDTH) {
  const text = String(value);
  return ' '.repeat(Math.max(0, Math.floor((available - width(text)) / 2))) + text;
}

function titleRows(title, kind = 'card') {
  const raw = numericText(String(title).replace(/\*/gu, '').trim());
  if (kind === 'block') {
    const parts = wrapTitle(raw, MAX_WIDTH - 13);
    return parts.map(line => {
      const full = '─── 🌹 *' + line + '* 🐺 ───';
      return center(width(full) <= MAX_WIDTH ? full : '─ 🌹 *' + line + '* 🐺 ─');
    });
  }
  return [TOP, ...wrapTitle(raw, MAX_WIDTH - 2).map(line => center('*' + line + '*')), HEAD_BOTTOM];
}

function badge(enabled) { return mono(enabled ? '〔 🟢 〕' : '〔 🔴 〕'); }
function money(value, symbol = 'WoK coin') {
  const amount = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value));
  return mono(symbol === 'R$' ? symbol + ' ' + amount : amount + ' ' + symbol);
}
function greeting(at = new Date(), timeZone = 'America/Sao_Paulo') {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(at));
  return hour < 5 ? '🌑 Boa madrugada' : hour < 12 ? '☀️ Bom dia' : hour < 18 ? '🌤️ Boa tarde' : '🌙 Boa noite';
}
function clock(at = new Date(), timeZone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at);
}
const lastPhrases = new Map();
function flavor(outcome, pick = maximum => require('node:crypto').randomInt(maximum)) {
  const phrases = outcome === 'win'
    ? ['🌹 _A lua testemunhou a força da matilha!_ 🐺', '🐺 _Seu uivo ecoou por toda a floresta!_ 🌹', '🌹 _A alcateia celebra sua conquista!_ 🐺']
    : ['🐺 _Reúna suas forças; a próxima caçada espera._ 🌹', '🌹 _Todo lobo aprende com a batalha._ 🐺', '🐺 _A lua ainda guarda novas oportunidades._ 🌹'];
  const previous = lastPhrases.get(outcome);
  const choices = phrases.filter(value => value !== previous);
  let selected = 0;
  try { selected = pick(choices.length); } catch { /* Decorative copy must never fail an action. */ }
  const phrase = choices[selected] || choices[0];
  if (lastPhrases.size >= 4) lastPhrases.clear();
  lastPhrases.set(outcome, phrase);
  return phrase;
}

function lines(value) {
  return (Array.isArray(value) ? value : [value]).filter(item => item !== undefined && item !== null && item !== '')
    .flatMap(item => String(item).split(/\r?\n/u)).filter(line => line.trim());
}

function themedNote(value) {
  const text = String(value).replace(/^>\s*/u, '');
  return '> ' + (/^[🌹🐺]/u.test(text) ? text : '🌹 ' + text);
}
function rows(sections, formatNumbers) {
  return lines(sections).flatMap(line => {
    let text = formatNumbers ? numericText(line) : line;
    if (formatNumbers) text = text.replace(/`[^`\n]*`|[▰▱■□]{2,}/gu, value => value.startsWith('`') ? value : mono(value));
    if (text.startsWith('> ')) return themedNote(text);
    if (/^[╭╰]/u.test(text)) return text;
    if (/^[├]/u.test(text)) return DIVIDER;
    if (/^[╔╚╠]/u.test(text)) {
      const label = text.replace(/[╔╗╚╝╠╣═━─❖✦]/gu, '').trim();
      return /[\p{L}\p{N}]/u.test(label) ? '  ' + label : [];
    }
    if (/^[━═─┈╌=-]{3,}$/u.test(text.trim())) return DIVIDER;
    if (/^(?:│|┃|║) ▸ /u.test(text)) return text.replace(/^(?:│|┃|║) ▸ /u, '     ▸ ');
    if (/^(?:│|┃|║)   /u.test(text)) return text.replace(/^(?:│|┃|║)   /u, '       ');
    if (/^[│┃║]/u.test(text)) return text.replace(/^[│┃║]\s?/u, '  ');
    return /^\s{2,}/u.test(text) ? text : '  ' + text;
  });
}

function card(title, sections, { tip, formatNumbers = true } = {}) {
  const content = rows(sections, formatNumbers);
  const notes = content.filter(line => line.startsWith('> '));
  const body = content.filter(line => !line.startsWith('> '));
  return [...titleRows(title), ...body, BOTTOM, ...notes, ...(tip ? [themedNote(formatNumbers ? numericText(tip) : tip)] : [])].join('\n');
}

function block(title, sections, { formatNumbers = true } = {}) {
  const content = lines(sections).map(line => {
    const text = formatNumbers ? numericText(line) : line;
    return /^(?:│|┃|║)|^\s{2,}/u.test(text) ? text : '     ▸ ' + text;
  });
  return [...titleRows(title, 'block'), ...content].join('\n');
}

function notice(kind, title, body, tip = '') {
  const detail = [title, ...lines(body)].filter(Boolean).map(value => numericText(value));
  if (kind === 'warn') return ['⏳ 🌹 *Aguarde, lobo(a)!* 🐺', ...detail.map(line => '> 🐺 ' + line), ...(tip ? [themedNote(tip)] : [])].join('\n');
  const heading = kind === 'success' ? '╭━━ 🌹 *CONCLUÍDO* 🐺 ━━╮' : '╭━━ 🐺 *ATENÇÃO* 🌹 ━━╮';
  const icon = kind === 'success' ? '✅' : '❌';
  return [heading, ...detail.map((line, index) => '  ' + (index ? '' : icon + ' ') + line), BOTTOM, ...(tip ? [themedNote(tip)] : [])].join('\n');
}

module.exports = { MAX_WIDTH, TOP, HEAD_BOTTOM, BOTTOM, BLOCK_BOTTOM, DIVIDER, width, plain, mono, numericText, command, progress, titleRows, center, badge, money, greeting, clock, flavor, card, block, notice };
