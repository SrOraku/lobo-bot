import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameCommandHandler, gameMenu, isGameCommand } from '../src/game/commands.js';
import { DEV_SIGNATURE, header } from '../src/game/constants.js';
import { generateBattleMessage, resolveBattle } from '../src/game/battle.js';
import { GameError } from '../src/game/validation.js';

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const ACTOR = '5543920030769@s.whatsapp.net';
const TARGET = '5511999999999@s.whatsapp.net';
const TARGET_LID = '700000@lid';
const GROUP = '120363000000000000@g.us';

function player(overrides = {}) {
  return {
    name: 'Lobo Alfa', number: '5543920030769', jid: ACTOR,
    hp: 100, wolves: 20, attack: 10, defense: 8, counter: 2,
    coins: 100, wins: 2, losses: 1, draws: 3, clan: 'Lua Rosa', boosts: [],
    banned: false, lastTraining: NOW - 3_600_000, lastBattle: NOW - 600_000,
    lastEvent: null, createdAt: NOW - 86_400_000, updatedAt: NOW,
    extraTraining: 0, normalTrainingAt: NOW - 3_600_000,
    ...overrides,
  };
}

function fixture(input, initialResponse = { type: 'error', message: 'Resposta de teste.' }) {
  const [command, ...args] = input.trim().split(/\s+/);
  const state = { response: initialResponse, failure: null, backupFailure: null };
  const calls = { service: [], replies: [], sent: [], sleeps: [], backup: 0, logs: [] };
  const logger = Object.fromEntries(['warn', 'error', 'info'].map(method => [method, (...entry) => calls.logs.push(entry)]));
  const service = {
    async execute(request) {
      calls.service.push(request);
      if (state.failure) throw state.failure;
      return state.response;
    },
  };
  const backupManager = {
    async create() {
      calls.backup++;
      if (state.backupFailure) throw state.backupFailure;
      return '/private/server/backups/lobo-2026-10-20.json';
    },
  };
  const ctx = {
    command, args, argText: input.slice(command.length).trim(),
    sender: '123000@lid', senderPhone: ACTOR, displayName: 'Lobo Alfa',
    chatId: GROUP, isGroup: true, config: { prefix: '!' }, startedAt: NOW - 3_660_000,
    msg: { message: { conversation: `!${input}` } },
    async reply(text, extra = {}) { calls.replies.push({ text, extra }); },
    async resolveMember(jid) {
      if (![TARGET, TARGET_LID].includes(jid)) return null;
      return { jid: TARGET_LID, phoneNumber: TARGET, inGroup: true };
    },
    async resolveTarget() { return { jid: TARGET_LID, phoneNumber: TARGET, inGroup: true }; },
    sock: {
      async sendMessage(jid, content) { calls.sent.push({ jid, content }); },
    },
  };
  const handler = createGameCommandHandler({ service, backupManager, logger, now: () => NOW,
    sleep: async ms => { calls.sleeps.push(ms); } });
  return { state, calls, ctx, handler, service, backupManager, logger,
    text: () => calls.replies.map(reply => reply.text).join('\n') };
}

function mention(ctx, mentionedJid = [TARGET_LID]) {
  ctx.msg = { message: { extendedTextMessage: { text: `!${ctx.command} @jogador`, contextInfo: { mentionedJid } } } };
}

test('unrelated commands and group request refusal retain their existing dispatch', async () => {
  for (const command of ['ban @jogador', 'menu', 'duelo @jogador', 'aceitar', 'recusar', 'recusar 700000@lid', 'recusar 5511999999999']) {
    const f = fixture(command);
    assert.equal(isGameCommand(f.ctx.command, f.ctx.args), false);
    assert.equal(await f.handler(f.ctx), false);
    assert.equal(f.calls.service.length, 0);
    assert.equal(f.calls.replies.length, 0);
  }
});

test('direct attack requires exactly one actual mention instead of a quote or implicit private target', async () => {
  for (const kind of ['plain', 'quoted', 'private', 'multiple']) {
    const f = fixture('ataque @jogador', { type: 'error', message: 'Mencione exatamente um jogador.' });
    if (kind === 'quoted') f.ctx.msg = { message: { extendedTextMessage: { text: '!ataque', contextInfo: { participant: TARGET, stanzaId: 'quoted' } } } };
    if (kind === 'private') { f.ctx.isGroup = false; f.ctx.chatId = TARGET; }
    if (kind === 'multiple') mention(f.ctx, [TARGET, '5521999999999@s.whatsapp.net']);
    assert.equal(await f.handler(f.ctx), true);
    assert.equal(f.calls.service.length, 1);
    assert.equal(f.calls.service[0].target, null);
    assert.equal(f.calls.service[0].mentionCount, kind === 'multiple' ? 2 : 0);
    assert.match(f.text(), /mencione exatamente um jogador/i);
  }
});

test('trusted resolution supplies canonical player identities without granting rights by display name', async () => {
  for (const input of ['ataque @jogador', 'acao @jogador', 'familia convidar @jogador parente', 'transferir @jogador 50', 'usar flores @jogador']) {
    const f = fixture(input);
    mention(f.ctx);
    f.ctx.displayName = 'Dono 5543996375955';
    await f.handler(f.ctx);
    const request = f.calls.service[0];
    assert.equal(request.target.jid, TARGET);
    assert.equal(request.actor.jid, ACTOR);
    assert.equal(request.actor.number, '5543920030769');
    assert.equal(request.actor.name, f.ctx.displayName);
    assert.equal(request.chatId, GROUP);
    assert.equal(request.now, NOW);
    assert.equal(request.mentionCount, 1);
    assert.equal(request.isOwner, undefined);
  }
});

test('unresolved sender LID is not transformed into a phone or owner identity', async () => {
  const f = fixture('admin status');
  f.ctx.senderPhone = null;
  f.ctx.sender = '5543996375955@lid';
  f.ctx.displayName = '5543996375955';
  await f.handler(f.ctx);
  assert.equal(f.calls.service[0].actor.jid, '5543996375955@lid');
  assert.ok(f.calls.service[0].actor.number == null);
});

test('successful registration uses the requested welcome and developer signature', async () => {
  const f = fixture('start', { type: 'registered', player: player() });
  await f.handler(f.ctx);
  assert.equal(f.text(), `${header('BEM-VINDO À ALCATEIA')}\n🐺 Registro concluído, lobo.\n💎 HP: 100\n🐺 Lobisomens: 20/100\n💰 WOK Coin: 100\n⚔️ Prepare sua estratégia.\n${DEV_SIGNATURE}`);
});

test('profile includes all player fields and only currently active boosts', async () => {
  const p = player({ boosts: [
    { type: 'attack', effect: 'multiplier', value: 0.2, activatedAt: NOW - 1_000, expiresAt: NOW + 3_600_000 },
    { type: 'counter', effect: 'multiplier', value: 0.3, activatedAt: NOW - 3_600_000, expiresAt: NOW },
    { type: 'defense', effect: 'multiplier', value: 0.2, activatedAt: NOW + 1_000, expiresAt: NOW + 3_600_000 },
  ] });
  const f = fixture('perfil', { type: 'profile', player: p, rank: 4 });
  await f.handler(f.ctx);
  const text = f.text();
  for (const fragment of ['Lobo Alfa', '5543920030769', '100', '20/100', '10', '8', '2', '100', '2', '1', '3', 'Lua Rosa', '4']) assert.ok(text.includes(fragment), fragment);
  assert.match(text, /treino/i);
  assert.match(text, /batalha/i);
  assert.match(text, /20%/);
  assert.doesNotMatch(text, /30%/);
  assert.doesNotMatch(text, new RegExp(DEV_SIGNATURE));
});

test('formation response displays its three caps and used total', async () => {
  const f = fixture('formacao A 40', { type: 'formation', player: player({ attack: 40, defense: 20, counter: 10, wolves: 80 }) });
  await f.handler(f.ctx);
  assert.match(f.text(), /40\/40/);
  assert.match(f.text(), /20\/40/);
  assert.match(f.text(), /10\/20/);
  assert.match(f.text(), /70\/80/);
  assert.match(f.text(), /FORMAÇÃO ALTERADA/);
});

test('ranking output is bounded to top ten without reordering service results', async () => {
  const players = Array.from({ length: 12 }, (_, index) => {
    const number = `55119${90_000_000 + index}`;
    return player({ name: `Lobo #${String(index + 1).padStart(2, '0')}`, wins: 30 - index, number, jid: `${number}@s.whatsapp.net` });
  });
  const f = fixture('rank', { type: 'ranking', players });
  await f.handler(f.ctx);
  assert.match(f.text(), /Lobo #01/);
  assert.match(f.text(), /Lobo #10/);
  assert.doesNotMatch(f.text(), /Lobo #11|Lobo #12/);
  assert.ok(f.text().indexOf('Lobo #01') < f.text().indexOf('Lobo #10'));
});

test('shop response lists item prices and text purchase alternative', async () => {
  const f = fixture('loja', { type: 'shop', items: [
    { id: '1', name: 'Fúria Lunar 🗡️', price: 100, type: 'attack', value: 0.2, duration: 3_600_000 },
    { id: '4', name: 'Treino Alfa 🐺', price: 200, type: 'training', value: 1, duration: 0 },
  ] });
  await f.handler(f.ctx);
  assert.match(f.text(), /Fúria Lunar/);
  assert.match(f.text(), /Treino Alfa/);
  assert.match(f.text(), /100/);
  assert.match(f.text(), /200/);
  assert.match(f.text(), /!comprar/);
});

test('battle response delegates to the single official battle formatter', async () => {
  const battle = resolveBattle(player(), player({ jid: TARGET, number: '5511999999999', name: 'Lua' }), { now: NOW });
  const f = fixture('ataque @jogador', { type: 'battle', battle });
  mention(f.ctx);
  await f.handler(f.ctx);
  assert.equal(f.text(), generateBattleMessage(battle));
});

test('service validation errors and rate limits produce themed feedback without success claims', async () => {
  const f = fixture('comprar 1', { type: 'error', message: 'Moedas insuficientes.', code: 'BALANCE' });
  await f.handler(f.ctx);
  assert.match(f.text(), /Moedas insuficientes/);
  assert.doesNotMatch(f.text(), /Compra concluída|comprou/i);
  const limited = fixture('treino', { type: 'rate-limit', retryAfter: 3_600_000, reason: 'hour' });
  await limited.handler(limited.ctx);
  assert.match(limited.text(), /ANTI-SPAM/);
  assert.match(limited.text(), /Calma, lobo/);
  assert.ok(!limited.text().includes(DEV_SIGNATURE));
});

test('known game errors stay readable and unexpected failures do not expose raw error details', async () => {
  const known = fixture('treino');
  known.state.failure = new GameError('Aguarde 10min para treinar.', 'COOLDOWN');
  await known.handler(known.ctx);
  assert.match(known.text(), /Aguarde 10min/);
  const unknown = fixture('admin status');
  unknown.state.failure = new Error('AUTH_TOKEN=secret-test-token');
  await unknown.handler(unknown.ctx);
  assert.doesNotMatch(unknown.text(), /AUTH_TOKEN|secret-test-token/);
  assert.equal(unknown.calls.sent.length, 0);
});

test('manual backup is performed only after service authorization and shows only the filename', async () => {
  const denied = fixture('admin backup', { type: 'error', message: 'Exclusivo dos donos.' });
  await denied.handler(denied.ctx);
  assert.equal(denied.calls.backup, 0);
  const allowed = fixture('admin backup', { type: 'backup' });
  await allowed.handler(allowed.ctx);
  assert.equal(allowed.calls.backup, 1);
  assert.match(allowed.text(), /lobo-2026-10-20\.json/);
  assert.doesNotMatch(allowed.text(), /\/private\/server/);
});

test('backup failure does not stop the handler from processing later commands', async () => {
  const f = fixture('admin backup', { type: 'backup' });
  f.state.backupFailure = new Error('disk full');
  await f.handler(f.ctx);
  assert.match(f.text(), /backup/i);
  assert.match(f.text(), /falh|não/i);
  f.ctx.command = 'start';
  f.ctx.args = [];
  f.ctx.argText = '';
  f.state.response = { type: 'registered', player: player() };
  await f.handler(f.ctx);
  assert.match(f.text(), /Registro concluído/);
});

test('broadcast sends only authorized recipients, paces sends, and continues after recipient failure', async () => {
  const recipients = [ACTOR, TARGET, '5521999999999@s.whatsapp.net'];
  const f = fixture('admin broadcast Lua nova', { type: 'broadcast', recipients, message: 'Lua nova' });
  f.ctx.sock.sendMessage = async (jid, content) => {
    f.calls.sent.push({ jid, content });
    if (jid === TARGET) throw new Error('contact unavailable');
  };
  await f.handler(f.ctx);
  assert.deepEqual(f.calls.sent.map(item => item.jid), recipients);
  for (const item of f.calls.sent) assert.match(item.content.text, /Lua nova/);
  assert.deepEqual(f.calls.sleeps, [1_000, 1_000]);
  assert.match(f.text(), /2/);
  assert.match(f.text(), /1/);
  const denied = fixture('admin broadcast Lua nova', { type: 'error', message: 'Exclusivo dos donos.' });
  await denied.handler(denied.ctx);
  assert.equal(denied.calls.sent.length, 0);
});

test('background broadcast returns after acknowledgement and reports completion after its pacing gate', { timeout: 2000 }, async () => {
  const recipients = [ACTOR, TARGET, '5521999999999@s.whatsapp.net'];
  const f = fixture('admin broadcast Lua nova', { type: 'broadcast', recipients, message: 'Lua nova' });
  let release;
  let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const sleeping = new Promise(resolve => { entered = resolve; });
  const backgrounds = [];
  const events = [];
  const reply = f.ctx.reply;
  f.ctx.reply = async (...args) => {
    events.push(args[0].includes('AVISO CONCLUÍDO') ? 'summary' : 'ack');
    await reply(...args);
  };
  f.ctx.runInBackground = task => {
    const job = Promise.resolve().then(task);
    backgrounds.push(job);
    job.catch(() => {});
  };
  f.ctx.sock.sendMessage = async (jid, content) => {
    events.push('send');
    f.calls.sent.push({ jid, content });
    if (jid === TARGET) throw new Error('contact unavailable');
  };
  let waits = 0;
  const handler = createGameCommandHandler({ service: f.service, backupManager: f.backupManager, logger: f.logger,
    now: () => NOW, sleep: async ms => {
      f.calls.sleeps.push(ms);
      if (waits++ === 0) { entered(); await gate; }
    } });
  assert.equal(await handler(f.ctx), true);
  await sleeping;
  assert.equal(f.calls.sent.length, 1);
  assert.equal(f.calls.replies.length, 1);
  assert.match(f.calls.replies[0].text, /Mensagem recebida.*fila: 1/);
  assert.equal(events[0], 'ack');
  release();
  await Promise.all(backgrounds);
  assert.deepEqual(f.calls.sent.map(item => item.jid), recipients);
  assert.deepEqual(f.calls.sleeps, [1000, 1000]);
  assert.match(f.calls.replies.at(-1).text, /Enviados: 2 • Falhas: 1/);
  assert.equal(events.at(-1), 'summary');
});

test('two background broadcasts share a serial queue without overlapping recipient sends', { timeout: 2000 }, async () => {
  const recipients = [ACTOR, TARGET];
  const f = fixture('admin broadcast Primeiro', { type: 'broadcast', recipients, message: 'Primeiro' });
  let release;
  let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const sleeping = new Promise(resolve => { entered = resolve; });
  const backgrounds = [];
  f.ctx.runInBackground = task => {
    const job = Promise.resolve().then(task);
    backgrounds.push(job);
    job.catch(() => {});
  };
  let waits = 0;
  const handler = createGameCommandHandler({ service: f.service, backupManager: f.backupManager, logger: f.logger,
    now: () => NOW, sleep: async () => {
      if (waits++ === 0) { entered(); await gate; }
    } });
  await handler(f.ctx);
  await sleeping;
  f.state.response = { type: 'broadcast', recipients, message: 'Segundo' };
  f.ctx.argText = 'broadcast Segundo';
  await handler(f.ctx);
  assert.equal(f.calls.sent.length, 1);
  assert.match(f.calls.replies[1].text, /fila: 2/);
  release();
  await Promise.all(backgrounds);
  const messages = f.calls.sent.map(item => item.content.text);
  assert.equal(messages.length, 4);
  assert.match(messages[0], /Primeiro/);
  assert.match(messages[1], /Primeiro/);
  assert.match(messages[2], /Segundo/);
  assert.match(messages[3], /Segundo/);
  assert.equal(f.calls.replies.filter(reply => reply.text.includes('AVISO CONCLUÍDO')).length, 2);
});

test('game menu follows the configured prefix and retains text commands for all primary actions', () => {
  const text = gameMenu({ prefix: '!!' });
  for (const name of ['start', 'perfil', 'treino', 'ataque', 'formacao', 'rank', 'loja', 'clan', 'evento', 'comprar']) assert.ok(text.includes(`!!${name}`), name);
  for (const name of ['duelo', 'aceitar', 'recusar']) assert.ok(!text.includes(`!!${name}`), name);
  assert.match(text, /MENU DA ALCATEIA/);
  assert.ok(!text.includes(DEV_SIGNATURE));
});

test('game handler dispatches RP responses through the shared interface and wallet', async () => {
  const p = player({ coins: 735 });
  const f = fixture('carteira', { type: 'rp-wallet', player: p });
  assert.equal(isGameCommand('carteira'), true);
  assert.equal(await f.handler(f.ctx), true);
  assert.equal(f.calls.service[0].command, 'carteira');
  assert.equal(f.calls.service[0].actor.jid, ACTOR);
  assert.match(f.text(), /735 WOK Coin/);
  assert.match(f.text(), /Carteira única do RP e dos lobisomens/);
  assert.equal(p.coins, 735);
});

test('integrated menu adds RP careers, families and WOK wallet alongside wolf commands', () => {
  const text = gameMenu({ prefix: '!!' });
  for (const command of ['rp', 'profissoes', 'profissao', 'trabalhar', 'acao', 'carteira', 'transferir', 'rploja', 'rpcomprar', 'usar', 'inventario', 'familia']) {
    assert.ok(text.includes(`!!${command}`), command);
    assert.equal(isGameCommand(command, []), true, command);
  }
  assert.match(text, /MENU RP DA ALCATEIA/);
  assert.match(text, /WOK Coin/);
  assert.match(text, /!!ataque @user/);
  assert.doesNotMatch(text, /!!duelo|!!aceitar|!!recusar/);
});
