'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createMenu } = require('../src/commands/menu');
const { CATEGORIES, buildCatalog } = require('../src/menus/catalog');
const { IDENTITY } = require('../src/menus/render');
const addon = require('../plugins/alcateia-rp');
// O timer de manutenção do antiflood não deve prender este processo de teste.
const interval = global.setInterval;
global.setInterval = (...args) => interval(...args).unref();
const registry = require('../src/core/commandRegistry');
const { loadAllCommands } = require('../src/handlers/commands');
global.setInterval = interval;
loadAllCommands();
after(() => require('../src/utils/database').db.close());
const entries = buildCatalog(registry.listAll(), { ...addon.commands, olamundo: () => {} });
async function render(args = [], prefix = '!!', extra = {}) {
  const sent = [],
    msg = { key: { id: 'menu' } };
  const handler = createMenu({
    catalog: () => entries,
    prefix: () => prefix,
    online: () => 3661,
    now: () => 5,
  });
  await handler(
    { sendMessage: async (jid, content, options) => sent.push({ jid, content, options }) },
    { jid: 'test@g.us', msg, args, pushName: 'Teste', ...extra },
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].options.quoted, msg);
  return sent[0].content.text;
}
for (const category of ['', ...Object.keys(CATEGORIES)]) {
  test(`menu ${category || 'principal'} preserva moldura, identidade e prefixo`, async () => {
    const text = await render(category ? [category] : []);
    assert.ok(text.startsWith('🌹'));
    assert.ok(text.endsWith('🐺'));
    for (const value of Object.values(IDENTITY)) assert.ok(text.includes(value));
    assert.match(text, /╔.*❖.*♆/u);
    assert.match(text, /╚.*🌹/u);
    assert.ok(text.includes('!!menu'));
    assert.ok(!text.includes('!menu ') || text.includes('!!menu '));
    assert.ok(text.length < 6000);
    for (const command of entries.filter((c) => c.category === category))
      assert.ok(text.includes('!!' + command.name), command.name);
  });
}
test('principal compacto só mostra categorias e dados, sem despejar comandos', async () => {
  const text = await render();
  for (const c of Object.keys(CATEGORIES)) assert.ok(text.includes('!!menu ' + c));
  for (const name of ['ban', 'treino', 'trabalhar', 'sticker', 'ytmp3'])
    assert.ok(!text.includes('!!' + name));
  for (const label of [
    'Usuário:',
    'Prefixo:',
    'Versão:',
    'Uptime:',
    'Ping interno:',
    'Status:',
    'Comandos:',
  ])
    assert.ok(text.includes(label));
  assert.ok(text.length < 2400);
});
test('categoria inválida apresenta só categorias válidas e aliases antigos continuam', async () => {
  assert.match(await render(['errada']), /CATEGORIA NÃO ENCONTRADA/);
  for (const [alias, target] of Object.entries(require('../src/menus/catalog').CATEGORY_ALIASES))
    assert.equal(await render([alias]), await render([target]));
  assert.equal(await render(['JOGOS']), await render(['jogos']));
});
test('todos os comandos e plugins carregados têm categoria e handler; aliases mantidos', () => {
  for (const c of entries) {
    assert.ok(CATEGORIES[c.category], c.name);
    assert.ok(c.description);
    assert.ok(c.permission);
  }
  for (const c of registry.listAll())
    for (const alias of c.aliases)
      assert.equal(registry.registry.get(alias), registry.registry.get(c.name));
  for (const name of ['play_audio', 'play_video'])
    assert.equal(typeof registry.registry.get(name).handler, 'function');
  assert.equal(registry.registry.get('play_audio'), registry.registry.get('ytmp3'));
  assert.equal(registry.registry.get('play_video'), registry.registry.get('ytmp4'));
  assert.equal(registry.registry.get('ban').minLevel, 1);
  assert.equal(registry.registry.get('broadcast').minLevel, 3);
  assert.ok(!registry.registry.has('rp'));
  assert.ok(!registry.registry.has('alcateia'));
});
test('alcateia não despeja RP e categorias vazias não inventam funções', async () => {
  const text = await render(['alcateia']);
  assert.ok(!text.includes('!!familia'));
  assert.ok(!text.includes('!!rp iniciar'));
  for (const c of ['ia', 'ferramentas']) assert.match(await render([c]), /Nenhum comando/);
  assert.ok(!(await render(['midia'])).includes('!!sticker'));
  assert.ok((await render(['midia'])).includes('!!play '));
});
test('atalhos não concedem permissões e usuário não injeta linhas no menu', async () => {
  const handler = registry.registry.get('midia').handler,
    sent = [];
  await handler(
    { sendMessage: async (j, c) => sent.push(c.text) },
    { jid: 'p@s.whatsapp.net', args: [], msg: {} },
  );
  assert.ok(sent[0].includes('MÍDIA'));
  const text = await render([], '$', { pushName: 'Pessoa\n*Dono*' });
  assert.ok(!text.includes('Pessoa\n*Dono*'));
});

test('roteamento mantém grupo, níveis e cooldown no dispatcher real', async () => {
  const { execute, register } = registry;
  let calls = 0;
  const sent = [];
  const sock = {
    sendMessage: async (j, c) => sent.push(c.text),
    groupMetadata: async () => ({
      participants: [{ id: '5511912345678@s.whatsapp.net', admin: 'admin' }],
    }),
  };
  register({
    name: 'teste_permissao_menu',
    minLevel: 1,
    groupOnly: true,
    handler: async () => calls++,
  });
  const ctx = (sender, isGroup) => ({
    sender,
    senderNumber: sender.split('@')[0],
    jid: isGroup ? 'fixture-perm@g.us' : sender,
    isGroup,
    msg: {},
    args: [],
  });
  await execute('teste_permissao_menu', sock, ctx('5511900000001@s.whatsapp.net', false));
  await execute('teste_permissao_menu', sock, ctx('5511900000002@s.whatsapp.net', true));
  assert.equal(calls, 0);
  await execute('teste_permissao_menu', sock, ctx('5511912345678@s.whatsapp.net', true));
  assert.equal(calls, 1);
  await execute('teste_permissao_menu', sock, ctx('5511912345678@s.whatsapp.net', true));
  assert.equal(calls, 1, 'cooldown permanece ativo');
  await execute('teste_permissao_menu', sock, ctx('5543920030769@s.whatsapp.net', true));
  assert.equal(calls, 2);
  assert.ok(sent.length >= 2);
});
