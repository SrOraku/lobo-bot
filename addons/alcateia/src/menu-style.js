const RULE = '═══✦════❖════♆════❖════✦═══';
const CONTENT_WIDTH = 34;

function linesOf(value) {
  return (Array.isArray(value) ? value : [value]).filter(value => value !== undefined && value !== null)
    .flatMap(value => String(value).split(/\r?\n/));
}

function wrap(value, width = CONTENT_WIDTH) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const result = [];
  let row = '';
  for (const word of words) {
    const candidate = row ? `${row} ${word}` : word;
    if (row && [...candidate].length > width) { result.push(row); row = word; }
    else row = candidate;
  }
  if (row) result.push(row);
  return result.length ? result : [''];
}

function bodyRows(value) { return linesOf(value).flatMap(line => wrap(line).map(row => row ? `║ ${row}` : '║')); }

/** Shared text-only presentation; this helper never interprets a command. */
export function formatMenu({ title = 'MENU DA ALCATEIA', subtitle = [], sections = [], signature = '' } = {}) {
  const output = [`🌹╔${RULE}╗`, ...bodyRows(`👑 ♆ ${title} ♆`), ...bodyRows(subtitle)];
  for (const section of sections) {
    if (section.title) {
      const [heading, ...continuation] = wrap(section.title, 26);
      output.push(`╠═❖═〔 ${heading} 〕═❖═╣`, ...bodyRows(continuation));
    } else output.push(`╠${RULE}╣`);
    output.push(...bodyRows(section.lines || []));
  }
  if (signature && !sections.some(section => linesOf(section.lines).includes(signature))) {
    output.push(`╠${RULE}╣`, ...bodyRows(signature));
  }
  output.push(`╚${RULE}╝🐺`);
  return output.join('\n');
}

/** Restyle an existing menu template while preserving its command text. */
export function decorateMenuText(text, { title = 'MENU DA ALCATEIA', signature = '' } = {}) {
  const subtitle = [];
  const sections = [];
  let current = { title: '', lines: [] };
  for (const raw of linesOf(text)) {
    const row = raw.trim();
    const label = row.match(/〔\s*(.*?)\s*〕/u)?.[1];
    if (/^(?:🌹)?╔/u.test(row)) {
      if (label) subtitle.push(label);
      continue;
    }
    if (/^╠/u.test(row)) {
      if (current.lines.length || current.title) sections.push(current);
      current = { title: label || '', lines: [] };
      continue;
    }
    if (/^╚/u.test(row)) {
      if (label) current.lines.push(label);
      continue;
    }
    if (/^[═━─╣╗╝]+$/u.test(row)) continue;
    current.lines.push(row.replace(/^║\s?/u, ''));
  }
  if (current.lines.length || current.title) sections.push(current);
  return formatMenu({ title, subtitle, sections, signature });
}
