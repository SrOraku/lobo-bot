import { BOT_NAME, BOT_DESCRIPTION, OWNER_NUMBER, DEV_SIGNATURE } from './game/constants.js';

import { panelHeader, sectionHeading, contentLine, commandLine, TOP, BOTTOM, DIVIDER } from './presentation.js';

function linesOf(value) {
  return (Array.isArray(value) ? value : [value]).filter(value => value !== undefined && value !== null)
    .flatMap(value => String(value).split(/\r?\n/));
}

/** Shared text-only presentation; this helper never interprets a command. */
export function formatMenu({ title = 'MENU DA ALCATEIA', botName = BOT_NAME, botDescription = BOT_DESCRIPTION, ownerNumber = OWNER_NUMBER,
  subtitle = [], sections = [], signature = '', prefix = '', tip = '💡 _Escolha um comando da matilha._' } = {}) {
  const output = [panelHeader(title), ...linesOf(subtitle).filter(Boolean).map(contentLine)];
  for (const section of sections) {
    if (section.title) output.push(sectionHeading(section.title));
    else output.push(DIVIDER);
    output.push(...linesOf(section.lines || []).flatMap(row => commandLine(row, prefix)).filter(Boolean));
  }
  output.push(BOTTOM, `> 🌹 ${tip}`);
  return output.join('\n');
}

/** Restyle an existing menu template while preserving its command text. */
export function decorateMenuText(text, { title = 'MENU DA ALCATEIA', botName = BOT_NAME,
  botDescription = BOT_DESCRIPTION, ownerNumber = OWNER_NUMBER, signature = '' } = {}) {
  if (String(text).startsWith(TOP)) return String(text);
  const subtitle = [];
  const sections = [];
  let current = { title: '', lines: [] };
  for (const raw of linesOf(text)) {
    const row = raw.trim();
    const label = row.match(/〔\s*(.*?)\s*〕/u)?.[1];
    const flatHeading = row.match(/^(?:🌹)?[═━─]{2,}\[\s*(.+?)\s*\][═━─]{2,}(?:🌹|🐺)?$/u);
    if (flatHeading) { subtitle.push(flatHeading[1]); continue; }
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
    const contents = row.replace(/^║\s?/u, '');
    if (contents === botName || contents === botDescription || contents === `👑 Dono: +${ownerNumber}`) continue;
    if (contents === DEV_SIGNATURE || (signature && contents === signature)) continue;
    current.lines.push(contents);
  }
  if (current.lines.length || current.title) sections.push(current);
  return formatMenu({ title, botName, botDescription, ownerNumber, subtitle, sections, signature });
}
