'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createSettings } = require('../src/security/settings');
const CREATOR = require('../src/config/creator');
const { ownerNumbers, configuredOwners, primaryOwner, protectedOwner, isCreator, CREATOR: EXPORTED } = require('../src/utils/owners');

const CREATOR_JID = CREATOR.number + '@s.whatsapp.net';
const PRINCIPAL = '5511999999999', EXTRA = '5511888888888';
const GROUP = '120777@g.us', GROUP_CREATOR = '5511971111111@s.whatsapp.net', ADMIN = '5511972222222@s.whatsapp.net', MEMBER = '5511973333333@s.whatsapp.net', BOT = '5511974444444@s.whatsapp.net';

// Outra instalação: BOT_OWNER aponta para outro número.
function withOwner(t, owner = PRINCIPAL, extra = '') {
  const saved = { owner: process.env.BOT_OWNER, extra: process.env.BOT_OWNERS };
  process.env.BOT_OWNER = owner; process.env.BOT_OWNERS = extra;
  t.after(() => {
    if (saved.owner === undefined) delete process.env.BOT_OWNER; else process.env.BOT_OWNER = saved.owner;
    if (saved.extra === undefined) delete process.env.BOT_OWNERS; else process.env.BOT_OWNERS = saved.extra;
  });
}

test('o criador é dono absoluto mesmo com outro BOT_OWNER, sem virar o principal', async t => {
  assert.equal(EXPORTED, CREATOR);
  assert.ok(Object.isFrozen(CREATOR));
  assert.deepEqual(Object.keys(CREATOR).sort(), ['name', 'number', 'repository']);
  const config = { get: key => ({ BOT_OWNER: PRINCIPAL, BOT_OWNERS: EXTRA }[key] || '') };
  assert.deepEqual(configuredOwners(config), [PRINCIPAL, EXTRA]);
  assert.deepEqual(ownerNumbers(config), [PRINCIPAL, EXTRA, CREATOR.number]);
  assert.equal(primaryOwner(config), PRINCIPAL);
  // Sem nenhum dono configurado, o criador continua dono mas não vira principal.
  const empty = { get: () => '' };
  assert.deepEqual(ownerNumbers(empty), [CREATOR.number]);
  assert.equal(primaryOwner(empty), '');
  // Se o próprio criador for o BOT_OWNER, ele não é duplicado.
  assert.deepEqual(ownerNumbers({ get: key => (key === 'BOT_OWNER' ? CREATOR.number : '') }), [CREATOR.number]);

  withOwner(t);
  const { resolveLevel, LEVELS } = require('../src/middlewares/permissions');
  const sock = { user: { id: BOT } };
  assert.equal(await resolveLevel(sock, CREATOR_JID, null), LEVELS.OWNER);
  assert.equal(await resolveLevel(sock, CREATOR.number + ':7@s.whatsapp.net', null), LEVELS.OWNER);
  assert.equal(await resolveLevel(sock, PRINCIPAL + '@s.whatsapp.net', null), LEVELS.OWNER);
  assert.equal(primaryOwner(), PRINCIPAL);
  assert.ok(ownerNumbers().includes(CREATOR.number));
  const { resolveActor } = require('../src/activations/access');
  const actor = await resolveActor(sock, { msg: { key: { remoteJid: CREATOR_JID, id: 'pv' } } });
  assert.equal(actor.owner, true);
});

test('@lid nunca vale como criador pelos dígitos', async t => {
  assert.equal(isCreator(CREATOR.number), true);
  assert.equal(isCreator('+' + CREATOR.number), true);
  assert.equal(isCreator(CREATOR_JID), true);
  assert.equal(isCreator(CREATOR.number + '@c.us'), true);
  assert.equal(isCreator(CREATOR.number + ':3@s.whatsapp.net'), true);
  for (const value of [CREATOR.number + '@lid', CREATOR.number + ':3@lid', CREATOR.number + '@g.us', CREATOR.number + '0', 'x' + CREATOR.number, '', null, undefined, PRINCIPAL])
    assert.equal(isCreator(value), false, String(value));

  withOwner(t);
  const { resolveLevel, LEVELS } = require('../src/middlewares/permissions');
  // Um LID com os mesmos dígitos, sem mapeamento confiável, não é o criador.
  assert.notEqual(await resolveLevel({ user: { id: BOT } }, CREATOR.number + '@lid', null), LEVELS.OWNER);
  await assert.rejects(protectedOwner({}, CREATOR.number + '@lid'), /validar/);
  const other = { signalRepository: { lidMapping: { getPNForLID: async () => MEMBER } } };
  assert.equal(await protectedOwner(other, CREATOR.number + '@lid'), false);
  // Só o mapeamento do WhatsApp (LID → telefone do criador) identifica o criador.
  const mapped = { signalRepository: { lidMapping: { getPNForLID: async () => CREATOR_JID } } };
  assert.equal(await protectedOwner(mapped, '98765@lid'), true);
});

function groupFixture(t) {
  const db = new Database(':memory:'); runMigrations(db); t.after(() => db.close());
  const meta = { id: GROUP, owner: GROUP_CREATOR, subject: 'Matilha', participants: [
    { id: GROUP_CREATOR, admin: 'superadmin' }, { id: ADMIN, admin: 'admin' }, { id: MEMBER, admin: null },
    { id: CREATOR_JID, admin: null }, { id: BOT, admin: 'admin' },
  ] };
  const sock = { user: { id: BOT }, groupMetadata: async () => structuredClone(meta), sendMessage: async () => {} };
  // Sem `owners` injetado: usa ownerNumbers() de verdade, como em produção.
  const security = require('../src/security/groups/service').createSecurity({ db, botAdmin: () => false });
  return { db, meta, sock, security };
}

test('num grupo, como membro comum, o criador é dono global e nenhum admin consegue puni-lo', async t => {
  withOwner(t);
  const x = groupFixture(t);
  const self = await x.security.permissions.context(x.sock, GROUP, CREATOR_JID);
  assert.equal(self.actor.globalOwner, true); assert.equal(self.actor.level, 5); assert.equal(self.actor.isAdmin, false);
  for (const actor of [ADMIN, GROUP_CREATOR]) {
    const c = await x.security.permissions.context(x.sock, GROUP, actor);
    const target = await c.identify(CREATOR_JID);
    for (const action of ['ban', 'mute', 'warn', 'remove', 'demote']) {
      const decision = x.security.permissions.canAct(c, action, target);
      assert.equal(decision.allowed, false, `${actor} ${action}`); assert.equal(decision.reason, 'PROTECTED_USER');
    }
    // Um membro comum continua punível pelo mesmo admin.
    assert.equal(x.security.permissions.canAct(c, 'ban', await c.identify(MEMBER)).allowed, true);
  }
  // !ban, !mute, !kick e !advertir consultam protectedOwner.
  assert.equal(await protectedOwner(x.sock, CREATOR_JID, GROUP), true);
  assert.equal(await protectedOwner(x.sock, MEMBER, GROUP), false);
  const sent = [];
  const command = require('../src/commands/warnings').createWarningCommand('add', {
    store: { add: () => assert.fail('o criador nunca recebe advertência'), get: () => 0 },
    resolveActor: async () => ({ owner: false, admin: true, botAdmin: true, phone: ADMIN, jid: ADMIN, securityLevel: 1 }),
  });
  await command({ ...x.sock, sendMessage: async (_, value) => sent.push(value.text) }, {
    jid: GROUP, command: 'advertir', args: ['@criador'], msg: { key: { remoteJid: GROUP, participant: ADMIN, id: 'warn' }, message: { extendedTextMessage: { text: '!advertir', contextInfo: { mentionedJid: [CREATOR_JID] } } } },
  });
  assert.match(sent.at(-1), /PROTEGIDO/);
});

function loadOwnersCommand(t, { actor, owner = PRINCIPAL }) {
  const db = new Database(':memory:'); runMigrations(db); t.after(() => db.close());
  const settings = createSettings(db), sent = [];
  const file = path.join(__dirname, '../src/commands/owners.js');
  const native = require('node:module').createRequire(file), loaded = { exports: {} };
  const mocks = {
    '../activations/access': { resolveActor: async () => actor },
    '../security/settings': settings,
    '../config': { get: key => ({ BOT_OWNER: owner, PREFIX: '!' }[key] || '') },
  };
  require('node:vm').runInNewContext(fs.readFileSync(file, 'utf8'), { module: loaded, require: id => mocks[id] || native(id) });
  const run = async (...args) => { await loaded.exports.owners({ sendMessage: async (_, content) => sent.push(content.text.replace(/`/g, '')) }, { jid: 'chat', args, msg: {} }); return sent.at(-1); };
  return { settings, sent, run };
}

test('!donos lista o criador primeiro e o deixa gerenciar donos junto com o principal', async t => {
  const actor = { owner: true, phone: PRINCIPAL + '@s.whatsapp.net' };
  const panel = loadOwnersCommand(t, { actor });
  const list = await panel.run('lista');
  const creatorLine = list.indexOf('💎 Criador (dono absoluto): +' + CREATOR.number);
  assert.ok(creatorLine >= 0, list);
  assert.ok(creatorLine < list.indexOf('👑 Principal: +' + PRINCIPAL), 'a lista começa pelo criador');
  assert.equal(list.split(CREATOR.number).length - 1, 1, 'o criador não se repete entre os configurados');

  assert.match(await panel.run('adicionar', CREATOR.number), /O criador é dono absoluto em qualquer instalação; não precisa ser cadastrado e não pode ser removido\./);
  assert.match(await panel.run('remover', CREATOR.number), /não pode ser removido/);
  assert.deepEqual(panel.settings.get('owners', []), []);
  await panel.run('adicionar', EXTRA);
  assert.deepEqual(panel.settings.get('owners', []), [EXTRA]);

  // O criador gerencia mesmo sem ser o BOT_OWNER.
  actor.phone = CREATOR_JID;
  await panel.run('adicionar', '5511777777777');
  assert.deepEqual(panel.settings.get('owners', []), [EXTRA, '5511777777777']);
  await panel.run('remover', EXTRA);
  assert.deepEqual(panel.settings.get('owners', []), ['5511777777777']);
  assert.match(await panel.run('remover', PRINCIPAL), /principal não pode ser removido/);

  // Outros donos e o próprio criador por LID não gerenciam.
  for (const phone of [EXTRA + '@s.whatsapp.net', CREATOR.number + '@lid', null]) {
    actor.phone = phone;
    assert.match(await panel.run('adicionar', '5511666666666'), /Somente o dono principal ou o criador podem cadastrar ou remover donos\./);
  }
  assert.deepEqual(panel.settings.get('owners', []), ['5511777777777']);
  actor.owner = false;
  assert.match(await panel.run('lista'), /exclusivo/);
});

test('!criador mostra o cartão com contato clicável e está registrado em info', async () => {
  const { creatorCard, creator } = require('../src/commands/creator');
  const text = creatorCard('!');
  assert.ok(text.includes('CRIADOR DO BOT'));
  for (const line of [
    '🐺 Criado por ' + CREATOR.name,
    '💎 Dono absoluto do projeto em qualquer instalação',
    '📞 Contato: https://wa.me/' + CREATOR.number,
    '💻 Código: https://github.com/SrOraku/lobo-bot',
  ]) assert.ok(text.includes(line), line);
  assert.ok(!/`[^`]*wa\.me/.test(text), 'o link não pode virar texto monoespaçado');
  const sent = [];
  await creator({ sendMessage: async (jid, content, options) => sent.push({ jid, content, options }) }, { jid: 'chat', msg: { key: { id: 'c' } } });
  assert.equal(sent[0].jid, 'chat'); assert.ok(sent[0].content.text.includes('https://wa.me/' + CREATOR.number));

  require('../src/handlers/commands').loadAllCommands();
  const registry = require('../src/core/commandRegistry').registry;
  const entry = registry.get('criador');
  assert.equal(entry.category, 'info');
  for (const alias of ['desenvolvedor', 'criadorbot']) { assert.ok(entry.aliases.includes(alias)); assert.equal(registry.get(alias).name, 'criador'); }
});

test('o menu de informações aponta para !criador sem mostrar números', async t => {
  withOwner(t);
  const sent = [];
  const { createMenu } = require('../src/commands/menu');
  await createMenu({ catalog: () => [], prefix: () => '!', online: () => 1 })({ sendMessage: async (_, content) => sent.push(content) }, { jid: 'chat', args: ['info'], msg: {} });
  const text = sent.map(content => content.text || content.caption || '').join('\n');
  assert.match(text.replace(/`/g, ''), /🧑‍💻 \*Criador:\* !criador/);
  assert.ok(!text.includes(CREATOR.number)); assert.ok(!text.includes(PRINCIPAL));
});

test('o número do criador só existe em src/config/creator.js', () => {
  const root = path.join(__dirname, '../src'), found = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (fs.readFileSync(file).includes(CREATOR.number)) found.push(path.relative(root, file));
    }
  };
  walk(root);
  assert.deepEqual(found, [path.join('config', 'creator.js')]);
  for (const file of ['README.md', 'DEPLOY.md', '.env.example'])
    assert.ok(!fs.readFileSync(path.join(__dirname, '..', file), 'utf8').includes(CREATOR.number), file);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../DEPLOY.md'), 'utf8'), /BOT_OWNER=\d/);
});
