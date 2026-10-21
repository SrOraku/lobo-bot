import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMenu, decorateMenuText } from '../src/menu-style.js';
import { gameMenu, createGameCommandHandler } from '../src/game/commands.js';
import { rpMenu, handleRPResponse } from '../src/rp/commands.js';
import { DEV_SIGNATURE } from '../src/game/constants.js';
import { BOT_NAME, BOT_DESCRIPTION, loadConfig } from '../src/config.js';

const OWNER = '5543920030769@s.whatsapp.net';
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const GAME_COMMANDS = ['start', 'perfil', 'treino', 'ataque', 'formacao', 'rank', 'loja', 'comprar', 'clan', 'evento', 'admin'];
const RP_COMMANDS = ['rp', 'profissoes', 'profissao', 'trabalhar', 'acao', 'carteira', 'transferir', 'rploja', 'rpcomprar', 'usar', 'inventario', 'familia'];

function config(prefix = '!') {
  return loadConfig({ PREFIX: prefix });
}

function assertIdentity(text) {
  assert.ok(text.includes(BOT_NAME), 'o nome exato do bot deve aparecer no menu');
  assert.ok(text.includes(BOT_DESCRIPTION), 'a descrição literal deve aparecer inteira no menu');
  assert.ok(text.split('\n').includes(`║ ${BOT_DESCRIPTION}`), 'a descrição deve permanecer inteira em uma única linha');
  assert.ok(text.includes(DEV_SIGNATURE), 'a assinatura exata do desenvolvedor deve aparecer no menu');
  assert.ok(text.includes(`+${loadConfig({}).ownerNumber}`), 'o número do dono deve aparecer no menu');
  assert.ok(!text.includes('び᭄꥓〭🐺'), 'a assinatura anterior não deve permanecer no menu');
}

function assertFrame(text) {
  assert.equal(typeof text, 'string');
  assert.ok(text.startsWith('🌹'), 'a moldura deve começar com rosa');
  assert.ok(text.endsWith('🐺'), 'a moldura deve terminar com lobo');
  const lines = text.split('\n');
  assert.ok(lines.length >= 3);
  const borders = lines.filter(line => /[╔╗╚╝╠╣━═─]/u.test(line) && !/[\p{L}\p{N}]/u.test(line));
  assert.ok(borders.length >= 1, 'o menu deve apresentar uma borda visível');
  for (const line of borders) assert.ok([...line].length <= 40, `borda larga demais: ${line}`);
}

function assertCommands(text, prefix, names) {
  for (const name of names) assert.ok(text.includes(`${prefix}${name}`), `comando perdido: ${prefix}${name}`);
  if (prefix !== '!') assert.doesNotMatch(text, /(?:^|\s)![a-z][a-z]+/i, 'não deve aparecer um prefixo padrão no menu customizado');
}

function ctx(prefix) {
  const replies = [];
  return { replies, context: {
    config: config(prefix), sender: OWNER, senderPhone: OWNER, displayName: 'Lobo',
    command: 'loja', args: [], argText: '', chatId: OWNER, isGroup: false, startedAt: NOW - 60_000,
    msg: { message: { conversation: `${prefix}loja` } },
    async reply(text) { replies.push(text); },
  } };
}

test('formatMenu is pure, uses compact borders and keeps signature and command tokens intact', () => {
  const input = {
    title: 'MENU DA LUA', botName: BOT_NAME, subtitle: ['🐺 Estratégia e cidade RP'],
    sections: [{ title: 'COMANDOS', lines: [
      '!!profissoes categoria pagina e outras opções disponíveis para consulta',
      '*?textobemvindo Olá, alcateia! Este texto deve quebrar somente entre palavras.',
    ] }], signature: DEV_SIGNATURE,
  };
  const before = structuredClone(input);
  const text = formatMenu(input);
  assert.deepEqual(input, before);
  assertFrame(text);
  assertIdentity(text);
  assert.ok(text.includes('MENU DA LUA'));
  assert.ok(text.includes('COMANDOS'));
  for (const ornament of ['✦', '❖', '♆']) assert.ok(text.includes(ornament), `ornamento ausente: ${ornament}`);
  assert.ok(text.includes('!!profissoes'));
  assert.ok(text.includes('*?textobemvindo'));
  assert.ok(text.includes(DEV_SIGNATURE), 'assinatura não deve ser cortada ou reescrita');
  assert.ok(text.split('\n').some(line => line.includes('disponíveis')));
});

test('formatMenu accepts a string subtitle without splitting it into characters', () => {
  const text = formatMenu({ title: 'LOJA', botName: BOT_NAME, subtitle: 'WOK Coin da alcateia', sections: [], signature: DEV_SIGNATURE });
  assertFrame(text);
  assertIdentity(text);
  assert.match(text, /WOK Coin da alcateia/);
  assert.ok(text.includes(DEV_SIGNATURE));
});

test('legacy box decorations are replaced while section titles, prices and commands survive', () => {
  const legacy = [
    '🌹╔═━━〔LOJA DA ALCATEIA〕━━╗',
    '║ Catálogo especial da alcateia',
    '╠══〔ITENS LUNARES〕══╣',
    '║ 1. Fúria Lunar — 100 WOK Coin',
    '║ !!comprar 1',
    `║ ${DEV_SIGNATURE}`,
    '╚══════════════════════════╝🐺',
  ].join('\n');
  const text = decorateMenuText(legacy);
  assertFrame(text);
  assertIdentity(text);
  for (const fragment of ['LOJA DA ALCATEIA', 'ITENS LUNARES', 'Catálogo especial da alcateia', 'Fúria Lunar', '!!comprar', DEV_SIGNATURE]) assert.ok(text.includes(fragment), fragment);
  assert.match(text, /100\s+WOK\s+Coin/);
  assert.doesNotMatch(text, /╔═━━〔|║\s*[╔╠╚]/u, 'não deve manter a moldura antiga aninhada');
});

test('decorating an already decorated menu does not duplicate commands or developer signature', () => {
  const original = '🌹═══[MENU]═══🌹\n🐺 !!perfil\n' + DEV_SIGNATURE;
  const first = decorateMenuText(original);
  const second = decorateMenuText(first);
  assertFrame(first);
  assertFrame(second);
  assertIdentity(first);
  assertIdentity(second);
  assert.equal(second.split('!!perfil').length - 1, 1);
  assert.equal(second.split(DEV_SIGNATURE).length - 1, 1);
  assert.equal(second.split(BOT_NAME).length - 1, 1);
  assert.equal(second.split(BOT_DESCRIPTION).length - 1, 1);
  assert.equal(second.split(`+${loadConfig({}).ownerNumber}`).length - 1, 1);
});

test('game menu preserves current wolf and RP commands without restoring removed duel commands', () => {
  for (const prefix of ['!!', '*?']) {
    const text = gameMenu(config(prefix));
    assertFrame(text);
    assertIdentity(text);
    assertCommands(text, prefix, [...GAME_COMMANDS, ...RP_COMMANDS]);
    for (const removed of ['duelo', 'aceitar', 'recusar']) assert.ok(!text.includes(`${prefix}${removed}`), removed);
    assert.ok(text.includes(DEV_SIGNATURE));
  }
});

test('RP menu retains social, profession, inventory and bank command alternatives', () => {
  for (const prefix of ['!!', '*?']) {
    const text = rpMenu(config(prefix));
    assertFrame(text);
    assertIdentity(text);
    assertCommands(text, prefix, RP_COMMANDS);
    for (const action of ['criar', 'perfil', 'convidar', 'casar', 'aceitar', 'recusar', 'sair', 'divorciar', 'depositar', 'retirar']) {
      assert.ok(text.includes(`${prefix}familia ${action}`), action);
    }
    assert.match(text, /WOK Coin/);
    assert.ok(text.includes(DEV_SIGNATURE));
  }
});

test('wolf shop rendering receives the new frame while preserving item effects and purchase prefix', async () => {
  for (const prefix of ['!!', '*?']) {
    const f = ctx(prefix);
    const result = { type: 'shop', items: [
      { id: '1', name: 'Fúria Lunar', type: 'attack', value: 0.2, price: 100 },
      { id: '4', name: 'Treino Alfa', type: 'training', value: 1, price: 200 },
    ] };
    const before = structuredClone(result);
    const handler = createGameCommandHandler({ service: { async execute() { return result; } },
      backupManager: {}, now: () => NOW });
    assert.equal(await handler(f.context), true);
    const text = f.replies.join('\n');
    assertFrame(text);
    assertIdentity(text);
    assert.match(text, /Fúria Lunar/);
    assert.match(text, /Treino Alfa/);
    assert.match(text, /100\s+WOK\s+Coin/);
    assert.match(text, /200\s+WOK\s+Coin/);
    assert.match(text, /20%/);
    assert.match(text, /1 hora/);
    assertCommands(text, prefix, ['comprar']);
    assert.deepEqual(result, before);
  }
});

test('RP shop and professions frames preserve pagination, price, cooldown and action tokens', async () => {
  for (const prefix of ['!!', '*?']) {
    const examples = [
      { result: { type: 'rp-shop', page: 2, totalPages: 4, items: [
        { id: 'agua', name: 'Água Lunar', price: 30, description: 'Recupera a saciedade.' },
      ] }, fragments: ['agua', 'Água Lunar', '30', 'WOK Coin', '2/4'], command: 'rpcomprar', pageCommand: 'rploja' },
      { result: { type: 'rp-jobs', page: 1, totalPages: 3, jobs: [
        { id: 'policial', name: 'Policial', category: 'publica', description: 'Protege a cidade.',
          salary: { min: 100, max: 200 }, cooldownMs: 300_000 },
      ] }, fragments: ['policial', 'Policial', '5min', '100', '200', 'WOK Coin', '1/3'], command: 'profissao', pageCommand: 'profissoes' },
    ];
    for (const example of examples) {
      const f = ctx(prefix);
      const before = structuredClone(example.result);
      assert.equal(await handleRPResponse(f.context, example.result, NOW), true);
      const text = f.replies.join('\n');
      assertFrame(text);
      assertIdentity(text);
      for (const fragment of example.fragments) assert.ok(text.includes(fragment), fragment);
      assertCommands(text, prefix, [example.command, example.pageCommand]);
      assert.deepEqual(example.result, before);
    }
  }
});

test('addon defaults use the exact requested bot, developer and owner identity', () => {
  const defaults = loadConfig({});
  assert.equal(BOT_NAME, '🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑');
  assert.equal(defaults.botName, BOT_NAME);
  assert.equal(BOT_DESCRIPTION, '🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺');
  assert.equal(defaults.botDescription, BOT_DESCRIPTION);
  assert.equal(defaults.ownerNumber, '5543920030769');
  assert.equal(defaults.ownerJid, OWNER);
  assert.equal(DEV_SIGNATURE, '🌹 Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺');
});
