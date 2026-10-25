import { randomInt } from 'node:crypto';
/** Pure text presentation shared by the standalone wolf and RP renderers. */
export const MAX_WIDTH = 26;
export const TOP = '╭━━ 🌹 ━━〔 🐺 〕━━ 🌹 ━━╮';
export const HEAD_BOTTOM = '╰━━ 🐺 ━━〔 🌹 〕━━ 🐺 ━━╯';
export const BOTTOM = '╰━━ 🌹 ━━〔 🐺 〕━━ 🌹 ━━╯';
export const DIVIDER = '  ╌╌╌╌╌ 🌹 🐺 🌹 ╌╌╌╌╌';
const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
export const mono = value => `\`${String(value ?? '')}\``;

export function displayWidth(value) {
  return [...segmenter.segment(String(value).replace(/[*_`]/g, ''))].reduce((sum, { segment }) =>
    sum + (/\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(segment) ? 2 : 1), 0);
}

function wrapHeading(value, width = MAX_WIDTH - 2) {
  const rows = [];
  let row = '';
  for (const word of String(value).replace(/\s+/g, ' ').trim().split(' ')) {
    if (row && displayWidth(row + ' ' + word) <= width) { row += ' ' + word; continue; }
    if (row) { rows.push(row); row = ''; }
    for (const { segment } of segmenter.segment(word)) {
      if (row && displayWidth(row + segment) > width) { rows.push(row); row = ''; }
      row += segment;
    }
  }
  if (row) rows.push(row);
  return rows;
}

export function center(value) {
  return ' '.repeat(Math.max(0, Math.floor((MAX_WIDTH - displayWidth(value)) / 2))) + value;
}
export function panelHeader(title) {
  return [TOP, ...wrapHeading(title, MAX_WIDTH - 2).map(row => center(`*${row.trim()}*`)), HEAD_BOTTOM].join('\n');
}
export function sectionHeading(title) {
  return wrapHeading(title, MAX_WIDTH - 13).map(row => {
    const full = `─── 🌹 *${row.trim()}* 🐺 ───`;
    return center(displayWidth(full) <= MAX_WIDTH ? full : `─ 🌹 *${row.trim()}* 🐺 ─`);
  }).join('\n');
}
/** Mark numeric values, preserving existing inline-code runs and full values. */
export function numericText(value) {
  return String(value ?? '').replace(
    /```[\s\S]*?```|`[^`\n]*`|\*[^*\n]+\*|https?:\/\/[^\s]+|\d+@(?:s\.whatsapp\.net|lid|g\.us)|@\d+|(?<![\p{L}\p{N}_#@-])[-+]?\d+(?:[.,:/–-]\d+)*(?:%|h|min|ms|s)?(?![\p{L}\p{N}_@])/gu,
    token => token.startsWith('`') || token.startsWith('*') || /^https?:\/\//u.test(token) || token.includes('@') ? token : mono(token),
  );
}

export function progress(value, max = 100, size = 8) {
  const ratio = Number.isFinite(Number(value)) && Number(max) > 0 ? Math.max(0, Math.min(1, Number(value) / Number(max))) : 0;
  const filled = Math.round(ratio * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

export function contentLine(value) {
  const text = numericText(value).replace(/`[^`\n]*`|[▰▱■□]{2,}/gu, value => value.startsWith('`') ? value : mono(value));
  if (!text.trim()) return '';
  if (text.startsWith('>')) return /^> [🌹🐺]/u.test(text) ? text : text.replace(/^>\s*/u, '> 🌹 ');
  // Only a leading label followed by whitespace is presentational syntax.
  // Schemes, values, opaque identities and existing code remain verbatim.
  return '  ' + text.replace(/^([^\p{L}\p{N}`]*)([\p{L}][\p{L} \-]{0,25}):(?=\s|$)/u, '$1*$2:*');
}

export function panel(title, values, { tip = '🐺 _A matilha segue em frente._' } = {}) {
  const rows = values.filter(value => value !== undefined && value !== null && String(value).trim())
    .flatMap(value => String(value).split(/\r?\n/));
  const notes = rows.filter(row => row.startsWith('>'));
  return [panelHeader(title), ...rows.filter(row => !row.startsWith('>')).map(contentLine).filter(Boolean), BOTTOM,
    ...(notes.length ? notes.map(contentLine) : tip ? [`> 🌹 ${tip}`] : [])].filter(Boolean).join('\n');
}

export function notice(kind, body, tip = '') {
  const type = kind === 'error' && /aguarde|cooldown|insuficient/i.test(String(body)) ? 'wait' : kind;
  if (type === 'wait') return `⏳ 🌹 *Aguarde, lobo(a)!* 🐺\n> 🐺 _${numericText(body)}_${tip ? `\n> 🌹 ${tip}` : ''}`;
  const heading = type === 'success' ? '╭━━ 🌹 *CONCLUÍDO* 🐺 ━━╮' : '╭━━ 🐺 *ATENÇÃO* 🌹 ━━╮';
  return `${heading}\n  ${type === 'success' ? '✅' : '❌'} _${numericText(body)}_\n${BOTTOM}${tip ? `\n> 🌹 ${tip}` : ''}`;
}


export function commandLine(text, prefix) {
  const at = prefix ? String(text).indexOf(prefix) : -1;
  if (at < 0) return [contentLine(text)];
  const leading = String(text).slice(0, at).replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const [usage, ...description] = String(text).slice(at).split(/\s+—\s+/);
  const [command, ...args] = usage.trim().split(/\s+/);
  return [leading ? contentLine(leading) : '', `     ▸ *${command}*${args.length ? ' ' + mono(args.join(' ')) : ''}`,
    description.length ? `       _${numericText(description.join(' — '))}_` : ''].filter(Boolean);
}

const recentPhrases = new Map();
export function flavor(outcome) {
  const phrases = outcome === 'win' ? ['🌹 _A lua celebra a força da matilha!_ 🐺', '🐺 _Seu uivo ecoou pela floresta!_ 🌹', '🌹 _A alcateia honra esta conquista!_ 🐺'] : ['🐺 _A próxima caçada traz uma nova chance._ 🌹', '🌹 _A experiência também fortalece o lobo._ 🐺', '🐺 _Reúna suas forças sob a lua._ 🌹'];
  const choices = phrases.filter(value => value !== recentPhrases.get(outcome));
  let selected = 0;
  try { selected = randomInt(choices.length); } catch { /* Copy never interrupts a battle result. */ }
  const value = choices[selected] || choices[0];
  if (recentPhrases.size >= 4) recentPhrases.clear();
  recentPhrases.set(outcome, value);
  return value;
}
