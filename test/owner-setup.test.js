'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureOwner } = require('../src/config/owner-setup');

const OWNER = '5511987654321';
const OTHER = '5543987654321';

function fixture(t, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-owner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'data/bot-owner.json');
  const save = value => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  return { root, file, env, save, log: { log() {}, warn() {}, error() {} } };
}

test('BOT_OWNER explícito válido prevalece e não altera o cadastro salvo', async t => {
  const f = fixture(t, { BOT_OWNER: OWNER });
  f.save('{inválido');
  await ensureOwner({ ...f, ask: () => assert.fail('não deve perguntar') });
  assert.equal(f.env.BOT_OWNER, OWNER);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{inválido');
});

test('BOT_OWNER explícito não cria diretórios ou arquivos', async t => {
  const f = fixture(t, { BOT_OWNER: OWNER });
  await ensureOwner({ ...f, ask: () => assert.fail('não deve perguntar') });
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('BOT_OWNER explícito inválido bloqueia, mesmo com dono salvo válido', async t => {
  for (const owner of ['123', '+5511987654321', '5511-987654321', '1234567890123456']) {
    const f = fixture(t, { BOT_OWNER: owner });
    f.save({ owner: OWNER });
    await assert.rejects(ensureOwner({ ...f, ask: () => assert.fail('não deve perguntar') }), { code: 'OWNER_INVALID' });
    assert.equal(f.env.BOT_OWNER, owner);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { owner: OWNER });
  }
});

test('dono salvo é reutilizado sem perguntar ou regravar', async t => {
  const f = fixture(t);
  f.save({ owner: OWNER });
  const before = fs.readFileSync(f.file, 'utf8');
  await ensureOwner({ ...f, ask: () => assert.fail('não deve perguntar') });
  assert.equal(f.env.BOT_OWNER, OWNER);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
});

test('cadastro corrompido ou inválido bloqueia sem perguntar ou sobrescrever', async t => {
  for (const saved of ['{inválido', 'null', '{}', JSON.stringify({ owner: '+5511987654321' })]) {
    const f = fixture(t);
    f.save(saved);
    await assert.rejects(ensureOwner({ ...f, ask: () => assert.fail('não deve perguntar') }), { code: 'OWNER_CONFIG_INVALID' });
    assert.equal(fs.readFileSync(f.file, 'utf8'), saved);
    assert.equal(f.env.BOT_OWNER, undefined);
  }
});

test('primeiro início repete entradas inválidas e salva dono privado para o próximo início', async t => {
  const f = fixture(t, { BOT_OWNERS: OTHER, DEVELOPER_CONTACT: OTHER });
  const answers = ['', 'abc', '123', OWNER];
  let prompts = 0;
  await ensureOwner({ ...f, ask: async question => {
    assert.equal(typeof question, 'string');
    assert.ok(prompts < answers.length, 'não deve perguntar após receber um dono válido');
    return answers[prompts++];
  } });
  assert.equal(prompts, 4);
  assert.equal(f.env.BOT_OWNER, OWNER);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { owner: OWNER });
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['bot-owner.json']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);

  const nextEnv = {};
  await ensureOwner({ ...f, env: nextEnv, ask: () => assert.fail('não deve perguntar novamente') });
  assert.equal(nextEnv.BOT_OWNER, OWNER);
});

test('console indisponível rejeita sem salvar um dono', async t => {
  const f = fixture(t);
  await assert.rejects(ensureOwner({ ...f, ask: async () => { throw new Error('console fechado'); } }));
  assert.equal(f.env.BOT_OWNER, undefined);
  assert.equal(fs.existsSync(f.file), false);
});
