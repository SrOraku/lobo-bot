'use strict';
// Agendador central: lembretes e mensagens programadas que sobrevivem a
// reinícios e reconexões.
//
// Tudo fica na tabela `schedules` (migração 16). Ao conectar, o bot recarrega
// o que está ativo e arma um temporizador por item. Na hora de enviar, usa o
// socket atual (attach), e não o da época em que o item foi criado — o antigo
// morria na primeira reconexão.
const { CronTime } = require('cron');

const TIME_ZONE = 'America/Sao_Paulo';
const BRT_OFFSET = -3 * 3_600_000; // o Brasil não tem horário de verão desde 2019
const MAX_TIMER = 2_000_000_000; // setTimeout aceita até ~24,8 dias
const LIMITS = Object.freeze({
  perChat: 30, // itens ativos por chat
  perUser: 5, // lembretes ativos por pessoa em cada chat
  textMax: 500,
  minDelay: 60_000, // lembrete: no mínimo 1 minuto à frente
  maxAhead: 366 * 86_400_000, // e no máximo um ano
  minCronGap: 10 * 60_000, // mensagem repetida: no máximo uma a cada 10 minutos
  lateGrace: 24 * 3_600_000, // lembrete atrasado (bot desligado) ainda sai em até 24 h
  retry: 60_000, // sem conexão: tenta de novo em 1 minuto
});

function failure(message, code = 'SCHEDULE_INVALID') {
  return Object.assign(new Error(message), { code });
}

function cronTime(expression) {
  try { return new CronTime(String(expression).trim(), TIME_ZONE); } catch { throw failure('Horário de repetição inválido.', 'SCHEDULE_CRON'); }
}

/** Próximo disparo de uma expressão cron depois de `after` (ms), em Brasília. */
function nextCron(expression, after) {
  const { DateTime } = require(require.resolve('luxon', { paths: [require.resolve('cron')] }));
  return cronTime(expression).getNextDateFrom(DateTime.fromMillis(after), TIME_ZONE).toMillis();
}

/** Data e hora de Brasília em texto ("25/12 08:00"). */
function brt(ms, { year = false } = {}) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}${year ? '/' + parts.year : ''} ${parts.hour}:${parts.minute}`;
}

function createScheduler({ db, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  allowed = () => true, log = () => {}, render = defaultRender } = {}) {
  const timers = new Map();
  let socket = null, started = false;
  const sql = text => db.prepare(text);

  function row(id) { return sql('SELECT * FROM schedules WHERE id=?').get(id) || null; }
  function activeRows(chat) {
    return chat
      ? sql('SELECT * FROM schedules WHERE active=1 AND chat_jid=? ORDER BY id').all(chat)
      : sql('SELECT * FROM schedules WHERE active=1 ORDER BY id').all();
  }
  function close(id, at, result) {
    sql('UPDATE schedules SET active=0,last_run_at=?,result=? WHERE id=?').run(at, result, id);
    const timer = timers.get(id);
    if (timer) clearTimer(timer);
    timers.delete(id);
  }

  /** Próximo horário de um item ativo. */
  function dueAt(item, from = now()) {
    if (item.kind === 'lembrete' || item.run_at) return Number(item.run_at);
    return nextCron(item.cron_expr, Math.max(from, Number(item.last_run_at) || 0));
  }

  function arm(item, at = dueAt(item)) {
    const previous = timers.get(item.id);
    if (previous) clearTimer(previous);
    const timer = setTimer(() => { timers.delete(item.id); fire(item.id, at); }, Math.max(0, Math.min(at - now(), MAX_TIMER)));
    timer?.unref?.();
    timers.set(item.id, timer);
    return at;
  }

  async function fire(id, at) {
    const item = row(id);
    if (!item || !item.active) return 'cancelado';
    const current = now();
    // Temporizadores longos são divididos; ainda não chegou a hora.
    if (current < at) { arm(item, at); return 'aguardando'; }
    const once = item.kind === 'lembrete';
    // O atraso conta do horário original, não da última tentativa.
    const late = current - (once ? Number(item.run_at) : at);
    if (!allowed(item.chat_jid)) {
      // Bot pausado no grupo: o lembrete é descartado e a repetição segue para o próximo horário.
      if (once) close(id, current, 'pausado');
      else { sql('UPDATE schedules SET last_run_at=? WHERE id=?').run(at, id); arm({ ...item, last_run_at: at }); }
      return 'pausado';
    }
    let sent = false;
    if (socket) {
      try {
        const message = render(item, { late: late > 5 * 60_000 });
        await socket.sendMessage(item.chat_jid, message);
        sent = true;
      } catch (error) { log({ code: error?.code || 'SCHEDULE_SEND_FAILED', id }); }
    }
    if (once) {
      if (sent) { close(id, current, 'enviado'); return 'enviado'; }
      if (late > LIMITS.lateGrace) { close(id, current, 'perdido'); return 'perdido'; }
      arm(item, current + LIMITS.retry); // fica ativo e tenta de novo
      return 'tentando';
    }
    // Repetição: um horário perdido não é reenviado; segue para o próximo.
    sql('UPDATE schedules SET last_run_at=? WHERE id=?').run(at, id);
    arm({ ...item, last_run_at: at });
    return sent ? 'enviado' : 'falhou';
  }

  function validateText(text) {
    const value = String(text ?? '').trim();
    if (!value) throw failure('Escreva a mensagem depois do horário.', 'SCHEDULE_TEXT');
    if (value.length > LIMITS.textMax) throw failure(`A mensagem pode ter até ${LIMITS.textMax} caracteres.`, 'SCHEDULE_TEXT');
    return value;
  }

  /** Cria um lembrete (uma vez, em `at`) ou uma mensagem repetida (`cron`). */
  function add({ chat, kind, at, cron, text, createdBy }) {
    if (!/^\d+(?:-\d+)?@(?:g\.us|s\.whatsapp\.net|lid)$/.test(String(chat))) throw failure('Chat inválido.', 'SCHEDULE_CHAT');
    if (!['lembrete', 'mensagem'].includes(kind)) throw failure('Tipo de agendamento inválido.');
    const payload = validateText(text);
    const current = now();
    let runAt = null, expression = null;
    if (kind === 'lembrete') {
      runAt = Number(at);
      if (!Number.isFinite(runAt) || runAt - current < LIMITS.minDelay) throw failure('O lembrete precisa ser para daqui a pelo menos 1 minuto.', 'SCHEDULE_TIME');
      if (runAt - current > LIMITS.maxAhead) throw failure('O lembrete pode ser para até um ano à frente.', 'SCHEDULE_TIME');
      const mine = sql("SELECT COUNT(*) n FROM schedules WHERE active=1 AND chat_jid=? AND kind='lembrete' AND created_by=?").get(chat, String(createdBy || '')).n;
      if (mine >= LIMITS.perUser) throw failure(`Você já tem ${LIMITS.perUser} lembretes ativos neste chat. Cancele um com !desagendar ID.`, 'SCHEDULE_LIMIT');
    } else {
      expression = String(cron || '').trim();
      const first = nextCron(expression, current), second = nextCron(expression, first);
      if (second - first < LIMITS.minCronGap) throw failure('A mensagem repetida pode sair no máximo uma vez a cada 10 minutos.', 'SCHEDULE_CRON');
    }
    if (sql('SELECT COUNT(*) n FROM schedules WHERE active=1 AND chat_jid=?').get(chat).n >= LIMITS.perChat)
      throw failure(`Este chat já tem ${LIMITS.perChat} agendamentos ativos. Cancele algum com !desagendar ID.`, 'SCHEDULE_LIMIT');
    const info = sql('INSERT INTO schedules(chat_jid,kind,cron_expr,run_at,payload,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(chat, kind, expression, runAt, payload, createdBy ? String(createdBy) : null, current);
    const item = row(Number(info.lastInsertRowid));
    const next = started ? arm(item) : dueAt(item);
    return { ...item, next };
  }

  function list(chat) {
    const current = now();
    return activeRows(chat).map(item => ({ ...item, next: dueAt(item, current) })).sort((a, b) => a.next - b.next);
  }

  /** Cancela se quem pede criou o item ou pode administrar o chat. */
  function cancel(chat, id, { actor, canManage = false } = {}) {
    const item = row(Number(id));
    if (!item || !item.active || item.chat_jid !== chat) throw failure('Não encontrei esse agendamento neste chat. Veja os números com !agendamentos.', 'SCHEDULE_NOT_FOUND');
    if (!canManage && (!actor || item.created_by !== actor)) throw failure('Só quem criou o agendamento ou um administrador pode cancelá-lo.', 'SCHEDULE_FORBIDDEN');
    close(item.id, now(), 'cancelado');
    return item;
  }

  /** Carrega tudo o que está ativo. Chamadas repetidas não duplicam nada. */
  function start() {
    if (started) return timers.size;
    started = true;
    const current = now();
    for (const item of activeRows()) {
      if (item.kind === 'lembrete' && current - Number(item.run_at) > LIMITS.lateGrace) { close(item.id, current, 'perdido'); continue; }
      arm(item);
    }
    return timers.size;
  }

  function attach(sock) { socket = sock || null; }

  function stop() {
    for (const timer of timers.values()) clearTimer(timer);
    timers.clear();
    started = false;
    socket = null;
  }

  return { add, list, cancel, start, attach, stop, fire, pending: () => timers.size };
}

function defaultRender(item, { late = false } = {}) {
  const { card } = require('../ui/text');
  if (item.kind === 'lembrete') {
    const who = /^(\d{8,15})@s\.whatsapp\.net$/.exec(String(item.created_by || ''));
    return {
      text: card(late ? '⏰ LEMBRETE (ATRASADO)' : '⏰ LEMBRETE', [`${who ? '@' + who[1] + ' ' : ''}${item.payload}`], { formatNumbers: false }),
      ...(who ? { mentions: [item.created_by] } : {}),
    };
  }
  return { text: card('⏰ MENSAGEM AGENDADA', [item.payload], { formatNumbers: false }) };
}

// ── Interpretação do que o usuário digita ──────────────────────────────────

const WEEKDAYS = Object.freeze({ domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 });
const plain = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Momento em Brasília (ms) para dia/mês/ano e hora:minuto. */
function brtMs(year, month, day, hour, minute) {
  return Date.UTC(year, month - 1, day, hour, minute) - BRT_OFFSET;
}

function brtParts(ms) {
  const date = new Date(ms + BRT_OFFSET);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * "!lembrete 30m texto", "1h30m", "2d", "08:00 texto", "25/12 08:00 texto",
 * "25/12/2027 texto" (09:00). Devolve { at, text }.
 */
function parseReminder(input, current = Date.now()) {
  const words = String(input ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw failure('Diga quando e o quê.', 'SCHEDULE_USAGE');
  // "às 5h" é horário de relógio; "5h" sozinho é "daqui a 5 horas", como "30m".
  const clock = ['as', 'a'].includes(plain(words[0]));
  if (clock) words.shift();
  const relative = clock ? null : /^(?:(\d{1,3})d)?(?:(\d{1,3})h)?(?:(\d{1,4})(?:m|min)?)?$/i.exec(words[0]);
  if (relative && relative[0] && (relative[1] || relative[2] || /m(in)?$/i.test(words[0]))) {
    const ms = ((Number(relative[1] || 0) * 24 + Number(relative[2] || 0)) * 60 + Number(relative[3] || 0)) * 60_000;
    if (!ms) throw failure('Informe um tempo maior que zero.', 'SCHEDULE_TIME');
    return { at: current + ms, text: words.slice(1).join(' ') };
  }
  let index = 0, date = null, time = null;
  const dateMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(words[0]);
  if (dateMatch) { date = dateMatch; index = 1; }
  const timeMatch = /^(\d{1,2})(?::|h)(\d{2})?$/i.exec(words[index] || '');
  if (timeMatch) { time = timeMatch; index++; }
  if (!date && !time) throw failure('Não entendi o horário.', 'SCHEDULE_USAGE');
  const hour = time ? Number(time[1]) : 9, minute = time ? Number(time[2] || 0) : 0;
  if (hour > 23 || minute > 59) throw failure('Hora inválida.', 'SCHEDULE_TIME');
  const today = brtParts(current);
  let at;
  if (date) {
    const day = Number(date[1]), month = Number(date[2]);
    let year = date[3] ? Number(date[3].length === 2 ? '20' + date[3] : date[3]) : today.year;
    const build = y => brtMs(y, month, day, hour, minute);
    const check = brtParts(build(year));
    if (month < 1 || month > 12 || check.day !== day || check.month !== month) throw failure('Data inválida.', 'SCHEDULE_TIME');
    at = build(year);
    if (!date[3] && at <= current) { year++; at = build(year); }
  } else {
    at = brtMs(today.year, today.month, today.day, hour, minute);
    if (at <= current) at += 86_400_000; // já passou hoje: amanhã
  }
  return { at, text: words.slice(index).join(' ') };
}

/**
 * Repetição para !agendarmensagem: cron entre aspas ou com 5 campos,
 * "diario 08:00", "segunda 20:00". Devolve { cron, text }.
 */
function parseRepeat(input) {
  const raw = String(input ?? '').trim();
  const quoted = /^["“”']([^"“”']+)["“”']\s*([\s\S]*)$/.exec(raw);
  if (quoted) return { cron: quoted[1].trim(), text: quoted[2].trim() };
  const words = raw.split(/\s+/).filter(Boolean);
  const key = plain(words[0]).replace(/-feira$/, '');
  const at = /^(\d{1,2})(?::|h)(\d{2})?$/i.exec(words[1] || '');
  if ((['diario', 'diaria', 'todo-dia', 'todos'].includes(key) || Object.hasOwn(WEEKDAYS, key)) && at) {
    const hour = Number(at[1]), minute = Number(at[2] || 0);
    if (hour > 23 || minute > 59) throw failure('Hora inválida.', 'SCHEDULE_TIME');
    return { cron: `${minute} ${hour} * * ${Object.hasOwn(WEEKDAYS, key) ? WEEKDAYS[key] : '*'}`, text: words.slice(2).join(' ') };
  }
  if (words.length >= 6 && words.slice(0, 5).every(word => /^[\d*/,-]+$/.test(word))) return { cron: words.slice(0, 5).join(' '), text: words.slice(5).join(' ') };
  throw failure('Não entendi a repetição.', 'SCHEDULE_USAGE');
}

/** Texto curto para um cron conhecido; os demais aparecem como estão. */
function describeCron(expression) {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* (\*|\d)$/.exec(String(expression || ''));
  if (!match) return `cron ${expression}`;
  const time = `${match[2].padStart(2, '0')}:${match[1].padStart(2, '0')}`;
  if (match[3] === '*') return `todo dia ${time}`;
  const day = Object.keys(WEEKDAYS).find(name => WEEKDAYS[name] === Number(match[3])) || match[3];
  const label = day.replace('terca', 'terça').replace('sabado', 'sábado');
  return `${['domingo', 'sabado'].includes(day) ? 'todo' : 'toda'} ${label} ${time}`;
}

let shared = null;
function scheduler() {
  if (!shared) shared = createScheduler({
    db: require('../utils/database').db,
    allowed: chat => {
      if (!chat.endsWith('@g.us')) return true;
      try { return require('../activations/store').getStore().get(chat).bot !== false; } catch { return true; }
    },
    log: entry => { try { require('../config/logger').logger.error({ component: 'scheduler', ...entry }, 'Falha ao enviar agendamento.'); } catch { /* sem logger */ } },
  });
  return shared;
}

module.exports = { createScheduler, scheduler, parseReminder, parseRepeat, describeCron, nextCron, brt, LIMITS, TIME_ZONE };
