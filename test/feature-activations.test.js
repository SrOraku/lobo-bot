'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations, migrations } = require('../src/config/migrations');
const { createPolicyStore } = require('../src/activations/store');
const { createManager } = require('../src/activations/manager');
const registry = require('../src/activations/registry');
const A = '1200001@g.us',
  B = '1200002@g.us',
  admin = { admin: true, owner: false, phone: '5511999999999@s.whatsapp.net' },
  owner = { admin: false, owner: true, phone: '5543920030769@s.whatsapp.net' };
function fixture(t) {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare('INSERT INTO groups(jid) VALUES (?)').run(A);
  db.prepare('INSERT INTO groups(jid) VALUES (?)').run(B);
  const store = createPolicyStore(db),
    manager = createManager(store);
  t.after(() => db.close());
  return { db, store, manager };
}
test('admin ativa/desativa e alias modifica exatamente a mesma configuração', async (t) => {
  const f = fixture(t);
  await f.manager.enableFeature(A, 'anti-link', { actor: admin, botAdmin: true });
  assert.ok(f.manager.isEnabled(A, 'antilink'));
  assert.ok(f.manager.isEnabled(A, 'anti-link'));
  assert.equal(f.db.prepare('SELECT antilink FROM groups WHERE jid=?').get(A).antilink, 1);
  await f.manager.disableFeature(A, 'antilink', { actor: admin });
  assert.ok(!f.manager.isEnabled(A, 'antilink'));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM activation_audit').get().n, 2);
});
test('membro, função inválida, grupo inválido e ausência de admin do bot são recusados', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.manager.enableFeature(A, 'antilink', { actor: {} }), /administradores/);
  await assert.rejects(f.manager.enableFeature(A, 'xyz', { actor: owner }), /não encontrada/);
  await assert.rejects(
    f.manager.enableFeature('wrong', 'antilink', { actor: owner }),
    /Grupo inválido/,
  );
  await assert.rejects(
    f.manager.enableFeature(A, 'antilink', { actor: admin, botAdmin: false }),
    /bot seja administrador/,
  );
  assert.ok(!f.manager.isEnabled(A, 'antilink'));
});
test('idempotência não duplica auditoria e grupos são independentes', async (t) => {
  const f = fixture(t);
  await f.manager.enableFeature(A, 'antilink', { actor: owner, botAdmin: true });
  const repeat = await f.manager.enableFeature(A, 'antilink', { actor: owner, botAdmin: true });
  assert.equal(repeat.changed.length, 0);
  assert.equal(repeat.unchanged.length, 1);
  assert.ok(!f.manager.isEnabled(B, 'antilink'));
  const off = await f.manager.disableFeature(B, 'antilink', { actor: admin });
  assert.equal(off.changed.length, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM activation_audit').get().n, 1);
});
test('cache não lê SQL por consulta e falha de banco preserva o estado em memória', async (t) => {
  const f = fixture(t);
  await f.manager.enableFeature(A, 'antilink', { actor: owner, botAdmin: true });
  f.store.get(A);
  f.db.exec('PRAGMA query_only=ON');
  await assert.rejects(f.manager.disableFeature(A, 'antilink', { actor: admin }));
  assert.ok(f.manager.isEnabled(A, 'antilink'));
  f.db.exec('PRAGMA query_only=OFF');
  await f.manager.disableFeature(A, 'antilink', { actor: admin });
  assert.ok(!f.manager.isEnabled(A, 'antilink'));
});
test('duas alterações próximas preservam ambos os campos', async (t) => {
  const f = fixture(t);
  await Promise.all([
    f.manager.enableFeature(A, 'antilink', { actor: admin, botAdmin: true }),
    f.manager.enableFeature(A, 'anticontato', { actor: admin, botAdmin: true }),
  ]);
  assert.ok(f.manager.isEnabled(A, 'antilink'));
  assert.ok(f.manager.isEnabled(A, 'anticontato'));
});
test('migração mantém flags antigas, setores, delegações e dados de usuário', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT)');
  for (const m of migrations.filter((m) => m.version < 5)) {
    db.exec(m.up);
    db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(m.version, m.name);
  }
  db.prepare('INSERT INTO groups(jid,antilink,welcome,goodbye) VALUES (?,1,0,1)').run(A);
  db.prepare('INSERT INTO users(jid,name,gold) VALUES (?,?,?)').run(
    '5511888888888@s.whatsapp.net',
    'Teste',
    999,
  );
  db.prepare('INSERT INTO group_activations(group_jid,policy,updated_by) VALUES (?,?,?)').run(
    A,
    JSON.stringify({ bot: true, sectors: { rp: 'adm' }, delegates: { rp: true } }),
    'old',
  );
  runMigrations(db);
  const store = createPolicyStore(db),
    manager = createManager(store);
  assert.ok(manager.isEnabled(A, 'antilink'));
  assert.ok(!manager.isEnabled(A, 'bemvindo'));
  assert.ok(manager.isEnabled(A, 'despedida'));
  assert.equal(store.get(A).sectors.rp, 'adm');
  assert.equal(store.get(A).delegates.rp, true);
  assert.equal(db.prepare('SELECT gold FROM users').get().gold, 999);
  assert.ok(createManager(createPolicyStore(db)).isEnabled(A, 'antilink'));
});
test('ativar tudo evita moderadores destrutivos; desativar tudo mantém controle de recuperação', async (t) => {
  const f = fixture(t);
  await f.manager.bulk(A, true, { actor: owner, botAdmin: false });
  assert.ok(!f.manager.isEnabled(A, 'antifake'));
  await f.manager.bulk(A, false, { actor: owner });
  assert.ok(!f.manager.isEnabled(A, 'bemvindo'));
  assert.equal(f.store.get(A).bot, true);
});
test('dependências impedem aviso de level sem XP e desligar XP também desliga o aviso', async (t) => {
  const f = fixture(t);
  await f.manager.disableFeature(A, 'xp', { actor: admin });
  assert.ok(!f.manager.isEnabled(A, 'level'));
  await assert.rejects(f.manager.enableFeature(A, 'level', { actor: admin }), /dependência/);
});
test('registry não tem handlers vazios e aliases são únicos', () => {
  const ids = new Set();
  for (const feature of registry.list()) {
    assert.equal(typeof feature.handler, 'function');
    assert.ok(feature.description);
    for (const name of [feature.id, ...feature.aliases]) {
      assert.ok(!ids.has(name));
      ids.add(name);
      assert.equal(registry.feature(name).id, feature.id);
    }
  }
  assert.equal(registry.feature('antidelete'), undefined);
});
test('filtros inspecionam mídia sem texto, contatos múltiplos e view-once aninhado', () => {
  const {
    inspect,
    matchingFeatures,
    createMessageTracker,
  } = require('../src/activations/message-rules');
  const data = inspect({
    ephemeralMessage: {
      message: { viewOnceMessageV2: { message: { imageMessage: { caption: 'oi' } } } },
    },
  });
  assert.ok(data.viewOnce);
  assert.deepEqual(
    matchingFeatures(data, data.body, () => true),
    ['antiviewonce', 'antiimagem'],
  );
  assert.ok(
    matchingFeatures(inspect({ contactsArrayMessage: { contacts: [] } }), '', () => true).includes(
      'anticontato',
    ),
  );
  let time = 1;
  const tracker = createMessageTracker({ now: () => time });
  for (let i = 0; i < 8; i++) tracker(A, 'user', 'hello');
  assert.ok(tracker(A, 'user', 'hello').flood);
  assert.ok(!tracker(B, 'user', 'hello').flood);
  time = 20000;
  assert.ok(!tracker(A, 'user', 'hello').flood);
});
test('painel é gerado do registry, mostra grupo e confirma idempotência', async (t) => {
  const f = fixture(t),
    sent = [];
  const { createActivationHandler } = require('../src/commands/activations');
  const sock = { sendMessage: async (j, c) => sent.push(c.text) };
  const access = async () => ({ ...admin, groupName: 'Alcateia Teste', botAdmin: true });
  const handler = createActivationHandler({ store: f.store, resolveActor: access });
  await handler(sock, { jid: A, args: ['status'] });
  assert.match(sent[0], /Alcateia Teste/);
  for (const entry of registry.list().filter(f => f.source !== 'sector')) assert.ok(sent[0].includes(entry.name));
  const enable = createActivationHandler({
    store: f.store,
    resolveActor: access,
    forcedAction: 'enable',
  });
  await enable(sock, { jid: A, args: ['antilink'] });
  assert.match(sent.at(-1), /Função ativada/);
  await enable(sock, { jid: A, args: ['antilink'] });
  assert.match(sent.at(-1), /já está ativado/);
});

test('consulta aquecida usa cache e não executa SQL a cada mensagem', (t) => {
  let queries = 0;
  const db = new Database(':memory:', { verbose: () => queries++ });
  t.after(() => db.close());
  runMigrations(db);
  const manager = createManager(createPolicyStore(db));
  manager.isEnabled(A, 'antilink');
  const before = queries;
  for (let i = 0; i < 100; i++) manager.isEnabled(A, 'bemvindo');
  assert.equal(queries, before);
});
test('ativação coletiva não amplia papéis e reativação restaura restrição anterior', async (t) => {
  const f = fixture(t);
  f.store.update(A, owner.phone, (p) => ({ ...p, sectors: { rp: 'adm' }, delegates: {} }));
  await f.manager.bulk(A, true, { actor: owner });
  assert.equal(f.store.get(A).sectors.rp, 'adm');
  await assert.rejects(f.manager.disableFeature(A, 'rp', { actor: owner }), /informativos/);
  await assert.rejects(f.manager.enableFeature(A, 'rp', { actor: owner }), /informativos/);
  assert.ok(f.manager.isEnabled(A, 'rp'));
  assert.equal(f.store.get(A).sectors.rp, 'adm');
});
test('configuração inválida é isolada e não sobrescrita', (t) => {
  const f = fixture(t);
  f.db
    .prepare('INSERT INTO group_activations(group_jid,policy,updated_by) VALUES (?,?,?)')
    .run(A, 'corrompido', 'old');
  f.store.preload();
  assert.throws(() => f.store.get(A), /inválida/);
  assert.ok(f.manager.isEnabled(B, 'bemvindo'));
  assert.throws(() => f.store.update(A, 'admin', (p) => p));
  assert.equal(
    f.db.prepare('SELECT policy FROM group_activations WHERE group_jid=?').get(A).policy,
    'corrompido',
  );
});
test('handler real aplica AntiSticker sem legenda e respeita desligamento', async (t) => {
  const f = fixture(t);
  await f.manager.enableFeature(A, 'antifigurinha', { actor: admin, botAdmin: true });
  const vm = require('node:vm'),
    fs = require('node:fs'),
    path = require('node:path'),
    { createRequire } = require('node:module');
  const file = path.join(__dirname, '../src/handlers/protection.js'),
    native = createRequire(file),
    loaded = { exports: {} },
    messages = [];
  const replacements = {
    '../utils/helpers': { logger: { warn: () => {} }, isBrazilianFake: () => false },
    '../activations/manager': { manager: f.manager },
    '../activations/access': {
      resolveActor: async () => ({ ...admin, admin: false, botAdmin: true }),
    },
    '../activations/store': { getStore: () => f.store },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: loaded,
    require: (id) => replacements[id] || native(id),
  });
  const msg = {
    key: { remoteJid: A, participant: admin.phone, id: 'sticker' },
    message: { stickerMessage: {} },
  };
  const sock = { sendMessage: async (j, c) => messages.push(c) };
  assert.equal(
    await loaded.exports.handleProtection(sock, msg, {
      jid: A,
      sender: admin.phone,
      body: '',
      isGroup: true,
    }),
    true,
  );
  assert.ok(messages.some((m) => m.delete));
  await f.manager.disableFeature(A, 'antisticker', { actor: admin });
  messages.length = 0;
  assert.equal(
    await loaded.exports.handleProtection(sock, msg, {
      jid: A,
      sender: admin.phone,
      body: '',
      isGroup: true,
    }),
    false,
  );
  assert.equal(messages.length, 0);
});

test('bem-vindo/despedida usam o mesmo estado central e aceitam participantes do Baileys como objetos', async (t) => {
  const f = fixture(t),
    vm = require('node:vm'),
    fs = require('node:fs'),
    path = require('node:path'),
    { createRequire } = require('node:module');
  const file = path.join(__dirname, '../src/handlers/groupEvents.js'),
    native = createRequire(file),
    loaded = { exports: {} },
    sent = [];
  let gold = 0;
  const replaces = {
    '../utils/database': { upsertUser: () => {}, addGold: () => gold++, getStrategy: () => ({}) },
    '../utils/helpers': {
      BOT_NAME: 'Lobo',
      cleanJid: (j) => j,
      getNumber: (j) => j.split('@')[0],
      logger: { error: () => {}, warn: () => {} },
    },
    '../activations/manager': { manager: f.manager },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: loaded,
    __dirname: path.dirname(file),
    process,
    require: (id) => replaces[id] || native(id),
  });
  const sock = { sendMessage: async (j, c) => sent.push(c) };
  await f.manager.disableFeature(A, 'welcome', { actor: admin });
  await loaded.exports.handleGroupParticipantsUpdate(sock, {
    id: A,
    action: 'add',
    participants: [{ id: admin.phone }],
  });
  assert.equal(gold, 0);
  assert.equal(sent.length, 0);
  await f.manager.enableFeature(A, 'bemvindo', { actor: admin });
  await loaded.exports.handleGroupParticipantsUpdate(sock, {
    id: A,
    action: 'add',
    participants: [{ id: admin.phone }],
  });
  assert.equal(gold, 1);
  assert.ok(sent[0].caption.includes('Seja bem-vindo(a)!'));
  assert.ok(sent[0].image);
  assert.ok(sent[0].mentions.includes(admin.phone));
  sent.length=0;
  await loaded.exports.handleGroupParticipantsUpdate(sock,{id:A,action:'remove',participants:[admin.phone]});
  assert.ok(sent[0].image);
  assert.ok(sent[0].caption.includes('MEU FILHO, ELE SÓ SAIU DO GRUPO.'));
  sent.length=0;
  const originalSend=sock.sendMessage;
  sock.sendMessage=async (jid,content)=>{if(content.image)throw Error('image unavailable');return originalSend(jid,content);};
  await loaded.exports.handleGroupParticipantsUpdate(sock,{id:A,action:'remove',participants:[admin.phone]});
  assert.ok(sent[0].text.includes('MEU FILHO, ELE SÓ SAIU DO GRUPO.'));
  sock.sendMessage=originalSend;
  await f.manager.disableFeature(A, 'bye', { actor: admin });
  sent.length = 0;
  await loaded.exports.handleGroupParticipantsUpdate(sock, {
    id: A,
    action: 'remove',
    participants: [admin.phone],
  });
  assert.equal(sent.length, 0);
});
test('on/off e 1/0 usam o mesmo controle e falhas de gravação são tratadas no chat', async (t) => {
  const f = fixture(t),
    sent = [],
    sock = { sendMessage: async (j, c) => sent.push(c.text) };
  const { createActivationHandler } = require('../src/commands/activations');
  const handler = createActivationHandler({
    store: f.store,
    resolveActor: async () => ({ ...admin, botAdmin: true }),
    featureId: 'bemvindo',
  });
  await handler(sock, { jid: A, args: ['0'] });
  assert.ok(!f.manager.isEnabled(A, 'bemvindo'));
  await handler(sock, { jid: A, args: ['on'] });
  assert.ok(f.manager.isEnabled(A, 'bemvindo'));
  f.db.exec('PRAGMA query_only=ON');
  await handler(sock, { jid: A, args: ['off'] });
  assert.ok(f.manager.isEnabled(A, 'bemvindo'));
  assert.match(sent.at(-1), /estado anterior foi preservado/);
  f.db.exec('PRAGMA query_only=OFF');
});

test('GroupService antigo escreve no mesmo registro, cache, espelho e auditoria',t=>{
 const f=fixture(t),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');const file=path.join(__dirname,'../src/services/index.js'),native=createRequire(file),loaded={exports:{}};
 const stubs={'../utils/database':{getGroup:jid=>f.db.prepare('SELECT * FROM groups WHERE jid=?').get(jid),updateGroup:()=>{throw Error('não deve atualizar flags fora do registry');}},'../activations/store':{getStore:()=>f.store},'../utils/cache':{},'../core/eventBus':{bus:{},EVENTS:{}},'../config/logger':{logError:()=>{}}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:loaded,require:id=>stubs[id]||native(id)});
 const service=loaded.exports.GroupService;assert.equal(service.toggle(A,'antilink'),true);assert.ok(f.manager.isEnabled(A,'antilink'));service.set(A,'welcome',0);assert.ok(!f.manager.isEnabled(A,'bemvindo'));service.set(A,'antilink_mode','warn');assert.equal(f.store.get(A).options.antilink_mode,'warn');assert.equal(f.db.prepare('SELECT antilink_mode FROM groups WHERE jid=?').get(A).antilink_mode,'warn');assert.ok(f.db.prepare('SELECT COUNT(*) n FROM activation_audit').get().n>=3);
});
