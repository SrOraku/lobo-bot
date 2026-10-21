'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CacheMessageStore } = require('../src/utils/message-store');

const CHAT = '120363000000000000@g.us';
const OTHER_CHAT = '5511999999999@s.whatsapp.net';
const EVENTS = ['messages.upsert', 'messages.update', 'messages.delete'];

function message(id, jid = CHAT, extra = {}) {
  return { key: { remoteJid: jid, id, fromMe: false }, message: { conversation: `Mensagem ${id}` }, ...extra };
}

function fixture(options) {
  const emitter = new EventEmitter();
  const store = new CacheMessageStore(options);
  store.bind(emitter);
  return { emitter, store, upsert: (...messages) => emitter.emit('messages.upsert', { messages }) };
}

test('upsert preserva o WAMessage inteiro e loadMessage sempre retorna uma Promise', async () => {
  const f = fixture();
  const original = message('one', CHAT, { pushName: 'Lobo', messageTimestamp: 12345, participant: 'member@s.whatsapp.net' });
  f.upsert(original);

  const result = f.store.loadMessage(CHAT, 'one');
  assert.equal(result instanceof Promise, true);
  assert.deepEqual(await result, original);
  assert.equal(await f.store.loadMessage(CHAT, 'missing'), undefined);
});

test('mensagens com o mesmo ID permanecem separadas por chat', async () => {
  const f = fixture();
  const first = message('same', CHAT);
  const second = message('same', OTHER_CHAT, { pushName: 'Outro chat' });
  f.upsert(first, second);

  assert.deepEqual(await f.store.loadMessage(CHAT, 'same'), first);
  assert.deepEqual(await f.store.loadMessage(OTHER_CHAT, 'same'), second);
});

test('update faz merge simples, preserva a chave e ignora mensagens inexistentes', async () => {
  const f = fixture();
  const original = message('one', CHAT, { pushName: 'Lobo', status: 1 });
  f.upsert(original, message('one', OTHER_CHAT));
  const update = { status: 3, message: { conversation: 'Editada' }, key: { remoteJid: OTHER_CHAT, id: 'forged' } };
  f.emitter.emit('messages.update', [
    { key: original.key, update },
    { key: { remoteJid: CHAT, id: 'missing' }, update: { status: 4 } },
  ]);

  assert.deepEqual(await f.store.loadMessage(CHAT, 'one'), {
    ...original, status: 3, message: { conversation: 'Editada' },
  });
  assert.equal((await f.store.loadMessage(OTHER_CHAT, 'one')).status, undefined);
  assert.equal(await f.store.loadMessage(CHAT, 'missing'), undefined);
  assert.equal(await f.store.loadMessage(OTHER_CHAT, 'forged'), undefined);
});

test('delete por keys remove somente o par de chat e ID informado', async () => {
  const f = fixture();
  f.upsert(message('same', CHAT), message('same', OTHER_CHAT), message('keep', CHAT));
  f.emitter.emit('messages.delete', { keys: [{ remoteJid: CHAT, id: 'same' }] });

  assert.equal(await f.store.loadMessage(CHAT, 'same'), undefined);
  assert.ok(await f.store.loadMessage(OTHER_CHAT, 'same'));
  assert.ok(await f.store.loadMessage(CHAT, 'keep'));
});

test('delete com all remove somente o chat indicado e rejeita jid inválido', async () => {
  const f = fixture();
  f.upsert(message('one'), message('two'), message('one', OTHER_CHAT));
  f.emitter.emit('messages.delete', { all: true });
  assert.ok(await f.store.loadMessage(CHAT, 'one'));

  f.emitter.emit('messages.delete', { jid: CHAT, all: true });
  assert.equal(await f.store.loadMessage(CHAT, 'one'), undefined);
  assert.equal(await f.store.loadMessage(CHAT, 'two'), undefined);
  assert.ok(await f.store.loadMessage(OTHER_CHAT, 'one'));
});

test('TTL expira no limite e updates não ressuscitam mensagens expiradas', async () => {
  let now = 1000;
  const f = fixture({ ttlMs: 100, now: () => now });
  f.upsert(message('one'));
  now = 1099;
  assert.ok(await f.store.loadMessage(CHAT, 'one'));
  now = 1100;
  f.emitter.emit('messages.update', [{ key: { remoteJid: CHAT, id: 'one' }, update: { status: 3 } }]);
  assert.equal(await f.store.loadMessage(CHAT, 'one'), undefined);
});

test('TTL de dez minutos é padrão e uma atualização renova o prazo', async () => {
  let now = 0;
  const f = fixture({ now: () => now });
  f.upsert(message('one'));
  now = 599_999;
  assert.ok(await f.store.loadMessage(CHAT, 'one'));
  f.emitter.emit('messages.update', [{ key: { remoteJid: CHAT, id: 'one' }, update: { status: 3 } }]);
  now = 600_000;
  assert.ok(await f.store.loadMessage(CHAT, 'one'));
  now = 1_199_999;
  assert.equal(await f.store.loadMessage(CHAT, 'one'), undefined);
});

test('limite global remove a entrada mais antiga e preserva chats com IDs iguais', async () => {
  const f = fixture({ maxMessages: 2 });
  f.upsert(message('same', CHAT), message('same', OTHER_CHAT), message('new', CHAT));

  assert.equal(await f.store.loadMessage(CHAT, 'same'), undefined);
  assert.ok(await f.store.loadMessage(OTHER_CHAT, 'same'));
  assert.ok(await f.store.loadMessage(CHAT, 'new'));
});

test('limite padrão guarda no máximo mil mensagens', async () => {
  const f = fixture();
  f.upsert(...Array.from({ length: 1001 }, (_, index) => message(String(index))));

  assert.equal(await f.store.loadMessage(CHAT, '0'), undefined);
  assert.ok(await f.store.loadMessage(CHAT, '1'));
  assert.ok(await f.store.loadMessage(CHAT, '1000'));
});

test('prune remove entradas expiradas antes de aplicar o limite', async () => {
  let now = 0;
  const f = fixture({ maxMessages: 2, ttlMs: 100, now: () => now });
  f.upsert(message('old', CHAT));
  now = 50;
  f.upsert(message('same', OTHER_CHAT));
  now = 100;
  f.upsert(message('same', CHAT));

  assert.equal(await f.store.loadMessage(CHAT, 'old'), undefined);
  assert.ok(await f.store.loadMessage(OTHER_CHAT, 'same'));
  assert.ok(await f.store.loadMessage(CHAT, 'same'));
});

test('novo bind desregistra os listeners anteriores e rebind não duplica listeners', async () => {
  const f = fixture();
  f.store.bind(f.emitter);
  for (const event of EVENTS) assert.equal(f.emitter.listenerCount(event), 1);

  const next = new EventEmitter();
  f.store.bind(next);
  for (const event of EVENTS) {
    assert.equal(f.emitter.listenerCount(event), 0);
    assert.equal(next.listenerCount(event), 1);
  }
  f.upsert(message('old-emitter'));
  next.emit('messages.upsert', { messages: [message('new-emitter')] });
  assert.equal(await f.store.loadMessage(CHAT, 'old-emitter'), undefined);
  assert.ok(await f.store.loadMessage(CHAT, 'new-emitter'));
});

test('unbind também aceita emitter com removeListener e destroy limpa cache e listeners', async () => {
  const emitter = new EventEmitter();
  emitter.off = undefined;
  const store = new CacheMessageStore();
  store.bind(emitter);
  emitter.emit('messages.upsert', { messages: [message('one')] });
  store.destroy();

  for (const event of EVENTS) assert.equal(emitter.listenerCount(event), 0);
  assert.equal(await store.loadMessage(CHAT, 'one'), undefined);
  store.destroy();
});

test('eventos e chaves inválidos são ignorados sem impedir entradas válidas', async () => {
  const f = fixture();
  for (const payload of [undefined, null, {}, { messages: 'invalid' }]) f.emitter.emit('messages.upsert', payload);
  f.upsert(null, {}, { key: { id: 'one' } }, { key: { remoteJid: CHAT, id: 1 } },
    { key: { remoteJid: ' ', id: 'one' } }, message('one'));
  f.emitter.emit('messages.update', [null, {}, { key: { id: 'one' }, update: { status: 5 } },
    { key: { remoteJid: CHAT, id: 'one' }, update: null }]);
  f.emitter.emit('messages.delete', { keys: [null, {}, { id: 'one' }, { remoteJid: CHAT, id: 1 }] });

  assert.ok(await f.store.loadMessage(CHAT, 'one'));
  assert.equal(await f.store.loadMessage(undefined, 'one'), undefined);
  assert.equal(await f.store.loadMessage(CHAT, ' '), undefined);
});

test('clear remove mensagens sem desconectar os listeners', async () => {
  const f = fixture();
  f.upsert(message('one'));
  f.store.clear();
  assert.equal(await f.store.loadMessage(CHAT, 'one'), undefined);
  f.upsert(message('two'));
  assert.ok(await f.store.loadMessage(CHAT, 'two'));
});
