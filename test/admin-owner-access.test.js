'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const CREATOR = require('../src/config/creator');

const BUYER = '5511999912345', OUTSIDER = '5511777712345@s.whatsapp.net';
const LID = '780001234567890@lid', TARGET = '5511555512345@s.whatsapp.net';
const GROUP = '120600000005@g.us';

function isolated(relative, mocks) {
  const filename = path.join(__dirname, '..', relative);
  const loaded = new Module(filename, module), native = Module.createRequire(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : native(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

function fixture({ sender = LID, alternative, mapping = null, registered = [], conflict = false } = {}) {
  const config = { get: key => key === 'BOT_OWNER' ? BUYER : '' };
  const replies = [], effects = [], checkedAdmins = [];
  const sock = {
    user: { id: '5511666612345@s.whatsapp.net' },
    groupMetadata: async () => { throw Error('metadata indisponível'); },
    signalRepository: { lidMapping: { getPNForLID: async () => mapping } },
    sendMessage: async (_, payload) => replies.push(payload.text),
  };
  const access = isolated('src/activations/access.js', {
    '../config': config,
    '../security/groups/service': { security: () => ({ permissions: { context: async () => ({ actor: { known: false, level: 0, conflict } }) } }) },
  });
  const admin = isolated('src/commands/admin.js', {
    '../activations/access': access,
    '../utils/owners': { ownerNumbers: () => require('../src/utils/owners').ownerNumbers(config) },
    '../utils/database': {
      isBotAdmin(jid) { checkedAdmins.push(jid); return registered.includes(jid); },
      addBotAdmin: jid => effects.push(['add', jid]),
      removeBotAdmin: jid => effects.push(['remove', jid]),
      db: { prepare(sql) { return {
        all() { assert.match(sql, /SELECT jid FROM groups/); effects.push(['broadcast']); return []; },
        run(...args) { assert.match(sql, /INSERT INTO scheduled_messages/); effects.push(['schedule', ...args]); },
      }; } },
    },
    '../utils/helpers': {
      cleanJid: jid => jid.replace(/:\d+(?=@)/, ''), getNumber: jid => jid.split('@')[0],
      sleep: async () => assert.fail('nenhum grupo real deve receber broadcast'),
    },
    '../ui/text': { card: (title, lines) => [title, ...lines].join('\n'), mono: String, command: String },
    cron: { CronJob: class { constructor(expression) { effects.push(['cron', expression]); } } },
    './ping': { ping() {} },
  });
  const context = args => ({
    jid: GROUP, sender, senderNumber: sender.split('@')[0], isGroup: true, args,
    msg: { key: { id: 'admin-owner-test', remoteJid: GROUP, participant: sender, participantAlt: alternative },
      message: { extendedTextMessage: { contextInfo: { mentionedJid: [TARGET] } } } },
  });
  return { sock, admin, context, replies, effects, checkedAdmins };
}

for (const [role, number] of [['comprador', BUYER], ['criador', CREATOR.number]]) {
  for (const source of ['telefone', 'alternativa', 'mapeamento']) {
    test(`${role} executa todos os comandos administrativos com identidade por ${source}`, async () => {
      const phone = number + '@s.whatsapp.net';
      const f = fixture({ sender: source === 'telefone' ? phone : LID,
        alternative: source === 'alternativa' ? phone : undefined, mapping: source === 'mapeamento' ? phone : null });
      await f.admin.addAdmin(f.sock, f.context([]));
      await f.admin.removeAdmin(f.sock, f.context([]));
      await f.admin.broadcast(f.sock, f.context(['Aviso de teste']));
      await f.admin.agendarMensagem(f.sock, f.context(['0 8 * * *', 'Bom dia']));
      assert.deepEqual(f.effects, [['add', TARGET], ['remove', TARGET], ['broadcast'],
        ['cron', '0 8 * * *'], ['schedule', GROUP, 'Bom dia', '0 8 * * *']]);
      assert.ok(f.replies.every(text => !text.includes('Apenas o dono')));
    });
  }
}

for (const registration of ['telefone', 'jid']) {
  test(`admin do bot explicitamente cadastrado por ${registration} mantém acesso ao handler`, async () => {
    const f = fixture({ mapping: OUTSIDER, registered: [registration === 'telefone' ? OUTSIDER : LID] });
    await f.admin.addAdmin(f.sock, f.context([]));
    assert.deepEqual(f.effects, [['add', TARGET]]);
  });
}

test('campos de dono e senderNumber falsificados não autorizam o handler', async () => {
  const f = fixture({ sender: OUTSIDER });
  const ctx = { ...f.context([]), senderNumber: BUYER, senderLevel: 3, owner: true, isOwner: true };
  await f.admin.addAdmin(f.sock, ctx);
  assert.deepEqual(f.effects, []);
  assert.match(f.replies.at(-1), /Apenas o dono/);
  assert.ok(!f.checkedAdmins.includes(BUYER));
});

test('conflito de identidade bloqueia até um LID cadastrado como admin do bot', async () => {
  const f = fixture({ alternative: BUYER + '@s.whatsapp.net', mapping: OUTSIDER, registered: [LID], conflict: true });
  await f.admin.addAdmin(f.sock, f.context([]));
  assert.deepEqual(f.effects, []);
  assert.match(f.replies.at(-1), /Apenas o dono/);
});

test('sem chave autenticada não há permissão por campos do contexto', async () => {
  const f = fixture();
  await f.admin.addAdmin(f.sock, { ...f.context([]), senderNumber: BUYER, msg: {} });
  assert.deepEqual(f.effects, []);
  assert.match(f.replies.at(-1), /Apenas o dono/);
});
