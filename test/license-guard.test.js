'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createClient, OFFICIAL_URL, OFFICIAL_HOST } = require('../src/licensing/licenseClient');
const { createGuard, NOTICE_DAYS, NOTICE_ENDS_AT, HEARTBEAT_MS } = require('../src/licensing/licenseGuard');
const messages = require('../src/licensing/messages');

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-11-11T12:00:00Z');
const FAR = Date.parse('2099-01-01T00:00:00Z');
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function tempDir(t, prefix = 'lobo-license-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('o endereço do painel é fixo: LOBO_API_URL só vale no painel oficial em HTTPS', () => {
  assert.equal(OFFICIAL_URL, 'https://lobo-license-hub.base44.app/functions/loboApi');
  const client = env => createClient({ env });
  assert.equal(client({ LOBO_LICENSE_KEY: 'LOBO-X' }).endpoint(), OFFICIAL_URL);
  assert.equal(client({ LOBO_LICENSE_KEY: 'LOBO-X', LOBO_API_URL: `https://${OFFICIAL_HOST}/functions/loboApi` }).endpoint(), OFFICIAL_URL);
  for (const [url, code] of [
    ['https://painel-falso.example.com/functions/loboApi', 'LOBO_LICENSE_URL_NOT_OFFICIAL'],
    ['https://lobo-license-hub.base44.app.evil.example/x', 'LOBO_LICENSE_URL_NOT_OFFICIAL'],
    ['http://lobo-license-hub.base44.app/functions/loboApi', 'LOBO_LICENSE_HTTPS_REQUIRED'],
    ['isto não é url', 'LOBO_LICENSE_URL_INVALID'],
  ]) assert.throws(() => client({ LOBO_LICENSE_KEY: 'LOBO-X', LOBO_API_URL: url }).validateConfig(), { code }, url);
  // Só a chave liga a licença; a URL sozinha não configura nada.
  assert.equal(client({}).configured(), false);
  assert.equal(client({ LOBO_API_URL: OFFICIAL_URL }).configured(), false);
  assert.equal(client({ LOBO_LICENSE_KEY: '  ' }).configured(), false);
  assert.equal(client({ LOBO_LICENSE_KEY: ' LOBO-X ' }).configured(), true);
});

test('o cliente envia a chave no cabeçalho e separa negação de falha de comunicação', async () => {
  const calls = [];
  let next = json(200, { ok: true, authorized: true });
  const client = createClient({ env: { LOBO_LICENSE_KEY: ' LOBO-TESTE ' }, fetchImpl: async (url, options) => { calls.push({ url, options }); if (next instanceof Error) throw next; return next; } });
  assert.deepEqual(await client.request('validate', { installation_id: 'abc' }), { ok: true, authorized: true });
  assert.equal(calls[0].url, OFFICIAL_URL); assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['x-lobo-key'], 'LOBO-TESTE');
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'validate', installation_id: 'abc' });

  // Resposta real do painel para chave inválida: 401 com motivo.
  next = json(401, { ok: false, authorized: false, motivo: 'credencial_invalida' });
  await assert.rejects(client.request('validate'), error => error.code === 'LOBO_LICENSE_DENIED' && error.reason === 'credencial_invalida' && error.communication === false);
  next = json(400, { ok: false, error: 'Parâmetro "action" é obrigatório.' });
  await assert.rejects(client.request('validate'), error => error.code === 'LOBO_LICENSE_REQUEST_REJECTED' && error.communication === false && !/["<>]/.test(error.reason));
  for (const status of [500, 503, 429, 408]) {
    next = json(status, { ok: false });
    await assert.rejects(client.request('validate'), error => error.code === 'LOBO_LICENSE_SERVER_ERROR' && error.communication === true, String(status));
  }
  next = { status: 200, ok: true, json: async () => { throw SyntaxError('html'); } };
  await assert.rejects(client.request('validate'), { code: 'LOBO_LICENSE_INVALID_RESPONSE' });
  next = new TypeError('fetch failed');
  await assert.rejects(client.request('validate'), error => error.code === 'LOBO_LICENSE_NETWORK_ERROR' && error.communication === true);
  // Sem chave nada é enviado.
  const idle = createClient({ env: {}, fetchImpl: async () => assert.fail('sem chave não há requisição') });
  assert.deepEqual(await idle.request('validate'), { disabled: true });
});

// Guardião com relógio e painel controlados pelo teste.
function guardFixture(t, { key = '', respond = () => json(200, { ok: true, authorized: true }), noticeEndsAt = FAR } = {}) {
  const dataDir = path.join(tempDir(t), 'data'), calls = [];
  const clock = { now: T0 };
  const env = { LOBO_LICENSE_KEY: key };
  const client = createClient({ env, fetchImpl: async (url, options) => { const body = JSON.parse(options.body); calls.push(body.action); const result = await respond(body); if (result instanceof Error) throw result; return result; } });
  const make = () => createGuard({ dataDir, client, now: () => clock.now, noticeEndsAt, hostname: () => 'host-de-teste', version: () => '1.0.0' });
  const state = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'lobo-license-state.json'), 'utf8'));
  return { dataDir, calls, clock, env, guard: make(), make, state };
}

test('sem chave: 7 dias de aviso a partir do primeiro início e depois o bot não inicia', async t => {
  assert.equal(NOTICE_DAYS, 7);
  const f = guardFixture(t);
  const first = await f.guard.authorizeStartup();
  assert.equal(first.enabled, false); assert.equal(first.notice.daysLeft, 7); assert.equal(first.notice.deadline, T0 + 7 * DAY);
  assert.equal(f.state().noticeStartedAt, T0);
  assert.deepEqual(f.calls, [], 'sem chave o painel não é consultado');

  // Reinícios não renovam o prazo.
  f.clock.now = T0 + 3 * DAY + 1000;
  const later = await f.make().authorizeStartup();
  assert.equal(later.notice.deadline, T0 + 7 * DAY); assert.equal(later.notice.daysLeft, 4);
  f.clock.now = T0 + 7 * DAY - 1000;
  assert.equal((await f.guard.authorizeStartup()).notice.daysLeft, 1);

  f.clock.now = T0 + 7 * DAY;
  await assert.rejects(f.guard.authorizeStartup(), { code: 'LOBO_LICENSE_REQUIRED' });
  f.clock.now = T0 + 30 * DAY;
  await assert.rejects(f.make().authorizeStartup(), { code: 'LOBO_LICENSE_REQUIRED' });
});

test('o prazo não é renovado apagando arquivos, mexendo no relógio ou tirando a chave', async t => {
  // Fim da transição: depois dele não existe aviso nem para instalação nova.
  assert.ok(NOTICE_ENDS_AT > Date.parse('2026-11-11T00:00:00Z') && NOTICE_ENDS_AT < Date.parse('2027-01-01T00:00:00Z'));
  const cap = T0 + 10 * DAY;
  const f = guardFixture(t, { noticeEndsAt: cap });
  await f.guard.authorizeStartup();
  f.clock.now = T0 + 6 * DAY;
  fs.rmSync(f.dataDir, { recursive: true, force: true });
  const reset = await f.make().authorizeStartup();
  assert.equal(reset.notice.deadline, cap, 'apagar data/ não passa do fim da transição');
  f.clock.now = cap;
  fs.rmSync(f.dataDir, { recursive: true, force: true });
  await assert.rejects(f.make().authorizeStartup(), { code: 'LOBO_LICENSE_REQUIRED' });

  // Relógio atrasado depois de iniciar o aviso não cria prazo novo maior que 7 dias.
  const g = guardFixture(t);
  await g.guard.authorizeStartup();
  g.clock.now = T0 - 5 * DAY;
  assert.equal((await g.guard.authorizeStartup()).notice.deadline, T0 - 5 * DAY + 7 * DAY);

  // Autorizar com chave não apaga o início do aviso: tirar a chave depois não zera o prazo.
  const h = guardFixture(t);
  await h.guard.authorizeStartup();
  h.env.LOBO_LICENSE_KEY = 'LOBO-OK'; h.clock.now = T0 + 2 * DAY;
  assert.equal((await h.guard.authorizeStartup()).enabled, true);
  assert.equal(h.state().noticeStartedAt, T0); assert.equal(h.state().lastAuthorizedAt, T0 + 2 * DAY);
  h.env.LOBO_LICENSE_KEY = ''; h.clock.now = T0 + 8 * DAY;
  await assert.rejects(h.guard.authorizeStartup(), { code: 'LOBO_LICENSE_REQUIRED' });
});

test('com chave: registra, valida e autoriza; negação bloqueia na hora, com o motivo', async t => {
  const ok = guardFixture(t, { key: 'LOBO-OK' });
  const result = await ok.guard.authorizeStartup();
  assert.equal(result.enabled, true); assert.match(result.installationId, /^[a-f0-9]{32}$/); assert.equal(result.notice, undefined);
  assert.deepEqual(ok.calls, ['register_installation', 'validate', 'authorize_pairing']);
  assert.equal(ok.state().lastAuthorizedAt, T0);
  assert.equal((await ok.make().authorizeStartup()).installationId, result.installationId, 'a instalação mantém o mesmo identificador');

  const denied = guardFixture(t, { key: 'LOBO-RUIM', respond: () => json(401, { ok: false, authorized: false, motivo: 'credencial_invalida' }) });
  await assert.rejects(denied.guard.authorizeStartup(), error => error.code === 'LOBO_LICENSE_DENIED' && error.reason === 'credencial_invalida');
  assert.deepEqual(denied.calls, ['register_installation']);
  // Chave recusada não ganha período de aviso nem tolerância.
  assert.equal(fs.existsSync(path.join(denied.dataDir, 'lobo-license-state.json')), false);

  const soft = guardFixture(t, { key: 'LOBO-OK', respond: body => (body.action === 'validate' ? json(200, { ok: true, authorized: false, motivo: 'licenca_suspensa' }) : json(200, { ok: true, authorized: true })) });
  await assert.rejects(soft.guard.authorizeStartup(), error => error.code === 'LOBO_LICENSE_DENIED' && error.reason === 'licenca_suspensa');
});

test('painel fora do ar: tolerância de 24 h só para quem já foi autorizado', async t => {
  let down = false;
  const f = guardFixture(t, { key: 'LOBO-OK', respond: () => (down ? json(503, {}) : json(200, { ok: true, authorized: true })) });
  await f.guard.authorizeStartup();
  down = true; f.clock.now = T0 + 23 * 60 * 60 * 1000;
  assert.deepEqual(await f.guard.authorizeStartup().then(r => [r.enabled, r.grace]), [true, true]);
  f.clock.now = T0 + 25 * 60 * 60 * 1000;
  await assert.rejects(f.guard.authorizeStartup(), { code: 'LOBO_LICENSE_GRACE_EXPIRED' });
  const never = guardFixture(t, { key: 'LOBO-OK', respond: () => new TypeError('fetch failed') });
  await assert.rejects(never.guard.authorizeStartup(), { code: 'LOBO_LICENSE_GRACE_EXPIRED' });
});

test('verificação periódica: negação avisa uma vez com o motivo; queda do painel respeita a tolerância', async t => {
  assert.equal(HEARTBEAT_MS, 15 * 60 * 1000);
  let mode = 'ok';
  const f = guardFixture(t, { key: 'LOBO-OK', respond: () => (mode === 'ok' ? json(200, { ok: true, authorized: true }) : mode === 'down' ? json(503, {}) : json(401, { ok: false, authorized: false, motivo: 'credencial_invalida' })) });
  await f.guard.authorizeStartup();
  let tick, period; const denials = [], logs = [];
  const stop = f.guard.startHeartbeat({ onDenied: (reason, error) => denials.push([reason, error.code]), log: code => logs.push(code), schedule: (fn, ms) => { tick = fn; period = ms; return {}; }, cancel: () => {} });
  assert.equal(period, HEARTBEAT_MS); assert.equal(typeof stop, 'function');
  await tick(); assert.deepEqual(denials, []); assert.equal(f.calls.at(-1), 'heartbeat');
  mode = 'down'; f.clock.now = T0 + 60 * 60 * 1000;
  await tick(); assert.deepEqual(denials, [], 'dentro da tolerância o bot continua');
  f.clock.now = T0 + 26 * 60 * 60 * 1000;
  await tick(); assert.deepEqual(denials, [['LOBO_LICENSE_GRACE_EXPIRED', 'LOBO_LICENSE_GRACE_EXPIRED']]);
  mode = 'denied'; denials.length = 0;
  await tick(); assert.deepEqual(denials, [['credencial_invalida', 'LOBO_LICENSE_DENIED']]); assert.ok(logs.includes('LOBO_LICENSE_DENIED'));
  // Sem chave não há verificação periódica.
  assert.equal(guardFixture(t).guard.startHeartbeat({ schedule: () => assert.fail('sem chave') })(), undefined);
});

test('o fim do aviso com o bot ligado dispara o encerramento', async t => {
  const f = guardFixture(t);
  const { notice } = await f.guard.authorizeStartup();
  let fire, delay, expired;
  f.clock.now = T0 + DAY;
  f.guard.watchNotice({ deadline: notice.deadline, onExpired: error => { expired = error; }, schedule: (fn, ms) => { fire = fn; delay = ms; return {}; }, cancel: () => {} });
  assert.equal(delay, 6 * DAY); fire();
  assert.equal(expired.code, 'LOBO_LICENSE_REQUIRED');
});

test('as mensagens dizem o prazo, o que fazer e nunca mostram telefone', () => {
  const deadline = T0 + 3 * DAY;
  const lines = messages.noticeLines(deadline, T0).join('\n');
  assert.match(lines, /sem chave de licença/); assert.match(lines, /mais 3 dias/); assert.ok(lines.includes(messages.dateLabel(deadline))); assert.match(lines, /LOBO_LICENSE_KEY/);
  assert.match(messages.noticeLines(T0 + DAY, T0)[0], /mais 1 dia /);
  const owner = messages.ownerNotice(deadline, { now: T0, prefix: '/' });
  assert.match(owner, /LICENÇA PENDENTE/); assert.match(owner, /\*3 dias\*/); assert.match(owner, /\/criador/); assert.match(owner, /LOBO_LICENSE_KEY/);
  const all = [lines, owner, ...['LOBO_LICENSE_REQUIRED', 'LOBO_LICENSE_DENIED', 'LOBO_LICENSE_GRACE_EXPIRED', 'LOBO_LICENSE_URL_NOT_OFFICIAL'].flatMap(code => messages.failureLines({ code, reason: 'credencial_invalida' }))].join('\n');
  assert.ok(!all.includes(require('../src/config/creator').number)); assert.doesNotMatch(all, /\d{10,}/);
  assert.match(messages.failureLines({ code: 'LOBO_LICENSE_DENIED', reason: 'credencial_invalida' })[0], /credencial_invalida: a chave não existe no painel/);
  assert.match(messages.failureLines({ code: 'LOBO_LICENSE_DENIED', reason: 'motivo_novo' })[0], /\(motivo_novo\)/);
  assert.match(messages.failureLines({ code: 'LOBO_LICENSE_REQUIRED' })[0], /precisa de uma licença válida/);
  assert.deepEqual(messages.failureLines({ code: 'OUTRO' }), []);
});

// Instalação de teste com o index.js e o supervisor REAIS. O guardião é o código
// real criado pela fábrica, com o fim da transição escolhido pelo teste, e o
// runtime é um processo simples que, como o real, exige supervisor e encerra em SIGTERM.
function installation(t, { noticeEndsAt = FAR, startedAgoMs = null, key = '' } = {}) {
  const root = tempDir(t, 'lobo-license-entry-'), repo = path.join(__dirname, '..');
  for (const dir of ['src/licensing', 'src/updater', 'src/config', 'src/utils', 'data']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const file of ['index.js', 'bootstrap.js', 'config/owner-setup.js', 'utils/terminal-input.js', 'utils/file-log.js', 'updater/supervisor.js', 'updater/recovery.js', 'updater/health.js', 'updater/lock.js', 'updater/source.js', 'licensing/messages.js'])
    fs.copyFileSync(path.join(repo, 'src', file), path.join(root, 'src', file));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'lobo-license-entry', version: '1.0.0', dependencies: {} }));
  fs.writeFileSync(path.join(root, 'src/licensing/licenseGuard.js'),
    `module.exports = require(${JSON.stringify(path.join(repo, 'src/licensing/licenseGuard.js'))}).createGuard({ dataDir: ${JSON.stringify(path.join(root, 'data'))}, noticeEndsAt: ${noticeEndsAt} });\n`);
  fs.writeFileSync(path.join(root, 'src/runtime.js'), [
    "if (process.env.LOBO_SUPERVISED !== '1' || typeof process.send !== 'function') process.exit(1);",
    "require('node:fs').writeFileSync('runtime.pid', String(process.pid));",
    "console.log('runtime iniciado; aviso=' + (process.env.LOBO_LICENSE_NOTICE || 'nenhum'));",
    "process.on('SIGTERM', () => process.exit(0));",
    'setInterval(() => {}, 1000);',
  ].join('\n'));
  if (startedAgoMs !== null) fs.writeFileSync(path.join(root, 'data/lobo-license-state.json'), JSON.stringify({ noticeStartedAt: Date.now() - startedAgoMs }));
  const env = { ...process.env, NODE_PATH: path.join(repo, 'node_modules'), PORT: '', RENDER: '', BOT_OWNER: '5511987654321', LOBO_LICENSE_KEY: key, LOBO_API_URL: '' };
  const runtimeAlive = () => { try { process.kill(Number(fs.readFileSync(path.join(root, 'runtime.pid'), 'utf8')), 0); return true; } catch { return false; } };
  function start() {
    const child = spawn(process.execPath, ['src/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const waiters = [];
    const feed = chunk => { output += chunk; for (const waiter of [...waiters]) if (waiter.pattern.test(output)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(); } };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    t.after(() => { try { child.kill('SIGKILL'); } catch {} try { process.kill(Number(fs.readFileSync(path.join(root, 'runtime.pid'), 'utf8')), 'SIGKILL'); } catch {} });
    const until = (pattern, ms = 15000) => new Promise((resolve, reject) => {
      if (pattern.test(output)) return resolve();
      const timer = setTimeout(() => reject(Error(`Saída esperada não apareceu: ${pattern}\n${output}`)), ms);
      waiters.push({ pattern, resolve: () => { clearTimeout(timer); resolve(); } });
    });
    return { child, exited, until, output: () => output };
  }
  return { root, env, start, runtimeAlive };
}

test('início real sem chave: avisa, repassa o prazo ao runtime e encerra tudo ao parar', { skip: process.platform === 'win32' }, async t => {
  const f = installation(t);
  const run = f.start();
  await run.until(/runtime iniciado; aviso=\d+/);
  assert.match(run.output(), /\[LICENÇA\] Este bot está sem chave de licença\. Ele continua funcionando por mais 7 dias/);
  assert.match(run.output(), /LOBO_LICENSE_KEY/);
  assert.equal(f.runtimeAlive(), true);
  run.child.kill('SIGTERM');
  await run.exited;
  assert.equal(f.runtimeAlive(), false, 'o runtime encerra junto com o supervisor');
});

test('início real com o aviso vencido, ou depois do fim da transição: não inicia', { skip: process.platform === 'win32' }, async t => {
  for (const options of [{ startedAgoMs: 8 * DAY }, { noticeEndsAt: Date.parse('2020-01-01T00:00:00Z') }]) {
    const f = installation(t, options);
    const run = f.start();
    const { code } = await run.exited;
    assert.equal(code, 1);
    assert.match(run.output(), /\[LICENÇA\] Inicialização bloqueada: LOBO_LICENSE_REQUIRED/);
    assert.match(run.output(), /precisa de uma licença válida/);
    assert.doesNotMatch(run.output(), /runtime iniciado/);
    assert.equal(fs.existsSync(path.join(f.root, 'runtime.pid')), false);
  }
});

test('aviso que vence com o bot ligado encerra o supervisor E o runtime, com código 1', { skip: process.platform === 'win32' }, async t => {
  const f = installation(t, { startedAgoMs: 7 * DAY - 2500 });
  const run = f.start();
  await run.until(/runtime iniciado/);
  assert.equal(f.runtimeAlive(), true);
  await run.until(/O período de aviso terminou\. Encerrando o bot\./, 20000);
  const { code } = await run.exited;
  assert.equal(code, 1);
  assert.equal(f.runtimeAlive(), false, 'o processo do WhatsApp não pode continuar rodando sozinho');
});

test('o runtime real não inicia fora do supervisor e encerra quando o supervisor some', () => {
  const direct = spawnSync(process.execPath, ['src/runtime.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBO_SUPERVISED: '' }, encoding: 'utf8', timeout: 30000 });
  assert.equal(direct.status, 1);
  assert.match(direct.stderr, /Inicie o bot com "node src\/index\.js"/);
  // Só a variável não basta: é preciso o canal do supervisor.
  const faked = spawnSync(process.execPath, ['src/runtime.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBO_SUPERVISED: '1' }, encoding: 'utf8', timeout: 30000 });
  assert.equal(faked.status, 1);
  const source = fs.readFileSync(path.join(__dirname, '../src/runtime.js'), 'utf8');
  assert.match(source, /process\.on\('disconnect', \(\) => shutdown\('SUPERVISOR_DISCONNECTED'\)\)/);
  assert.ok(source.indexOf("LOBO_SUPERVISED !== '1'") < source.indexOf('installQuietConsole()'), 'a verificação vem antes de carregar o bot');
});
