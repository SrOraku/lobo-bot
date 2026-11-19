'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createScheduler, parseReminder, parseRepeat, describeCron, nextCron, brt, LIMITS } = require('../src/scheduler/service');

// Quarta, 18/11/2026, 10:00 em Brasília.
const T0 = Date.parse('2026-11-18T13:00:00Z');
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const GROUP = '120363000000000001@g.us', OTHER = '120363000000000002@g.us';
const ANA = '5511999990001@s.whatsapp.net', BIA = '5511999990002@s.whatsapp.net';

// Banco real com as migrações do projeto; relógio e temporizadores controlados.
function world(t, db = (() => { const raw = new Database(':memory:'); runMigrations(raw); t.after(() => raw.close()); return raw; })()) {
  const clock = { now: T0 }, timers = new Map(), sent = [];
  let seq = 0, fail = false;
  const make = (options = {}) => createScheduler({ db, now: () => clock.now,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: clock.now + ms }); return id; },
    clearTimer: id => timers.delete(id), ...options });
  const sock = { sendMessage: async (chat, message) => { if (fail) throw Error('desconectado'); sent.push({ chat, message }); } };
  // Avança o relógio disparando, em ordem, os temporizadores que vencem.
  async function advance(ms) {
    const target = clock.now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); clock.now = Math.max(clock.now, next[1].at);
      await next[1].fn();
    }
    clock.now = target;
  }
  return { db, clock, timers, sent, sock, make, advance, failSending: value => { fail = value; } };
}

test('lembretes: entendem tempo relativo, horário e data de Brasília', () => {
  const at = (text) => brt(parseReminder(text, T0).at, { year: true });
  assert.equal(at('30m beber água'), '18/11/2026 10:30');
  assert.equal(at('1h30m reunião'), '18/11/2026 11:30');
  assert.equal(at('2d viagem'), '20/11/2026 10:00');
  assert.equal(at('5h acordar'), '18/11/2026 15:00', '"5h" sozinho é daqui a 5 horas, como 30m');
  assert.equal(at('às 5h acordar'), '19/11/2026 05:00', '"às 5h" é horário; já passou hoje, então amanhã');
  assert.equal(at('10:30 café'), '18/11/2026 10:30');
  assert.equal(at('08:00 bom dia'), '19/11/2026 08:00');
  assert.equal(at('25/12 08:00 Feliz Natal'), '25/12/2026 08:00');
  assert.equal(at('25/12 Natal'), '25/12/2026 09:00', 'data sem hora: 9h');
  assert.equal(at('01/01 Ano novo'), '01/01/2027 09:00', 'data que já passou neste ano vai para o próximo');
  assert.equal(at('29/02/2028 bissexto'), '29/02/2028 09:00');
  assert.equal(parseReminder('25/12 08:00 Feliz Natal', T0).text, 'Feliz Natal');
  for (const bad of ['', 'abc texto', '31/02 x', '29/02/2027 x', '25:00 x', '10:61 x', '13/13 x', '0m nada'])
    assert.throws(() => parseReminder(bad, T0), error => String(error.code).startsWith('SCHEDULE_'), bad);
});

test('mensagens repetidas: cron, dia da semana e diário, com descrição legível', () => {
  assert.deepEqual(parseRepeat('"0 8 * * *" Bom dia'), { cron: '0 8 * * *', text: 'Bom dia' });
  assert.deepEqual(parseRepeat('0 8 * * * Bom dia'), { cron: '0 8 * * *', text: 'Bom dia' }, 'sem aspas: o WhatsApp separa por espaço');
  assert.deepEqual(parseRepeat('diario 08:00 Bom dia, matilha!'), { cron: '0 8 * * *', text: 'Bom dia, matilha!' });
  assert.deepEqual(parseRepeat('Segunda-feira 20h Reunião'), { cron: '0 20 * * 1', text: 'Reunião' });
  assert.deepEqual(parseRepeat('sábado 9:30 treino'), { cron: '30 9 * * 6', text: 'treino' });
  assert.equal(describeCron('0 8 * * *'), 'todo dia 08:00');
  assert.equal(describeCron('0 20 * * 1'), 'toda segunda 20:00');
  assert.equal(describeCron('30 9 * * 6'), 'todo sábado 09:30');
  assert.equal(describeCron('*/30 * * * *'), 'cron */30 * * * *');
  assert.equal(nextCron('0 8 * * *', T0), Date.parse('2026-11-19T11:00:00Z'), 'próxima às 8h de Brasília');
  for (const bad of ['', 'qualquer coisa', 'diario 25:00 x', 'segunda x']) assert.throws(() => parseRepeat(bad), error => String(error.code).startsWith('SCHEDULE_'), bad);
});

test('o lembrete sai na hora, mencionando quem pediu, e não se repete', async t => {
  const w = world(t), scheduler = w.make();
  scheduler.attach(w.sock); scheduler.start();
  const item = scheduler.add({ chat: GROUP, kind: 'lembrete', at: T0 + 30 * MIN, text: 'beber água', createdBy: ANA });
  assert.equal(item.id, 1); assert.equal(item.next, T0 + 30 * MIN);
  await w.advance(29 * MIN); assert.equal(w.sent.length, 0);
  await w.advance(MIN);
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].chat, GROUP);
  assert.match(w.sent[0].message.text, /LEMBRETE/); assert.match(w.sent[0].message.text, /@5511999990001 beber água/);
  assert.deepEqual(w.sent[0].message.mentions, [ANA]);
  assert.doesNotMatch(w.sent[0].message.text, /ATRASADO/);
  await w.advance(DAY); assert.equal(w.sent.length, 1);
  assert.deepEqual(scheduler.list(GROUP), []);
  assert.equal(w.db.prepare('SELECT result FROM schedules WHERE id=1').get().result, 'enviado');
});

test('reiniciar o bot não perde nada: tudo é recarregado do banco', async t => {
  const w = world(t);
  const first = w.make(); first.attach(w.sock); first.start();
  first.add({ chat: GROUP, kind: 'lembrete', at: T0 + 2 * HOUR, text: 'remédio', createdBy: ANA });
  first.add({ chat: GROUP, kind: 'mensagem', cron: '0 8 * * *', text: 'Bom dia, matilha!', createdBy: BIA });
  // O processo morre: os temporizadores somem, o banco fica.
  first.stop(); w.timers.clear();
  await w.advance(HOUR); assert.equal(w.sent.length, 0);

  const second = w.make();
  assert.equal(second.start(), 2, 'os dois agendamentos voltam a ser armados');
  assert.equal(second.start(), 2, 'chamar de novo (reconexão) não duplica');
  second.attach(w.sock);
  await w.advance(HOUR);
  assert.deepEqual(w.sent.map(entry => entry.message.text.split('\n').find(line => /remédio|Bom dia/.test(line))?.trim()), ['@5511999990001 remédio']);
  // Mensagem diária: 08:00 de amanhã e depois todo dia, sempre pelo socket atual.
  const newer = { sendMessage: async (chat, message) => w.sent.push({ chat, message, newer: true }) };
  second.attach(newer);
  await w.advance(DAY);
  assert.equal(w.sent.length, 2); assert.equal(w.sent[1].newer, true, 'usa o socket da reconexão, não o antigo');
  assert.match(w.sent[1].message.text, /MENSAGEM AGENDADA/); assert.match(w.sent[1].message.text, /Bom dia, matilha!/);
  await w.advance(DAY); assert.equal(w.sent.length, 3);
  assert.equal(second.list(GROUP).length, 1, 'a repetição continua ativa');
});

test('sem conexão o lembrete espera e tenta de novo; atraso grande é descartado', async t => {
  const w = world(t), scheduler = w.make();
  scheduler.start();
  scheduler.add({ chat: GROUP, kind: 'lembrete', at: T0 + 10 * MIN, text: 'sem socket ainda', createdBy: ANA });
  await w.advance(10 * MIN); assert.equal(w.sent.length, 0);
  assert.equal(scheduler.list(GROUP).length, 1, 'continua ativo');
  scheduler.attach(w.sock);
  await w.advance(LIMITS.retry);
  assert.equal(w.sent.length, 1); assert.match(w.sent[0].message.text, /sem socket ainda/);

  w.failSending(true);
  scheduler.add({ chat: GROUP, kind: 'lembrete', at: w.clock.now + 5 * MIN, text: 'falha de envio', createdBy: ANA });
  await w.advance(LIMITS.lateGrace + 10 * MIN);
  assert.equal(scheduler.list(GROUP).length, 0, 'depois de 24 h tentando, desiste');
  assert.equal(w.db.prepare("SELECT result FROM schedules WHERE payload='falha de envio'").get().result, 'perdido');
});

test('lembrete vencido com o bot desligado: sai como atrasado em até 24 h, senão é descartado', async t => {
  const w = world(t);
  const before = w.make(); before.start();
  before.add({ chat: GROUP, kind: 'lembrete', at: T0 + HOUR, text: 'atrasado', createdBy: ANA });
  before.add({ chat: GROUP, kind: 'lembrete', at: T0 + 2 * HOUR, text: 'muito velho', createdBy: ANA });
  before.stop(); w.timers.clear();
  w.clock.now = T0 + 3 * HOUR; // ficou 2 h desligado: o primeiro venceu há 2 h, o segundo há 1 h
  w.db.prepare("UPDATE schedules SET run_at=? WHERE payload='muito velho'").run(w.clock.now - LIMITS.lateGrace - MIN);
  const after = w.make(); after.attach(w.sock);
  assert.equal(after.start(), 1);
  await w.advance(1);
  assert.equal(w.sent.length, 1); assert.match(w.sent[0].message.text, /LEMBRETE \(ATRASADO\)/); assert.match(w.sent[0].message.text, /atrasado/);
  assert.equal(w.db.prepare("SELECT result FROM schedules WHERE payload='muito velho'").get().result, 'perdido');
});

test('limites: tempo mínimo e máximo, texto, por pessoa, por chat e repetição frequente demais', t => {
  const w = world(t), scheduler = w.make();
  const add = (extra = {}) => scheduler.add({ chat: GROUP, kind: 'lembrete', at: T0 + HOUR, text: 'ok', createdBy: ANA, ...extra });
  const code = fn => { try { fn(); return 'ok'; } catch (error) { return error.code; } };
  assert.equal(code(() => add({ at: T0 + 30_000 })), 'SCHEDULE_TIME');
  assert.equal(code(() => add({ at: T0 + 400 * DAY })), 'SCHEDULE_TIME');
  assert.equal(code(() => add({ text: '   ' })), 'SCHEDULE_TEXT');
  assert.equal(code(() => add({ text: 'x'.repeat(LIMITS.textMax + 1) })), 'SCHEDULE_TEXT');
  assert.equal(code(() => add({ chat: 'inválido' })), 'SCHEDULE_CHAT');
  for (let i = 0; i < LIMITS.perUser; i++) assert.equal(code(() => add()), 'ok');
  assert.equal(code(() => add()), 'SCHEDULE_LIMIT', 'cada pessoa tem até 5 lembretes por chat');
  assert.equal(code(() => add({ createdBy: BIA })), 'ok');
  assert.equal(code(() => add({ chat: OTHER })), 'ok', 'o limite é por chat');
  assert.equal(code(() => scheduler.add({ chat: GROUP, kind: 'mensagem', cron: '* * * * *', text: 'spam' })), 'SCHEDULE_CRON');
  assert.equal(code(() => scheduler.add({ chat: GROUP, kind: 'mensagem', cron: '*/5 * * * *', text: 'spam' })), 'SCHEDULE_CRON');
  assert.equal(code(() => scheduler.add({ chat: GROUP, kind: 'mensagem', cron: 'não é cron', text: 'x' })), 'SCHEDULE_CRON');
  assert.equal(code(() => scheduler.add({ chat: GROUP, kind: 'mensagem', cron: '*/10 * * * *', text: 'ok' })), 'ok', '10 minutos é o mínimo');
  for (let i = scheduler.list(GROUP).length; i < LIMITS.perChat; i++) scheduler.add({ chat: GROUP, kind: 'mensagem', cron: '0 8 * * *', text: 'cheio' });
  assert.equal(code(() => add({ createdBy: '5511999990003@s.whatsapp.net' })), 'SCHEDULE_LIMIT', 'até 30 por chat');
});

test('cancelar: quem criou ou um administrador; nunca de outro chat', t => {
  const w = world(t), scheduler = w.make(); scheduler.start();
  const item = scheduler.add({ chat: GROUP, kind: 'lembrete', at: T0 + HOUR, text: 'meu', createdBy: ANA });
  assert.equal(w.timers.size, 1);
  assert.throws(() => scheduler.cancel(GROUP, item.id, { actor: BIA }), { code: 'SCHEDULE_FORBIDDEN' });
  assert.throws(() => scheduler.cancel(OTHER, item.id, { actor: ANA, canManage: true }), { code: 'SCHEDULE_NOT_FOUND' });
  assert.equal(scheduler.cancel(GROUP, item.id, { actor: ANA }).payload, 'meu');
  assert.equal(w.timers.size, 0, 'o temporizador é desarmado');
  assert.throws(() => scheduler.cancel(GROUP, item.id, { actor: ANA }), { code: 'SCHEDULE_NOT_FOUND' }, 'já cancelado');
  const other = scheduler.add({ chat: GROUP, kind: 'mensagem', cron: '0 8 * * *', text: 'do grupo', createdBy: ANA });
  assert.equal(scheduler.cancel(GROUP, other.id, { actor: BIA, canManage: true }).payload, 'do grupo');
});

test('grupo com o bot pausado: lembrete descartado, repetição pula para o próximo horário', async t => {
  let paused = true;
  const w = world(t), scheduler = w.make({ allowed: () => !paused });
  scheduler.attach(w.sock); scheduler.start();
  scheduler.add({ chat: GROUP, kind: 'lembrete', at: T0 + HOUR, text: 'pausado', createdBy: ANA });
  scheduler.add({ chat: GROUP, kind: 'mensagem', cron: '0 8 * * *', text: 'diária' });
  await w.advance(DAY);
  assert.equal(w.sent.length, 0);
  assert.equal(scheduler.list(GROUP).length, 1, 'só a repetição continua');
  paused = false;
  await w.advance(DAY);
  assert.equal(w.sent.length, 1); assert.match(w.sent[0].message.text, /diária/);
});

test('comandos !lembrete, !agendamentos e !desagendar', async t => {
  const w = world(t), scheduler = w.make(); scheduler.attach(w.sock); scheduler.start();
  const { createScheduleCommands } = require('../src/commands/schedule');
  let actor = { owner: false, admin: false, securityLevel: 0 }, who = ANA;
  const commands = createScheduleCommands({ scheduler: () => scheduler, resolve: async () => ({ id: who, actor }) });
  const replies = [];
  const sock = { sendMessage: async (_, payload) => replies.push(payload.text.replace(/[*_`]/g, '')) };
  const ctx = args => ({ jid: GROUP, sender: who, args, argText: args.join(' '), msg: {} });

  await commands.lembrete(sock, ctx([]));
  assert.match(replies.at(-1), /lembrete 30m beber água/);
  w.clock.now = Date.now(); // o comando interpreta o horário pelo relógio real
  await commands.lembrete(sock, ctx(['30m', 'beber', 'água']));
  assert.match(replies.at(-1), /LEMBRETE CRIADO/); assert.match(replies.at(-1), /beber água/); assert.match(replies.at(-1), /#1/); assert.match(replies.at(-1), /desagendar 1/);
  await commands.lembrete(sock, ctx(['ontem', 'nada']));
  assert.match(replies.at(-1), /❌ Não entendi o horário/);

  who = BIA;
  await commands.agendamentos(sock, ctx([]));
  assert.match(replies.at(-1), /#1 ⏰/); assert.match(replies.at(-1), /beber água — por ··0001/);
  await commands.desagendar(sock, ctx(['1']));
  assert.match(replies.at(-1), /Só quem criou/);
  await commands.desagendar(sock, ctx(['abc']));
  assert.match(replies.at(-1), /desagendar número/);
  actor = { owner: false, admin: true, securityLevel: 1 };
  await commands.desagendar(sock, ctx(['#1']));
  assert.match(replies.at(-1), /#1 cancelado/);
  await commands.agendamentos(sock, ctx([]));
  assert.match(replies.at(-1), /Nenhum agendamento ativo/);
});
