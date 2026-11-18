'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../src/ui/console');
const { createGroupNames } = require('../src/utils/group-names');

// 15/11/2026, 11:00:17 UTC = 08:00 em Brasília.
const T = Date.parse('2026-11-15T11:00:17Z');
const plainStyle = ui.createConsoleStyle();
const widest = lines => Math.max(...lines.join('\n').split('\n').map(line => ui.displayWidth(line)));
const command = (extra = {}) => ({ time: T, prefix: '!', command: 'menu', sender: '5543999990769@s.whatsapp.net', userName: 'Oraku',
  group: '120363427741314399@g.us', groupName: 'Matilha dos Lobos', ...extra });

test('a hora do console é a de Brasília, não a do servidor', () => {
  assert.deepEqual(ui.clock(T), { time: '08:00', date: '15/11' });
  assert.deepEqual(ui.clock(Date.parse('2026-11-15T02:30:00Z')), { time: '23:30', date: '14/11' });
  assert.equal(ui.TIME_ZONE, 'America/Sao_Paulo');
  assert.match(ui.clock('inválido').time, /^\d{2}:\d{2}$/);
});

test('o número aparece só pelo final, e identificadores que não são telefone não viram número', () => {
  assert.equal(ui.maskNumber('5543999990769@s.whatsapp.net'), '··0769');
  assert.equal(ui.maskNumber('5543999990769:12@s.whatsapp.net', 4), '····0769');
  assert.equal(ui.maskNumber('5543999990769@c.us'), '··0769');
  assert.equal(ui.maskNumber('5543999990769'), '··0769');
  for (const value of ['123456789@lid', '120363427741314399@g.us', 'status@broadcast', '', null, undefined, 'abc']) assert.equal(ui.maskNumber(value), '', String(value));
});

test('cada comando ocupa duas linhas: o pedido e quem pediu; depois, o grupo pelo nome', () => {
  assert.deepEqual(plainStyle.commandLines(command()), [
    '08:00 ❯ !menu        👤 Oraku ··0769',
    '        👥 Matilha dos Lobos',
  ]);
  // As pessoas ficam alinhadas na mesma coluna em comandos de tamanhos diferentes.
  const longer = plainStyle.commandLines(command({ command: 'ativacoes', userName: 'Luna' }))[0];
  assert.equal(longer.indexOf('👤'), '08:00 ❯ !menu        👤'.indexOf('👤'));
  assert.deepEqual(plainStyle.commandLines(command({ group: null, groupName: null }))[1], '        💬 conversa privada');
  // Sem nome conhecido, o grupo aparece pelo final do identificador, nunca inteiro.
  const unknown = plainStyle.commandLines(command({ groupName: '' }));
  assert.equal(unknown[1], '        👥 grupo ··4399'); assert.ok(!unknown.join('\n').includes('120363427741314399'));
  assert.ok(!plainStyle.commandLines(command()).join('\n').includes('5543999990769'), 'o telefone completo não aparece');
  // Quem não tem nome nem telefone visível ainda é identificado de alguma forma.
  assert.match(plainStyle.commandLines(command({ sender: '99@lid', userName: '' }))[0], /👤 desconhecido$/);
  assert.match(plainStyle.commandLines(command({ userName: '' }))[0], /👤 sem nome ··0769$/);
});

test('nada passa de 44 colunas, mesmo com nomes enormes, emoji e símbolos', () => {
  assert.equal(ui.WIDTH, 44);
  const extremes = [
    command({ userName: '🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺 nome muito comprido mesmo', groupName: 'Grupo com um nome realmente muito grande para caber na tela' }),
    command({ command: 'tiktok_video_audio_extra_longo', prefix: '#####', userName: '名前がとても長いユーザーです' }),
    command({ userName: '👨‍👩‍👧‍👦'.repeat(10), groupName: '🐺'.repeat(60) }),
    command({ command: 'x'.repeat(200), userName: 'y'.repeat(200), groupName: 'z'.repeat(200) }),
  ];
  for (const record of extremes) {
    const lines = plainStyle.commandLines(record);
    assert.equal(lines.length, 2); assert.ok(widest(lines) <= ui.WIDTH, `${widest(lines)}: ${lines[0]}`);
  }
  assert.match(plainStyle.commandLines(extremes[0])[0], /…/, 'nome cortado termina com reticências');
  assert.ok(widest(plainStyle.connectionLines({ time: T, msg: 'Reconectando ao WhatsApp: tentativa 10/10 em 60s. '.repeat(3) })) <= ui.WIDTH);
  assert.ok(widest(plainStyle.errorLines({ time: T, msg: 'Falha no ciclo de conexão; a sessão foi preservada.', code: 'UM_CODIGO_DE_ERRO_BEM_COMPRIDO_MESMO_ASSIM' })) <= ui.WIDTH);
  assert.ok(widest([plainStyle.banner({ name: 'Um nome de bot personalizado e bem grande', account: '5543999990769@s.whatsapp.net', groups: 123456, commands: 214, prefix: '!!!!!!!!!!', startedAt: T })]) <= ui.WIDTH);
});

test('texto vindo do WhatsApp não controla o terminal nem forja linhas', () => {
  const hostile = 'Ana\nFORGED\r\x1b[2J\x1b]0;titulo\x07\u202eodnum\u2028x\u200b';
  for (const style of [plainStyle, ui.createConsoleStyle({ color: true })]) {
    const lines = style.commandLines(command({ userName: hostile, groupName: hostile, command: 'menu\n\x1b[31m' }));
    assert.equal(lines.length, 2);
    const text = lines.join('\n');
    assert.equal(text.split('\n').length, 2, 'nenhuma linha extra');
    assert.equal(text.replace(/\x1b\[[0-9;]+m/g, '').search(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u200b\u202a-\u202e]/), -1, 'só sobram as cores do próprio bot');
  }
  assert.equal(ui.clean('  a \t\n b  '), 'a b'); assert.equal(ui.clean('', 'x'), 'x'); assert.equal(ui.clean(null, 'x'), 'x');
});

test('conexão e erro: uma marca por tipo, texto quebrado com recuo e código inteiro', () => {
  assert.deepEqual(plainStyle.connectionLines({ time: T, msg: 'ONLINE — WhatsApp conectado.' }), ['08:00 ● ONLINE — WhatsApp conectado.']);
  assert.deepEqual(plainStyle.connectionLines({ time: T, msg: 'Reconectando ao WhatsApp: tentativa 1/10 em 5s.' }), [
    '08:00 ● Reconectando ao WhatsApp: tentativa',
    '        1/10 em 5s.',
  ]);
  assert.deepEqual(plainStyle.errorLines({ time: T, msg: 'Falha de escrita', code: 'EACCES' }), ['08:00 ✖ Falha de escrita · EACCES']);
  assert.deepEqual(plainStyle.errorLines({ time: T, msg: 'Falha no transporte do WhatsApp.', err: { code: 'WHATSAPP_TRANSPORT' } }), [
    '08:00 ✖ Falha no transporte do WhatsApp.',
    '        código WHATSAPP_TRANSPORT',
  ]);
  assert.deepEqual(plainStyle.errorLines({ time: T, msg: 'Erro real' }), ['08:00 ✖ Erro real']);
  const colored = ui.createConsoleStyle({ color: true });
  assert.ok(colored.connectionLines({ time: T, msg: 'ONLINE — ok' })[0].includes('\x1b[92m●'), 'no ar: verde');
  assert.ok(colored.connectionLines({ time: T, msg: 'Reconectando' })[0].includes('\x1b[93m●'), 'em andamento: amarelo');
  assert.ok(colored.errorLines({ time: T, msg: 'Falhou' })[0].includes('\x1b[91m✖'), 'erro: vermelho');
});

test('o cabeçalho resume a instalação sem marcas do WhatsApp nem telefone completo', () => {
  const banner = plainStyle.banner({ account: '5543999990769:3@s.whatsapp.net', groups: 12, commands: 214, prefix: '!', startedAt: T });
  assert.deepEqual(banner.split('\n'), [
    '══════════════════════════════════════',
    '   🐺  LOBO-BOT  •  ONLINE',
    '══════════════════════════════════════',
    '  📱 Conta     ····0769',
    '  👥 Grupos    12',
    '  🧩 Comandos  214  •  prefixo !',
    '  🕒 Início    15/11 08:00',
    '──────────────────────────────────────',
  ]);
  assert.doesNotMatch(banner, /[*_`]/, 'sem negrito/itálico do WhatsApp'); assert.ok(!banner.includes('5543999990769'));
  const partial = plainStyle.banner({ name: 'Matilha Bot', startedAt: T });
  assert.match(partial, /🐺 {2}Matilha Bot {2}• {2}ONLINE/); assert.match(partial, /Conta {5}—/); assert.match(partial, /Grupos {4}—/); assert.match(partial, /Comandos {2}— {2}• {2}prefixo !/);
});

test('cores: LOG_COLOR manda; sem ele, só em terminal de verdade e sem NO_COLOR', () => {
  const tty = { isTTY: true }, pipe = { isTTY: false };
  assert.equal(ui.colorEnabled({}, tty), true); assert.equal(ui.colorEnabled({}, pipe), false); assert.equal(ui.colorEnabled({}, undefined), false);
  assert.equal(ui.colorEnabled({ NO_COLOR: '1' }, tty), false); assert.equal(ui.colorEnabled({ NO_COLOR: '' }, tty), true);
  for (const value of ['true', '1', 'ON', ' sim ']) assert.equal(ui.colorEnabled({ LOG_COLOR: value, NO_COLOR: '1' }, pipe), true, value);
  for (const value of ['false', '0', 'off', 'não']) assert.equal(ui.colorEnabled({ LOG_COLOR: value }, tty), false, value);
  assert.equal(ui.colorEnabled({ LOG_COLOR: 'talvez' }, tty), true, 'valor desconhecido cai no automático');
  assert.ok(!plainStyle.commandLines(command()).join('').includes('\x1b'));
});

test('nomes de grupo: uma listagem ao conectar, eventos e busca em segundo plano', async () => {
  let clock = 1_000_000, listings = 0, lookups = 0, fail = false;
  const names = createGroupNames({ now: () => clock, max: 3 });
  const sock = {
    async groupFetchAllParticipating() { listings++; if (fail) throw Error('rede'); return { '1@g.us': { subject: 'Matilha' }, '2@g.us': { subject: '  Lua   Cheia ' }, '3@g.us': {}, 'x@s.whatsapp.net': { subject: 'não é grupo' } }; },
    async groupMetadata(jid) { lookups++; if (jid === '9@g.us') throw Error('sem acesso'); return { subject: 'Grupo ' + jid[0] }; },
  };
  assert.equal(names.nameOf('1@g.us'), null);
  assert.equal(await names.prime(sock), 2);
  assert.equal(names.nameOf('1@g.us'), 'Matilha'); assert.equal(names.nameOf('2@g.us'), 'Lua Cheia'); assert.equal(names.nameOf('3@g.us'), null);
  assert.equal(names.nameOf('x@s.whatsapp.net'), null);
  // Reconexões seguidas não repetem a listagem; depois de 10 minutos, sim.
  await names.prime(sock); assert.equal(listings, 1);
  clock += 10 * 60_000 + 1; await names.prime(sock); assert.equal(listings, 2);
  // Falha na listagem não quebra nada e permite tentar de novo.
  fail = true; clock += 10 * 60_000 + 1; assert.equal(await names.prime(sock), 2); fail = false;
  await names.prime(sock); assert.equal(listings, 4);
  assert.equal(await names.prime({}), 2, 'socket sem a função é ignorado');

  // Grupo desconhecido: uma consulta em segundo plano, sem repetir a cada comando.
  assert.equal(names.lookup(sock, '3@g.us'), true); assert.equal(names.lookup(sock, '3@g.us'), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(names.nameOf('3@g.us'), 'Grupo 3'); assert.equal(lookups, 1);
  assert.equal(names.lookup(sock, '3@g.us'), false, 'nome conhecido não consulta');
  assert.equal(names.lookup(sock, '5511@s.whatsapp.net'), false);
  assert.equal(names.lookup(sock, '9@g.us'), true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(names.nameOf('9@g.us'), null); assert.equal(names.lookup(sock, '9@g.us'), false, 'falha não vira tempestade de consultas');
  clock += 5 * 60_000 + 1; assert.equal(names.lookup(sock, '9@g.us'), true);

  // Eventos de grupo atualizam o nome; o cache tem limite de tamanho.
  assert.equal(names.remember('1@g.us', 'Matilha Nova'), true); assert.equal(names.nameOf('1@g.us'), 'Matilha Nova');
  assert.equal(names.remember('1@g.us', '   '), false); assert.equal(names.remember('nao-grupo', 'x'), false);
  names.remember('4@g.us', 'Quatro'); assert.equal(names.size(), 3); assert.equal(names.nameOf('4@g.us'), 'Quatro');
});

test('o bot usa o console novo ao conectar e ao receber comandos', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const runtime = read('src/runtime.js');
  assert.match(runtime, /await announceOnline\(currentSocket, user\)/); assert.match(runtime, /createOnlineNotice\(/);
  assert.doesNotMatch(runtime, /terminal\.interactive\(require\('\.\/menus\/render'\)\.connectionNotice\(\)\)/, 'o cartão do WhatsApp não é mais impresso cru no console');
  assert.match(runtime, /sendMessage\(`\$\{ownerJid\}@s\.whatsapp\.net`, \{ text: require\('\.\/menus\/render'\)\.connectionNotice\(\) \}\)/, 'o dono continua recebendo o aviso no WhatsApp');
  assert.match(runtime, /session\.listen\('groups\.upsert'/);
  assert.match(read('src/handlers/message.js'), /groupNames\.nameOf\(jid\) \|\| db\.getGroup\(jid\)\?\.name/);
});

test('primeira conexão mostra o cabeçalho; reconexões mostram só uma linha', async () => {
  const { createOnlineNotice } = require('../src/connection/online-notice');
  const printed = [], logs = [];
  let primeResult = Promise.resolve(12);
  const config = { get: key => ({ BOT_NAME: 'padrão', PREFIX: '!' }[key]), DEFAULTS: { BOT_NAME: 'padrão' } };
  const announce = createOnlineNotice({ print: text => printed.push(text), logConnection: (...args) => logs.push(args), config, wait: 30, now: () => T, color: () => false,
    groupNames: { prime: () => primeResult }, commandsCount: () => 214 });
  assert.equal(await announce({}, { id: '5543999990769:3@s.whatsapp.net' }), true);
  assert.equal(printed.length, 1);
  assert.match(printed[0], /LOBO-BOT {2}• {2}ONLINE/); assert.match(printed[0], /Conta {5}····0769/); assert.match(printed[0], /Grupos {4}12/); assert.match(printed[0], /Comandos {2}214/); assert.match(printed[0], /15\/11 08:00/);
  assert.deepEqual(logs, [['ONLINE — WhatsApp conectado.', { silent: true }]], 'o registro vai para o arquivo sem repetir no console');
  // Reconexão: nada de cabeçalho de novo.
  assert.equal(await announce({}, { id: '5543999990769@s.whatsapp.net' }), false);
  assert.equal(printed.length, 1); assert.deepEqual(logs[1], ['ONLINE — WhatsApp conectado.']);

  // Listagem lenta ou com erro não trava o início: os campos desconhecidos viram um traço.
  for (const prime of [() => new Promise(() => {}), () => Promise.reject(Error('rede')), () => { throw Error('sem função'); }]) {
    const out = [];
    const slow = createOnlineNotice({ print: text => out.push(text), logConnection: () => {}, config: { get: key => ({ BOT_NAME: 'Matilha Bot', PREFIX: '#' }[key]), DEFAULTS: { BOT_NAME: 'padrão' } },
      wait: 20, now: () => T, color: () => false, groupNames: { prime }, commandsCount: () => { throw Error('catálogo indisponível'); } });
    const started = Date.now();
    await slow({}, undefined);
    assert.ok(Date.now() - started < 2000);
    assert.match(out[0], /Matilha Bot {2}• {2}ONLINE/); assert.match(out[0], /Conta {5}—/); assert.match(out[0], /Grupos {4}—/); assert.match(out[0], /Comandos {2}— {2}• {2}prefixo #/);
  }
});
