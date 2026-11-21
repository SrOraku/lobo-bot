'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

test('boton e botoff pelo fluxo de mensagens com dois grupos e um privado', async t => {
  // A aplicação abre data/lobo.db em relação ao código. Esta instalação usa somente dados temporários.
  const project = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-switch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(project, 'src'), path.join(root, 'src'), {
    recursive: true, filter: name => path.basename(name) !== 'assets',
  });
  for (const name of ['addons', 'node_modules', 'package.json'])
    fs.symlinkSync(path.join(project, name), path.join(root, name));
  const load = createRequire(path.join(root, 'package.json'));
  const a = '12010001@g.us', b = '12010002@g.us';
  const ownerNumber = '5511990000001', owner = ownerNumber + '@s.whatsapp.net';
  const member = '5511990000002@s.whatsapp.net', admin = '5511990000003@s.whatsapp.net';
  const bot = '5511990000004@s.whatsapp.net';
  for (const [key, value] of Object.entries({ BOT_OWNER: ownerNumber, PREFIX: '#', CMD_COOLDOWN_MS: '1' })) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
  }
  const sent = [];
  const sock = {
    user: { id: bot },
    groupMetadata: async id => ({ id, subject: 'Grupo', participants: [
      { id: owner }, { id: member }, { id: admin, admin: 'admin' }, { id: bot },
    ] }),
    sendMessage: async (jid, content) => { sent.push({ jid, ...content }); },
  };
  load('./src/handlers/commands').loadAllCommands();
  const { handleMessage } = load('./src/handlers/message');
  const { getStore, createPolicyStore } = load('./src/activations/store');
  const store = getStore();
  const api = load('./src/utils/database');
  t.after(() => api.db.close());
  let id = 0;
  const send = async (chat, participant, body) => {
    // O relógio avança além do cooldown configurado também em máquinas rápidas.
    await new Promise(resolve => setTimeout(resolve, 2));
    const start = sent.length;
    await handleMessage(sock, { key: { id: 'message-' + ++id, remoteJid: chat, participant },
      message: { conversation: body }, pushName: 'Jogador' });
    await load('./src/ui/reactions').reactions.drain();
    return sent.slice(start);
  };
  const activity = () => api.db.prepare('SELECT sum(message_count) AS count FROM activity_log WHERE group_id=?').get(a).count;
  const reply = (messages, regex) => assert.ok(messages.some(m => regex.test(m.text || '')), regex.toString());

  reply(await send(a, member, '#botoff'), /acesso restrito/i);
  reply(await send(a, admin, '#botoff'), /acesso restrito/i);
  reply(await send(a, ownerNumber + '@lid', '#botoff'), /acesso restrito/i);
  assert.equal(store.isBotEnabled(a), true);
  reply(await send(a, owner, '#botoff extra'), /Use somente/);
  assert.equal(store.isBotEnabled(a), true);
  const features = store.get(a).features;
  reply(await send(a, owner, '#BotOff'), /pausado.*#boton/i);
  const count = activity();
  assert.equal(createPolicyStore(api.db).isBotEnabled(a), false);
  const manager = load('./src/activations/manager').manager;
  assert.equal(manager.isEnabled(a, 'bemvindo'), false);
  const { handleGroupParticipantsUpdate } = load('./src/handlers/groupEvents');
  const beforeJoin = sent.length;
  await handleGroupParticipantsUpdate(sock, { id: a, action: 'add', participants: [member] });
  assert.equal(sent.length, beforeJoin);
  for (const text of ['olá', '#menu', '#daily', '#comando-inexistente', '2', '#botonx', '!boton'])
    assert.deepEqual(await send(a, owner, text), [], text);
  assert.equal(activity(), count);
  reply(await send(a, member, '#boton'), /acesso restrito/i);
  assert.equal(store.isBotEnabled(a), false);
  reply(await send(a, owner, '#botoff'), /pausado/i);
  assert.equal(store.history(a).filter(row => row.feature === 'bot').length, 1);
  assert.equal(store.isBotEnabled(b), true);
  assert.ok((await send(b, member, '#uptime')).some(m => m.text));
  const broadcast = await send(b, owner, '#broadcast Boa tarde');
  assert.ok(broadcast.some(m => m.jid === b && /Boa tarde/.test(m.text)));
  assert.ok(broadcast.every(m => m.jid !== a));
  reply(await send(owner, owner, '#botoff'), /apenas em grupos/i);
  assert.equal(store.isBotEnabled(a), false);
  reply(await send(a, owner, '#boton'), /ligado neste grupo/i);
  assert.deepEqual(store.get(a).features, features);
  assert.equal(manager.isEnabled(a, 'bemvindo'), true);
  assert.ok((await send(a, member, '#uptime')).some(m => m.text));
  await send(a, owner, '#ativacoes bot off');
  assert.equal(store.isBotEnabled(a), false);
  await send(a, owner, '#ati bot on');
  assert.equal(store.isBotEnabled(a), true);
  const menu = await send(a, owner, '#menu dono');
  for (const name of ['#boton', '#botoff']) assert.ok(menu.some(m => (m.text || m.caption || '').includes(name)));
});
