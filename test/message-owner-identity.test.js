'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const CREATOR = require('../src/config/creator');

const BUYER = '5511999912345', OUTSIDER = '5511777712345@s.whatsapp.net';
const LID = '780001234567890@lid', GROUP = '120600000006@g.us';

function fixture(user, mapping = null) {
  const filename = path.join(__dirname, '../src/handlers/message.js');
  const loaded = new Module(filename, module), native = Module.createRequire(filename);
  const executed = [], errors = [], interactions = [];
  const mocks = {
    dotenv: { config() {} },
    '../utils/owners': { ownerNumbers: () => [BUYER, CREATOR.number] },
    '../utils/helpers': {
      PREFIX: '!', BOT_NAME: 'Lobo', logger: { error: (...args) => errors.push(args) },
      cleanJid: jid => jid.replace(/:\d+(?=@)/, ''), getNumber: jid => jid.split('@')[0],
    },
    '../utils/database': { upsertUser() {}, getUser: () => ({}), upsertActivity() {}, upsertGroup() {}, getGroup: () => ({}) },
    '../core/eventBus': { bus: { emit() {} }, EVENTS: {} },
    '../core/commandRegistry': { execute: async (command, _, ctx) => executed.push({ command, ctx }) },
    './protection': { handleProtection: async () => false },
    './autoReply': { handleAutoReply() {} }, './xp': { handleXP() {} },
    '../isolation/context': { run: (_, work) => work() },
    '../automation/anti-pv': { createAntiPV: () => ({ handle: async () => false }) },
    '../services/universal-currency': { linkMessageWallet() {} },
    '../progression/service': { progression: () => ({ touch() {}, refresh: () => [] }) },
    '../activations/interaction': { interaction: () => ({ handle: async (_, __, text) => { interactions.push(text); return true; } }) },
  };
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : native(name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  const sock = { user, signalRepository: { lidMapping: { getPNForLID: async () => mapping } },
    sendMessage: async () => assert.fail('nenhuma mensagem real deve ser enviada') };
  const message = (key = {}, text = '!ping') => ({ key: { id: 'message-owner-test', remoteJid: GROUP, fromMe: true, ...key }, message: { conversation: text } });
  return { ...loaded.exports, sock, message, executed, errors, interactions };
}

for (const [role, number] of [['comprador', BUYER], ['criador', CREATOR.number]]) {
  for (const source of ['telefone', 'mapeamento', 'telefone da sessão']) {
    test(`fromMe do ${role} chega ao comando com identidade por ${source}`, async () => {
      const phone = number + '@s.whatsapp.net';
      const user = source === 'telefone' ? { id: number + ':7@s.whatsapp.net', lid: LID }
        : { id: LID, lid: LID, ...(source === 'telefone da sessão' ? { phoneNumber: phone } : {}) };
      const f = fixture(user, source === 'mapeamento' ? phone : null);
      const msg = f.message({ participant: OUTSIDER, participantAlt: OUTSIDER });
      await f.handleMessage(f.sock, msg);
      assert.equal(f.executed.length, 1);
      assert.equal(f.executed[0].command, 'ping');
      assert.equal(f.executed[0].ctx.sender, source === 'telefone' ? phone : LID);
      assert.equal(f.executed[0].ctx.msg, msg);
      assert.deepEqual(f.errors, []);
    });
  }
}

for (const id of [OUTSIDER, BUYER + '@lid', CREATOR.number + '@lid']) {
  test(`fromMe de ${id} não recebe autoridade pelos dígitos ou pelo destinatário`, async () => {
    const f = fixture({ id });
    await f.handleMessage(f.sock, f.message({ remoteJid: LID, remoteJidAlt: BUYER + '@s.whatsapp.net', participantAlt: CREATOR.number + '@s.whatsapp.net' }));
    assert.deepEqual(f.executed, []);
    assert.deepEqual(f.errors, []);
  });
}

test('falha de mapeamento não autoriza LID coincidente com o número do criador', async () => {
  const f = fixture({ id: CREATOR.number + '@lid' });
  f.sock.signalRepository.lidMapping.getPNForLID = async () => { throw Error('indisponível'); };
  await f.handleMessage(f.sock, f.message());
  assert.deepEqual(f.executed, []);
  assert.deepEqual(f.errors, []);
});

test('fromMe preserva filtro de texto e respostas numéricas do painel', async () => {
  const f = fixture({ id: BUYER + '@s.whatsapp.net', lid: LID });
  await f.handleMessage(f.sock, f.message({}, 'mensagem normal'));
  assert.deepEqual(f.executed, []);
  await f.handleMessage(f.sock, f.message({}, '1'));
  assert.deepEqual(f.interactions, ['1']);
  assert.deepEqual(f.executed, []);
  assert.deepEqual(f.errors, []);
});

test('mensagens recebidas de membros continuam no pipeline normal sem serem donos', async () => {
  const f = fixture({ id: OUTSIDER });
  await f.handleMessage(f.sock, f.message({ fromMe: false, participant: OUTSIDER }));
  assert.equal(f.executed.length, 1);
  assert.equal(f.executed[0].ctx.sender, OUTSIDER);
  assert.deepEqual(f.errors, []);
});

test('mensagem sem chave de origem é ignorada', async () => {
  const f = fixture({ id: BUYER + '@s.whatsapp.net' });
  await f.handleMessage(f.sock, { message: { conversation: '!ping' } });
  assert.deepEqual(f.executed, []);
  assert.deepEqual(f.errors, []);
});
