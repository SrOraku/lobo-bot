'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const CREATOR = require('../src/config/creator');

const OWNER = '5511999912345', EXTRA = '5511888812345';
const OWNER_PN = OWNER + '@s.whatsapp.net';
const CREATOR_PN = CREATOR.number + '@s.whatsapp.net';
const OUTSIDER = '5511777712345@s.whatsapp.net', BOT = '5511666612345@s.whatsapp.net';
const LID = '780001234567890@lid', OTHER_LID = '780009876543210@lid';
const GROUP = '120600000001@g.us', OTHER_GROUP = '120600000002@g.us';

// Carrega o código real com dependências de armazenamento e transporte isoladas.
// O import() do IdentityResolver continua real, sem sessão, banco ou rede.
function isolated(relative, mocks) {
  const filename = path.join(__dirname, '..', relative);
  const loaded = new Module(filename, module);
  const native = Module.createRequire(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : native(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

function fixture({ securityFailure = false, securityConflict = false, owner = OWNER } = {}) {
  const config = { get: key => ({ BOT_OWNER: owner, BOT_OWNERS: EXTRA, PREFIX: '!', BOT_NAME: 'Lobo' }[key] || '') };
  const security = { security: () => ({ permissions: { context: async () => {
    if (securityFailure) throw Error('contexto de segurança indisponível');
    return { actor: { level: 0, globalOwner: false, isAdmin: false, known: false, conflict: securityConflict }, bot: { isAdmin: false } };
  } } }) };
  const replies = [], executed = [], errors = [], savedOwners = [], ownerWrites = [];
  const sock = {
    user: { id: BOT, lid: '780001111111111@lid' },
    groupMetadata: async () => { throw Error('metadata indisponível'); },
    signalRepository: { lidMapping: { getPNForLID: async () => { throw Error('mapeamento indisponível'); } } },
    sendMessage: async (_, content) => { replies.push(content.text || ''); },
  };
  const permissions = isolated('src/middlewares/permissions.js', {
    '../utils/database': { isBotAdmin: () => false }, '../config': config,
    '../security/groups/service': security,
  });
  const access = isolated('src/activations/access.js', { '../config': config, '../security/groups/service': security });
  const owners = isolated('src/commands/owners.js', {
    '../activations/access': access, '../config': config,
    '../security/settings': {
      get: () => [...savedOwners],
      set: (key, values, actor, action) => {
        savedOwners.splice(0, savedOwners.length, ...values);
        ownerWrites.push({ key, values, actor, action });
      },
    },
    '../menus/render': { frameNotice: (title, lines) => [title, ...lines].join('\n') },
    '../ui/text': { command: text => text },
  });
  const registry = isolated('src/core/commandRegistry.js', {
    '../middlewares/permissions': permissions, '../config': config,
    '../middlewares/rateLimit': { checkRateLimit: () => ({ allowed: true }) },
    '../middlewares/command-limits': { createCommandLimiter: () => ({ check: () => ({ allowed: true }) }) },
    './eventBus': { bus: { emit() {} }, EVENTS: {} },
    '../config/logger': { logCommand() {}, logError: (...args) => errors.push(args) },
    './response': { noPermission: () => 'SEM PERMISSÃO', error: title => title, warn: title => title },
    '../ui/reactions': { reactions: { run: (_, __, ___, run) => run() } },
    './pluginLoader': { getPluginCommands: () => ({}) },
    '../commands/shortcuts': { resolveInput: (command, args) => ({ command, args }) },
    '../activations/gate': { checkActivation: async () => true },
  });
  registry.register({ name: 'exclusivodono', minLevel: permissions.LEVELS.OWNER, handler: async (_, ctx) => { executed.push(ctx.senderLevel); } });
  registry.register({ name: 'donos', minLevel: permissions.LEVELS.OWNER, handler: owners.owners });
  const context = (key, overrides = {}) => ({
    jid: key.remoteJid, sender: key.fromMe ? sock.user.id : key.remoteJid.endsWith('@g.us') ? key.participant : key.remoteJid,
    senderNumber: '0000000000000', isGroup: key.remoteJid.endsWith('@g.us'),
    args: [], msg: { key: { id: 'owner-identity-test', ...key } }, ...overrides,
  });
  return { config, sock, permissions, access, registry, replies, executed, errors, savedOwners, ownerWrites, context };
}

for (const [name, phone] of [['principal', OWNER_PN], ['adicional', EXTRA + '@s.whatsapp.net'], ['criador', CREATOR_PN]]) {
  for (const group of [true, false]) {
    test(`dono ${name} por LID e alternativa autenticada executa comando exclusivo no ${group ? 'grupo' : 'privado'}`, async () => {
      const f = fixture();
      const key = group ? { remoteJid: GROUP, participant: LID, participantAlt: phone } : { remoteJid: LID, remoteJidAlt: phone };
      const ctx = f.context(key);
      assert.equal(await f.permissions.resolveLevel(f.sock, ctx.sender, group ? GROUP : null, ctx.msg), f.permissions.LEVELS.OWNER);
      await f.registry.execute('exclusivodono', f.sock, ctx);
      assert.deepEqual(f.executed, [f.permissions.LEVELS.OWNER]);
      assert.deepEqual(f.replies, []);
      assert.deepEqual(f.errors, []);
    });
  }
}

test('requireOwner encaminha a chave autenticada ao resolver antes de executar', async () => {
  const f = fixture();
  const ctx = f.context({ remoteJid: GROUP, participant: LID, participantAlt: OWNER_PN });
  let calls = 0;
  await f.permissions.requireOwner(async () => { calls++; })(f.sock, ctx);
  assert.equal(calls, 1);
  assert.equal(ctx.senderLevel, f.permissions.LEVELS.OWNER);
  assert.deepEqual(f.replies, []);
});

test('!donos lista é executado pelo dono LID no pipeline central, além de mudar o rótulo', async () => {
  const f = fixture();
  await f.registry.execute('donos', f.sock, f.context({ remoteJid: GROUP, participant: LID, participantAlt: OWNER_PN }));
  assert.equal(f.replies.length, 1);
  assert.match(f.replies[0], /DONOS DO BOT/);
  assert.ok(f.replies[0].includes('Principal: +' + OWNER));
  assert.ok(f.replies[0].includes('Criador (dono absoluto): +' + CREATOR.number));
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.ownerWrites, []);
});

for (const [name, phone] of [['principal', OWNER_PN], ['criador', CREATOR_PN]]) {
  test(`!donos adicionar preserva telefone confirmado do ${name} quando segurança do grupo falha`, async () => {
    const f = fixture({ securityFailure: true });
    const target = '5511555512345';
    const ctx = f.context({ remoteJid: GROUP, participant: LID, participantAlt: phone }, { args: ['adicionar', target] });
    await f.registry.execute('donos', f.sock, ctx);
    assert.deepEqual(f.savedOwners, [target]);
    assert.deepEqual(f.ownerWrites, [{ key: 'owners', values: [target], actor: phone, action: 'owners.adicionar' }]);
    assert.ok(f.replies.at(-1).includes('cadastrado como dono'));
    assert.deepEqual(f.errors, []);
  });
}

test('!donos adicionar continua bloqueado para outra conta quando segurança do grupo falha', async () => {
  const f = fixture({ securityFailure: true });
  const ctx = f.context({ remoteJid: GROUP, participant: LID, participantAlt: OUTSIDER }, {
    args: ['adicionar', '5511555512345'], senderNumber: OWNER, owner: true, isOwner: true,
  });
  await f.registry.execute('donos', f.sock, ctx);
  assert.deepEqual(f.ownerWrites, []);
  assert.deepEqual(f.savedOwners, []);
  assert.deepEqual(f.replies, ['SEM PERMISSÃO']);
});

for (const source of ['metadados', 'mapeamento']) {
  for (const [knownPhone, alternative] of [[OUTSIDER, OWNER_PN], [OWNER_PN, OUTSIDER]]) {
    test(`conflito entre ${source} (${knownPhone}) e alternativa (${alternative}) não concede dono`, async () => {
      const f = fixture();
      if (source === 'metadados') f.sock.groupMetadata = async () => ({ id: GROUP, participants: [{ id: LID, phoneNumber: knownPhone }] });
      else f.sock.signalRepository.lidMapping.getPNForLID = async jid => jid === LID ? knownPhone : null;
      const ctx = f.context({ remoteJid: GROUP, participant: LID, participantAlt: alternative });
      assert.equal(await f.permissions.resolveLevel(f.sock, LID, GROUP, ctx.msg), f.permissions.LEVELS.USER);
      const actor = await f.access.resolveActor(f.sock, ctx);
      assert.equal(actor.owner, false);
      assert.equal(actor.phone, null);
      await f.registry.execute('exclusivodono', f.sock, ctx);
      assert.deepEqual(f.executed, []);
      assert.deepEqual(f.replies, ['SEM PERMISSÃO']);
    });
  }
}

test('conflito explícito da segurança invalida o telefone do dono confirmado somente pela alternativa', async () => {
  const f = fixture({ securityConflict: true });
  const ctx = f.context({ remoteJid: GROUP, participant: LID, participantAlt: OWNER_PN }, { args: ['adicionar', '5511555512345'] });
  const actor = await f.access.resolveActor(f.sock, ctx);
  assert.equal(actor.owner, false);
  assert.equal(actor.phone, null);
  assert.equal(await f.permissions.resolveLevel(f.sock, LID, GROUP, ctx.msg), f.permissions.LEVELS.USER);
  await f.registry.execute('donos', f.sock, ctx);
  assert.deepEqual(f.ownerWrites, []);
  assert.deepEqual(f.savedOwners, []);
  assert.deepEqual(f.replies, ['SEM PERMISSÃO']);
});

for (const sender of [OUTSIDER, OWNER + '@lid', CREATOR.number + '@lid']) {
  test(`identidade sem vínculo confiável ${sender} não recebe autoridade por campos do contexto`, async () => {
    const f = fixture();
    const ctx = f.context({ remoteJid: GROUP, participant: sender }, { senderNumber: OWNER, senderLevel: 3, isOwner: true, owner: true });
    assert.equal(await f.permissions.resolveLevel(f.sock, sender, GROUP, ctx.msg), f.permissions.LEVELS.USER);
    await f.registry.execute('exclusivodono', f.sock, ctx);
    assert.deepEqual(f.executed, []);
    assert.deepEqual(f.replies, ['SEM PERMISSÃO']);
  });
}

for (const [name, sender, room, key] of [
  ['telefone do contexto diferente do autor', OWNER_PN, GROUP, { remoteJid: GROUP, participant: OUTSIDER, participantAlt: OWNER_PN }],
  ['LID do contexto diferente do autor', LID, GROUP, { remoteJid: GROUP, participant: OTHER_LID, participantAlt: OWNER_PN }],
  ['grupo do contexto diferente da mensagem', LID, GROUP, { remoteJid: OTHER_GROUP, participant: LID, participantAlt: OWNER_PN }],
  ['chat privado diferente da mensagem', LID, null, { remoteJid: OTHER_LID, remoteJidAlt: OWNER_PN }],
]) {
  test(`chave autenticada incompatível é negada: ${name}`, async () => {
    const f = fixture();
    const ctx = f.context(key, { sender, jid: room || sender, isGroup: !!room });
    assert.equal(await f.permissions.resolveLevel(f.sock, sender, room, ctx.msg), f.permissions.LEVELS.USER);
    await f.registry.execute('exclusivodono', f.sock, ctx);
    assert.deepEqual(f.executed, []);
    assert.deepEqual(f.replies, ['SEM PERMISSÃO']);
  });
}

test('fromMe usa a conta conectada e não a alternativa do destinatário', async () => {
  const f = fixture();
  const key = { fromMe: true, remoteJid: LID, remoteJidAlt: OWNER_PN };
  const ctx = f.context(key, { senderNumber: OWNER, isOwner: true });
  assert.equal(await f.permissions.resolveLevel(f.sock, BOT, null, ctx.msg), f.permissions.LEVELS.USER);
  await f.registry.execute('exclusivodono', f.sock, ctx);
  assert.deepEqual(f.executed, []);
  assert.deepEqual(f.replies, ['SEM PERMISSÃO']);
  // Nem um sender falso igual ao dono transforma o destinatário em autor.
  assert.equal(await f.permissions.resolveLevel(f.sock, OWNER_PN, null, ctx.msg), f.permissions.LEVELS.USER);
});

test('fromMe do dono preserva autoridade ao escrever para outro destinatário', async () => {
  const f = fixture();
  f.sock.user = { id: OWNER_PN, lid: LID };
  const ctx = f.context({ fromMe: true, remoteJid: OTHER_LID, remoteJidAlt: OUTSIDER });
  await f.registry.execute('exclusivodono', f.sock, ctx);
  assert.deepEqual(f.executed, [f.permissions.LEVELS.OWNER]);
  assert.deepEqual(f.replies, []);
});

test('chamada sem mensagem mantém resolução por metadados e mapeamento confiável', async () => {
  const metadata = fixture();
  metadata.sock.groupMetadata = async () => ({ id: GROUP, participants: [{ id: LID, phoneNumber: OWNER_PN }] });
  assert.equal(await metadata.permissions.resolveLevel(metadata.sock, LID, GROUP), metadata.permissions.LEVELS.OWNER);
  const mapping = fixture();
  mapping.sock.signalRepository.lidMapping.getPNForLID = async jid => jid === LID ? OWNER_PN : null;
  assert.equal(await mapping.permissions.resolveLevel(mapping.sock, LID, null), mapping.permissions.LEVELS.OWNER);
});

test('comprador cadastra o próprio dono, herda acesso pelo supervisor e gerencia donos junto com o criador', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-buyer-owner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const buyer = '5511444412345', buyerPN = buyer + '@s.whatsapp.net';
  const env = { BOT_OWNER: '' }, log = { log() {} };
  let prompts = 0;
  const { ensureOwner } = require('../src/config/owner-setup');
  assert.equal(await ensureOwner({ root, env, log, ask: async () => { prompts++; return buyer; } }), buyer);
  const ownerFile = path.join(root, 'data/bot-owner.json');
  const saved = fs.readFileSync(ownerFile, 'utf8'), before = fs.statSync(ownerFile);
  assert.equal(env.BOT_OWNER, buyer);

  // Executa o supervisor real com um processo/filho isolados: verifica o env
  // entregue ao runtime, sem iniciar WhatsApp, acessar rede ou usar a sessão.
  const filename = path.join(__dirname, '../src/updater/supervisor.js');
  const native = Module.createRequire(filename), loaded = { exports: {} };
  const processStub = new EventEmitter(); processStub.env = { ...env };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: loaded, process: processStub, setTimeout, clearTimeout,
    require: name => name === './recovery' ? { recover() {} } : native(name),
  }, { filename });
  let inherited;
  const child = new EventEmitter(); child.kill = () => true;
  const supervisor = loaded.exports.start({ root, health: {}, exit() {}, spawn: (_, __, options) => { inherited = options.env; return child; } });
  supervisor.stop(); child.emit('exit', 0);
  assert.equal(inherited.BOT_OWNER, buyer);
  assert.equal(inherited.LOBO_SUPERVISED, '1');

  const f = fixture({ owner: inherited.BOT_OWNER });
  const target = '5511333312345';
  for (const phone of [buyerPN, CREATOR_PN]) {
    const ctx = f.context({ remoteJid: GROUP, participant: LID, participantAlt: phone });
    await f.registry.execute('exclusivodono', f.sock, ctx);
    await f.registry.execute('donos', f.sock, { ...ctx, args: ['adicionar', target] });
    assert.deepEqual(f.savedOwners, [target]);
    assert.equal(f.ownerWrites.at(-1).actor, phone);
    await f.registry.execute('donos', f.sock, { ...ctx, args: ['remover', target] });
    assert.deepEqual(f.savedOwners, []);
    assert.equal(f.ownerWrites.at(-1).actor, phone);
  }
  assert.deepEqual(f.executed, [f.permissions.LEVELS.OWNER, f.permissions.LEVELS.OWNER]);
  assert.equal(f.ownerWrites.length, 4);
  assert.deepEqual(f.errors, []);
  assert.equal(require('../src/utils/owners').primaryOwner(f.config), buyer);

  const restartedEnv = { BOT_OWNER: '' };
  assert.equal(await ensureOwner({ root, env: restartedEnv, log, ask: async () => assert.fail('dono salvo não pede novo cadastro') }), buyer);
  assert.equal(restartedEnv.BOT_OWNER, buyer);
  assert.equal(prompts, 1);
  assert.equal(fs.readFileSync(ownerFile, 'utf8'), saved);
  assert.equal(fs.statSync(ownerFile).mtimeMs, before.mtimeMs);
});
