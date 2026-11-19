'use strict';
// Aparência do console da hospedagem (a tela preta do painel).
//
// Funções puras: recebem os dados de um evento e devolvem as linhas prontas.
// O desenho cabe em telas estreitas (painel aberto no celular), mostra a hora
// de Brasília e nunca deixa texto vindo do WhatsApp mexer no terminal.
const WIDTH = 44; // colunas visíveis no painel pelo celular
const INDENT = 8; // "08:00 ❯ " — as linhas seguintes alinham aqui
const COMMAND_COLUMN = 13;
const TIME_ZONE = 'America/Sao_Paulo';
const segmenter = new Intl.Segmenter('pt', { granularity: 'grapheme' });

// Largura visível: emoji e ideogramas ocupam duas colunas; marcas combinantes, nenhuma.
// (Não usa o medidor dos menus, que ignora * _ ` por serem formatação do WhatsApp.)
function displayWidth(value) {
  let total = 0;
  for (const { segment } of segmenter.segment(String(value ?? ''))) {
    if (/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F]/u.test(segment) || /[\u3000-\u303f\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(segment)) total += 2;
    else if (!/^[\p{Mark}\p{Cc}\p{Cf}]+$/u.test(segment)) total += 1;
  }
  return total;
}

const CODES = Object.freeze({ reset: 0, bold: 1, dim: 90, red: 91, green: 92, yellow: 93, magenta: 95, cyan: 96, white: 97 });

// Controles C0/C1, separadores de linha, espaços de largura zero, marcas de
// direção e BOM. Montado por código para o arquivo não conter esses caracteres.
const INVISIBLE = new RegExp('[' + [[0x00, 0x1f], [0x7f, 0x9f], [0x2028, 0x2029], [0x200b, 0x200b], [0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]]
  .map(([from, to]) => `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`).join('') + ']', 'gu');

// Caracteres de controle, sequências de terminal e marcas invisíveis de direção
// são removidos: um nome de usuário não pode limpar a tela nem forjar uma linha.
function clean(value, fallback = '') {
  const text = String(value ?? '').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

/** Corta pelo tamanho visível (emoji e ideogramas ocupam duas colunas). */
function fit(value, max) {
  const text = String(value ?? '');
  if (displayWidth(text) <= max) return text;
  let out = '', used = 0;
  for (const { segment } of segmenter.segment(text)) {
    const size = displayWidth(segment);
    if (used + size > max - 1) break;
    out += segment; used += size;
  }
  return out.trimEnd() + '…';
}

function pad(value, size) {
  return value + ' '.repeat(Math.max(0, size - displayWidth(value)));
}

function wrap(value, max) {
  const lines = [];
  let current = '';
  for (const word of String(value).split(' ').filter(Boolean)) {
    const piece = displayWidth(word) > max ? fit(word, max) : word;
    if (current && displayWidth(current) + 1 + displayWidth(piece) > max) { lines.push(current); current = piece; }
    else current = current ? current + ' ' + piece : piece;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Hora (HH:MM) e data (DD/MM) em Brasília, qualquer que seja o fuso do servidor. */
function clock(time = Date.now()) {
  const date = new Date(Number.isFinite(Number(time)) ? Number(time) : Date.now());
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(part => [part.type, part.value]));
  return { time: `${parts.hour}:${parts.minute}`, date: `${parts.day}/${parts.month}` };
}

/** Só o final do número: identifica a pessoa sem expor o telefone inteiro. */
function maskNumber(jid, dots = 2) {
  const match = /^(\d{8,15})(?::\d+)?(?:@(?:s\.whatsapp\.net|c\.us))?$/.exec(String(jid ?? '').trim());
  return match ? '·'.repeat(dots) + match[1].slice(-4) : '';
}

function shortGroup(jid) {
  const digits = String(jid ?? '').split('@')[0].replace(/\D/g, '');
  return digits ? `grupo ··${digits.slice(-4)}` : 'grupo';
}

function createConsoleStyle({ color = false, width = WIDTH } = {}) {
  const paint = (text, ...names) => (color && text ? `\x1b[${names.map(name => CODES[name]).join(';')}m${text}\x1b[0m` : text);
  const stamp = time => paint(clock(time).time, 'dim');
  const blank = ' '.repeat(INDENT);

  // Duas linhas por comando: o que foi pedido e por quem; depois, onde.
  function commandLines(record) {
    const command = fit(clean(record.prefix, '!').slice(0, 8) + clean(record.command, '?'), 18);
    const mask = maskNumber(record.sender);
    const column = Math.max(COMMAND_COLUMN, displayWidth(command) + 2);
    const room = width - INDENT - column - 3 - (mask ? displayWidth(mask) + 1 : 0);
    const name = fit(clean(record.userName, mask ? 'sem nome' : 'desconhecido'), Math.max(6, room));
    const who = `👤 ${paint(name, 'white')}${mask ? ' ' + paint(mask, 'dim') : ''}`;
    const where = record.group
      ? `👥 ${paint(fit(clean(record.groupName) || shortGroup(record.group), width - INDENT - 3), 'green')}`
      : `💬 ${paint('conversa privada', 'yellow')}`;
    return [
      `${stamp(record.time)} ${paint('❯', 'magenta')} ${paint(pad(command, column), 'bold', 'cyan')}${who}`,
      `${blank}${where}`,
    ];
  }

  function eventLines(record, mark, tone, text) {
    const [first, ...rest] = wrap(text, width - INDENT);
    return [`${stamp(record.time)} ${paint(mark, tone)} ${first}`, ...rest.map(line => blank + line)];
  }

  // Conexão: verde quando está no ar, amarelo para o que está em andamento.
  function connectionLines(record) {
    const message = clean(record.msg, 'Conexão atualizada.').slice(0, 200);
    return eventLines(record, '●', /^ONLINE\b/i.test(message) ? 'green' : 'yellow', message);
  }

  function errorLines(record) {
    const baseCode = clean(record.code || record.error?.code || record.err?.code).slice(0, 50);
    const status = Number.isInteger(record.status) && record.status >= 400 && record.status <= 599 ? record.status : null;
    const code = status ? `${status} / ${baseCode}` : baseCode;
    const message = clean(record.msg, 'Erro.').slice(0, 200);
    if (!code) return eventLines(record, '✖', 'red', message);
    // O código fica na mesma linha quando cabe; senão ganha uma linha própria, inteira.
    const single = `${message} · ${code}`;
    if (displayWidth(single) <= width - INDENT) return eventLines(record, '✖', 'red', single);
    return [...eventLines(record, '✖', 'red', message), `${blank}${paint('código ' + fit(code, width - INDENT - 7), 'dim')}`];
  }

  // Cabeçalho mostrado uma vez, quando o bot fica no ar.
  function banner({ name, account, groups, commands, prefix, startedAt } = {}) {
    // Nome próprio só quando a instalação definiu um; o padrão usa símbolos que o painel não desenha.
    const title = clean(name) ? fit(clean(name), width - 18) : 'LOBO-BOT'; // 7 colunas antes, 11 depois
    const rule = char => paint(char.repeat(width - 6), 'magenta');
    const row = (icon, label, value) => `  ${icon} ${paint(pad(label, 9), 'dim')} ${value}`;
    const started = clock(startedAt);
    const count = value => (Number.isInteger(value) && value >= 0 ? String(value) : '—');
    return [
      rule('═'),
      `   🐺  ${paint(title, 'bold', 'white')}  ${paint('•', 'magenta')}  ${paint('ONLINE', 'bold', 'green')}`,
      rule('═'),
      row('📱', 'Conta', maskNumber(account, 4) || '—'),
      row('👥', 'Grupos', count(groups)),
      row('🧩', 'Comandos', `${count(commands)}  ${paint('•', 'magenta')}  prefixo ${paint(clean(prefix, '!').slice(0, 8), 'bold', 'cyan')}`),
      row('🕒', 'Início', `${started.date} ${started.time}`),
      rule('─'),
    ].join('\n');
  }

  return { commandLines, connectionLines, errorLines, banner };
}

// LOG_COLOR=true/false força; sem isso, cores só em terminal de verdade e sem NO_COLOR.
function colorEnabled(env = process.env, stream = process.stdout) {
  const choice = String(env.LOG_COLOR ?? '').trim().toLowerCase();
  if (['true', '1', 'on', 'sim'].includes(choice)) return true;
  if (['false', '0', 'off', 'nao', 'não'].includes(choice)) return false;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  return stream?.isTTY === true;
}

module.exports = { WIDTH, TIME_ZONE, createConsoleStyle, colorEnabled, clean, fit, wrap, clock, maskNumber, displayWidth };
