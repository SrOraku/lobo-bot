'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// O banco do projeto é persistente entre execuções; cada teste usa grupos novos.
const freshGroup = () => `120363${Date.now()}${Math.floor(Math.random() * 1e6)}@g.us`;

test('bônus de entrada: uma vez por pessoa em cada grupo, mesmo saindo e voltando', () => {
  const db = require('../src/utils/database');
  const context = require('../src/isolation/context');
  const group = freshGroup(), other = freshGroup();
  const phone = '5511987650001@s.whatsapp.net', lid = `${Date.now()}@lid`;
  const bonus = jid => db.db.prepare('SELECT COUNT(*) n FROM gold_transactions WHERE to_jid=? AND reason=?').get(jid, 'Bônus de entrada no grupo').n;

  context.run(group, () => {
    db.upsertUser(phone, 'Luna');
    const before = db.getUser(phone).gold;
    assert.equal(db.grantEntryBonus(group, [phone, lid, null], phone, 500), true);
    assert.equal(db.getUser(phone).gold, before + 500);
    assert.equal(bonus(phone), 1, 'o crédito entra no histórico de transações');
    // Saiu e voltou pelo link: nada de novo, nem pelo telefone nem pelo LID.
    assert.equal(db.grantEntryBonus(group, [phone], phone, 500), false);
    assert.equal(db.grantEntryBonus(group, [lid], lid, 500), false);
    assert.equal(db.getUser(phone).gold, before + 500);
    assert.equal(bonus(phone), 1);
  });
  // Em outro grupo a pessoa recebe normalmente: cada grupo tem a própria carteira.
  context.run(other, () => {
    db.upsertUser(phone, 'Luna');
    const before = db.getUser(phone).gold;
    assert.equal(db.grantEntryBonus(other, [phone], phone, 500), true);
    assert.equal(db.getUser(phone).gold, before + 500);
  });
  // Entradas inválidas não creditam nem marcam nada.
  context.run(group, () => {
    const someone = '5511987650002@s.whatsapp.net';
    for (const [ids, to, amount] of [[[], someone, 500], [[null, ''], someone, 500], [[someone], '', 500], [[someone], someone, 0], [[someone], someone, -5], [[someone], someone, 1.5]])
      assert.equal(db.grantEntryBonus(group, ids, to, amount), false);
    assert.equal(db.db.prepare('SELECT COUNT(*) n FROM entry_bonus WHERE chat_jid=? AND user_jid=?').get(group, someone).n, 0);
  });
});

test('a entrada no grupo passa telefone e LID da pessoa para o bônus', async () => {
  const file = path.join(__dirname, '../src/handlers/groupEvents.js');
  const native = require('node:module').createRequire(file), loaded = { exports: {} }, grants = [], sent = [];
  const replaces = {
    '../utils/database': { upsertUser() {}, grantEntryBonus: (...args) => { grants.push(args); return grants.length === 1; }, getStrategy: () => ({}), getGroup: () => ({ name: 'Matilha' }) },
    '../utils/helpers': { cleanJid: j => String(j).replace(/:\d+@/, '@'), getNumber: j => j.split('@')[0], logger: { error() {}, warn() {} } },
    '../activations/manager': { manager: { isEnabled: (_, feature) => feature === 'bemvindo' } },
    '../security/groups/service': { security: () => ({ engine: { participants: async () => {} } }) },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module: loaded, __dirname: path.dirname(file), process, require: id => replaces[id] || native(id) });
  const sock = { sendMessage: async (_, content) => sent.push(content) };
  const group = freshGroup();
  const previous = process.env.GOLD_START; process.env.GOLD_START = '250';
  try {
    const participant = { id: '777777@lid', phoneNumber: '5511987650003:4@s.whatsapp.net', lid: '777777@lid' };
    await loaded.exports.handleGroupParticipantsUpdate(sock, { id: group, action: 'add', participants: [participant] });
    await loaded.exports.handleGroupParticipantsUpdate(sock, { id: group, action: 'add', participants: [participant] });
  } finally { if (previous === undefined) delete process.env.GOLD_START; else process.env.GOLD_START = previous; }
  // Os valores nascem dentro do vm (outro realm); compara pelo conteúdo.
  assert.equal(JSON.stringify(grants[0]), JSON.stringify([group, ['777777@lid', '5511987650003@s.whatsapp.net', '777777@lid'], '777777@lid', 250]));
  assert.equal(grants.length, 2);
  assert.equal(sent.length, 2, 'as boas-vindas continuam saindo nas duas entradas; só o WoK não se repete');
});
