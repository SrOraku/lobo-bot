'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const context = require('../src/isolation/context');
const genetics = require('../src/lineage/genetics');
const { createLineage, companionPerk, DEN_LIMIT, ADOPTION_COOLDOWN, BREED_COOLDOWN, PROPOSAL_TTL } = require('../src/lineage/service');
const { createForest } = require('../src/forest/service');
const { createLineageHandlers, register, age } = require('../src/commands/lineage');

const { HOUR, DAY } = genetics;
const CHAT = '120363000000000011@g.us', OTHER_CHAT = '120363000000000012@g.us';
const A = '5511999912345@s.whatsapp.net', B = '5511888812345@s.whatsapp.net', C = '5511777712345@s.whatsapp.net';
const START = Date.parse('2026-11-25T15:00:00Z');
const genome = text => Object.fromEntries(['K', 'A', 'D', 'G', 'L'].map((gene, index) => [gene, text.split(' ')[index].split('')]));
const wolfOf = (text, mark = null) => ({ genome: genome(text), mark });

function fixture(t, { random = () => 0.5 } = {}) {
  const raw = new Database(':memory:');
  runMigrations(raw);
  t.after(() => raw.close());
  const db = createScopedDatabase(raw);
  const api = {
    db,
    getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    addGold: (jid, amount) => db.prepare('UPDATE users SET gold=gold+? WHERE jid=?').run(amount, jid),
    addXP: (jid, amount) => db.prepare('UPDATE users SET xp=xp+? WHERE jid=?').run(amount, jid),
  };
  for (const chat of [CHAT, OTHER_CHAT]) for (const jid of [A, B, C])
    context.run(chat, () => db.prepare('INSERT INTO users(jid,name,gold,xp) VALUES(?,?,?,?)').run(jid, 'Lobo', 500, 0));
  let time = START, counter = 0;
  const now = () => time;
  const forest = createForest(api, { now, random: () => 0.5 });
  const lineage = createLineage(api, { now, random, forest });
  const plant = (owner, text, { mark = null, bornAt = START - 10 * DAY, bond = 50, active = 1, parents = [null, null], generation = 1, chat = CHAT, fedAt = time, playedAt = time } = {}) =>
    raw.prepare(`INSERT INTO lineage_wolves(chat_jid,owner_jid,name,genome,mark,generation,parent_a,parent_b,born_at,fed_at,played_at,bond,bred_at,status,active)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,'toca',?)`).run(chat, owner, 'Lobo' + ++counter, JSON.stringify(genome(text)), mark, generation, parents[0], parents[1], bornAt, fedAt, playedAt, bond, active).lastInsertRowid;
  const row = id => raw.prepare('SELECT * FROM lineage_wolves WHERE id=?').get(id);
  const user = (jid = A, chat = CHAT) => context.run(chat, () => api.getUser(jid));
  return { raw, api, lineage, forest, plant, row, user, id: () => 'evt-' + ++counter, advance: ms => { time += ms; }, now };
}

test('Punnett exato: epistasia 12:3:1 na pelagem e dominância incompleta no porte', () => {
  const both = wolfOf('Kk Aa Dd Gg Ls');
  const chance = genetics.predict(both, both);
  assert.deepEqual(chance.coat.map(item => [item.id, item.p]), [['negro', 0.75], ['cinzento', 0.1875], ['branco', 0.0625]]);
  assert.deepEqual(chance.size.map(item => [item.id, item.p]), [['medio', 0.5], ['grande', 0.25], ['agil', 0.25]]);
  assert.deepEqual(chance.eyes.map(item => [item.id, item.p]), [['ambar', 0.75], ['azul', 0.25]]);
  const hidden = genetics.predict(wolfOf('kk Aa DD GG LL'), wolfOf('kk Aa DD GG LL'));
  assert.equal(genetics.phenotype(wolfOf('kk Aa DD GG LL')).coat.id, 'cinzento');
  assert.equal(hidden.coat.find(item => item.id === 'branco').p, 0.25, 'dois cinzentos portadores geram 25% de brancos');
  assert.equal(chance.mark, genetics.MUTATION_CHANCE);
  assert.ok(genetics.predict(wolfOf('kk aa dd gg ss', 'lunar'), wolfOf('kk aa dd gg ss', 'lunar')).mark > 0.7);
});

test('herança usa um alelo de cada pai e marcas raras passam adiante ou surgem por mutação', () => {
  const draws = values => { let index = 0; return () => values[index++ % values.length]; };
  const father = wolfOf('KK AA DD GG LL', 'lunar'), mother = wolfOf('kk aa dd gg ss', 'lunar');
  const child = genetics.inherit(father, mother, draws([0.1, 0.9]));
  assert.deepEqual(child.genome, genome('Kk Aa Dd Gg Ls'));
  assert.equal(child.mark, 'lunar');
  const mutant = genetics.inherit(wolfOf('Kk Aa Dd Gg Ls'), wolfOf('Kk Aa Dd Gg Ls'), draws([0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.01, 0.4]));
  assert.equal(mutant.mark, 'hetero');
  assert.equal(genetics.phenotype(mutant).eyes.id, 'hetero');
  assert.equal(genetics.inherit(father, mother, () => 0.99).mark, null);
  assert.ok(genetics.validGenome(genetics.wild(Math.random).genome));
  assert.ok(!genetics.validGenome({ K: ['X', 'k'] }));
});

test('fases da vida, fome, alegria, vínculo e bloqueios do talento seguem o tempo real', () => {
  assert.equal(genetics.stage(START, START + DAY).id, 'filhote');
  assert.equal(genetics.stage(START, START + 2 * DAY).id, 'jovem');
  assert.equal(genetics.stage(START, START + 5 * DAY).canBreed, true);
  assert.equal(genetics.stage(START, START + 40 * DAY).id, 'anciao');
  const base = { born_at: START - 6 * DAY, fed_at: START, played_at: START, bond: 60 };
  assert.equal(genetics.condition(base, START + 10 * HOUR).hunger, 40);
  assert.equal(genetics.condition(base, START + 10 * HOUR).joy, 70);
  assert.equal(genetics.condition(base, START + 30 * HOUR).bond, 57, 'perde 1 de vínculo a cada 2h depois de 24h sem cuidado');
  assert.equal(genetics.condition(base, START + 20 * HOUR).talentBlocked, 'está com fome');
  assert.equal(genetics.condition({ ...base, born_at: START }, START + HOUR).talentBlocked, 'ainda é filhote');
  assert.equal(genetics.condition({ ...base, bond: 20 }, START + HOUR).talentBlocked, 'precisa de vínculo 30');
  assert.equal(genetics.phenotype(wolfOf('kk Aa Dd gg ss')).talent.bonus, 0.3, 'alma selvagem reforça o talento');
  assert.equal(genetics.phenotype(wolfOf('kk Aa Dd GG LL')).bondFactor, 1.5);
});

test('adoção cria companheiro, respeita intervalo, limite da toca e nunca repete a mesma mensagem', t => {
  const f = fixture(t);
  const first = f.lineage.adopt(CHAT, A, 'Luar', 'adopt-1');
  assert.equal(first.name, 'Luar');
  assert.equal(first.active, 1);
  assert.equal(first.generation, 1);
  assert.throws(() => f.lineage.adopt(CHAT, A, '', 'adopt-2'), error => error.code === 'LINEAGE_ADOPTION_COOLDOWN' && error.remaining === ADOPTION_COOLDOWN);
  f.advance(ADOPTION_COOLDOWN);
  assert.throws(() => f.lineage.adopt(CHAT, A, '', 'adopt-1'), error => error.code === 'LINEAGE_DUPLICATE');
  const second = f.lineage.adopt(CHAT, A, '', 'adopt-3');
  assert.equal(second.active, 0);
  assert.throws(() => f.lineage.adopt(CHAT, B, 'x', 'bad-name'), error => error.code === 'LINEAGE_NAME');
  assert.throws(() => f.lineage.adopt(CHAT, 'invalido', 'Luar', 'who'), error => error.code === 'LINEAGE_IDENTITY');
  for (let index = 0; index < DEN_LIMIT; index++) f.plant(C, 'kk Aa Dd Gg Ls', { active: index === 0 ? 1 : 0 });
  assert.throws(() => f.lineage.adopt(CHAT, C, '', 'full'), error => error.code === 'LINEAGE_DEN_FULL');
  assert.equal(f.raw.prepare("SELECT count(*) n FROM lineage_events WHERE kind='adotar'").get().n, 2);
});

test('cuidados fortalecem o vínculo com intervalo, dão XP e alma leal rende mais', t => {
  const f = fixture(t);
  const loyal = f.plant(A, 'kk Aa Dd Gg LL', { fedAt: START - 20 * HOUR, playedAt: START - 3 * HOUR, bond: 40 });
  const fed = f.lineage.care(CHAT, A, 'alimentar', f.id());
  assert.equal(fed.gain, 9, 'fome alta: 6 × 1,5 da alma leal');
  assert.equal(f.row(loyal).bond, 49);
  assert.equal(f.row(loyal).fed_at, START);
  assert.equal(f.user().xp, 3);
  assert.throws(() => f.lineage.care(CHAT, A, 'alimentar', f.id()), error => error.code === 'LINEAGE_CARE_COOLDOWN' && error.remaining === 3 * HOUR);
  assert.equal(f.lineage.care(CHAT, A, 'brincar', f.id()).gain, 8);
  f.raw.prepare('UPDATE lineage_wolves SET bond=99 WHERE id=?').run(loyal);
  f.advance(3 * HOUR);
  f.lineage.care(CHAT, A, 'alimentar', f.id());
  assert.equal(f.row(loyal).bond, 100);
  assert.throws(() => f.lineage.care(CHAT, B, 'brincar', f.id()), error => error.code === 'LINEAGE_NONE');
});

test('falha ao dar XP desfaz o cuidado inteiro', t => {
  const f = fixture(t);
  const id = f.plant(A, 'kk Aa Dd Gg Ls', { fedAt: START - 5 * HOUR });
  const before = f.row(id);
  f.api.addXP = () => { throw Error('perfil indisponível'); };
  assert.throws(() => f.lineage.care(CHAT, A, 'alimentar', 'fail'), /perfil indisponível/);
  assert.deepEqual(f.row(id), before);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM lineage_events').get().n, 0);
});

test('cruzamento exige adultos, aceite do outro dono e gera um filhote para cada um', t => {
  const f = fixture(t, { random: () => 0.1 });
  const father = f.plant(A, 'KK AA DD GG LL', { generation: 2 });
  const young = f.plant(B, 'kk aa dd gg ss', { bornAt: START - DAY });
  assert.throws(() => f.lineage.propose(CHAT, A, B, f.id()), error => error.code === 'LINEAGE_YOUNG');
  f.raw.prepare('UPDATE lineage_wolves SET born_at=? WHERE id=?').run(START - 6 * DAY, young);
  assert.throws(() => f.lineage.propose(CHAT, A, A, f.id()), error => error.code === 'LINEAGE_SELF');
  assert.throws(() => f.lineage.propose(CHAT, A, C, f.id()), error => error.code === 'LINEAGE_PARTNER_NONE');
  const proposal = f.lineage.propose(CHAT, A, B, f.id());
  assert.equal(proposal.expiresAt, START + PROPOSAL_TTL);
  assert.equal(proposal.prediction.coat[0].id, 'negro');
  assert.throws(() => f.lineage.respond(CHAT, A, true, f.id()), error => error.code === 'LINEAGE_NO_PROPOSAL');
  const born = f.lineage.respond(CHAT, B, true, f.id());
  assert.equal(born.accepted, true);
  assert.deepEqual(born.cubs.map(cub => cub.owner_jid), [A, B]);
  for (const cub of born.cubs) {
    assert.deepEqual([cub.parent_a, cub.parent_b], [father, young]);
    assert.equal(cub.generation, 3);
    assert.deepEqual(cub.genome, genome('Kk Aa Dd Gg Ls'));
    assert.equal(cub.active, 0);
  }
  assert.equal(f.row(father).bred_at, START);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM lineage_proposals').get().n, 0);
  f.advance(BREED_COOLDOWN);
  assert.doesNotThrow(() => f.lineage.propose(CHAT, A, B, f.id()), 'depois do intervalo o casal pode cruzar de novo');
});

test('intervalo de reprodução, pedido expirado e recusa não criam filhotes', t => {
  const f = fixture(t);
  f.plant(A, 'Kk Aa Dd Gg Ls');
  f.plant(B, 'kk aa Dd Gg Ls');
  f.lineage.propose(CHAT, A, B, f.id());
  f.advance(PROPOSAL_TTL);
  assert.throws(() => f.lineage.respond(CHAT, B, true, f.id()), error => error.code === 'LINEAGE_NO_PROPOSAL');
  f.lineage.propose(CHAT, A, B, f.id());
  assert.equal(f.lineage.respond(CHAT, B, false, f.id()).accepted, false);
  f.lineage.propose(CHAT, A, B, f.id());
  f.lineage.respond(CHAT, B, true, f.id());
  assert.throws(() => f.lineage.propose(CHAT, A, B, f.id()), error => error.code === 'LINEAGE_BREED_COOLDOWN' && error.remaining === BREED_COOLDOWN);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM lineage_wolves WHERE parent_a IS NOT NULL').get().n, 2);
});

test('parentes próximos não cruzam e toca cheia bloqueia o nascimento', t => {
  const f = fixture(t);
  const a = f.plant(A, 'Kk Aa Dd Gg Ls'), b = f.plant(B, 'Kk Aa Dd Gg Ls');
  const sibling1 = f.plant(A, 'Kk Aa Dd Gg Ls', { active: 0, parents: [a, b] });
  const sibling2 = f.plant(C, 'Kk Aa Dd Gg Ls', { parents: [a, b] });
  f.lineage.use(CHAT, A, 2);
  assert.equal(f.row(sibling1).active, 1);
  assert.throws(() => f.lineage.propose(CHAT, A, C, f.id()), error => error.code === 'LINEAGE_KIN');
  assert.throws(() => f.lineage.propose(CHAT, B, A, f.id()), error => error.code === 'LINEAGE_KIN', 'pai e filho');
  assert.equal(f.lineage.predictWith(CHAT, A, C).kin, true);
  f.lineage.use(CHAT, A, 1);
  for (let index = 0; index < DEN_LIMIT - 1; index++) f.plant(C, 'kk aa dd gg ss', { active: 0 });
  f.raw.prepare('UPDATE lineage_wolves SET active=0 WHERE id=?').run(sibling2);
  f.raw.prepare("UPDATE lineage_wolves SET active=1 WHERE id=(SELECT max(id) FROM lineage_wolves WHERE owner_jid=?)").run(C);
  f.lineage.propose(CHAT, A, C, f.id());
  assert.throws(() => f.lineage.respond(CHAT, C, true, f.id()), error => error.code === 'LINEAGE_DEN_FULL');
  assert.equal(f.raw.prepare("SELECT count(*) n FROM lineage_wolves WHERE owner_jid=?").get(C).n, DEN_LIMIT);
});

test('toca troca companheiro, renomeia e solta o lobo de volta para a floresta', t => {
  const f = fixture(t);
  const first = f.plant(A, 'Kk Aa Dd Gg Ls'), second = f.plant(A, 'kk aa dd gg ss', { active: 0 });
  assert.equal(f.lineage.rename(CHAT, A, 2, '  Nevasca*_ ').wolf.name, 'Nevasca');
  assert.throws(() => f.lineage.use(CHAT, A, 3), error => error.code === 'LINEAGE_INDEX');
  const lonely = f.lineage.release(CHAT, A, 1, f.id());
  assert.equal(lonely.joinedForest, false, 'sem floresta criada, nada é criado à força');
  assert.equal(f.raw.prepare('SELECT count(*) n FROM forest_state').get().n, 0);
  assert.equal(lonely.promoted.id, second);
  assert.equal(f.row(first).status, 'livre');
  assert.equal(f.row(second).active, 1);
  f.forest.snapshot(CHAT);
  const wildBefore = JSON.parse(f.raw.prepare('SELECT state FROM forest_state WHERE chat_jid=?').get(CHAT).state).w;
  assert.equal(f.lineage.release(CHAT, A, 1, f.id()).joinedForest, true);
  assert.equal(JSON.parse(f.raw.prepare('SELECT state FROM forest_state WHERE chat_jid=?').get(CHAT).state).w, Math.round((wildBefore + 0.02) * 1000) / 1000);
  assert.equal(f.forest.chronicle(CHAT)[0].kind, 'soltura');
  assert.equal(f.lineage.listDen(CHAT, A).wolves.length, 0);
});

test('árvore mostra pais, avós e filhotes; lobos ficam isolados por chat', t => {
  const f = fixture(t);
  const g1 = f.plant(B, 'KK AA DD GG LL', { active: 0 }), g2 = f.plant(B, 'kk aa dd gg ss', { active: 0 });
  const parent = f.plant(B, 'Kk Aa Dd Gg Ls', { parents: [g1, g2], generation: 2 });
  const other = f.plant(C, 'kk Aa Dd Gg Ls');
  const cub = f.plant(A, 'Kk Aa Dd Gg Ls', { parents: [parent, other], generation: 3 });
  const view = f.lineage.tree(CHAT, A);
  assert.equal(view.wolf.id, cub);
  assert.deepEqual(view.parents.map(item => item.id), [parent, other]);
  assert.deepEqual(view.grandparents[0].map(item => item.id), [g1, g2]);
  assert.deepEqual(view.grandparents[1], [null, null]);
  assert.deepEqual(f.lineage.tree(CHAT, B).children.map(item => item.id), [cub]);
  assert.throws(() => f.lineage.companion(OTHER_CHAT, A), error => error.code === 'LINEAGE_NONE');
  assert.equal(f.lineage.companion(CHAT, B).children, 1);
});

test('companheiro adulto e bem cuidado reforça a ação da floresta do seu talento', t => {
  const f = fixture(t);
  const hunter = f.plant(A, 'kk Aa Dd gg Ls', { bond: 40 });
  f.forest.snapshot(CHAT);
  const boosted = f.forest.act(CHAT, A, 'Lobo', 'cacar', f.id());
  assert.equal(boosted.companion.bonus, 0.2);
  assert.equal(boosted.companion.label, 'caçadas');
  assert.equal(boosted.coins, Math.round(require('../src/forest/model').reward('cacar', boosted.before, START, 0.5).coins * 1.2));
  assert.equal(f.forest.act(CHAT, B, 'Lobo', 'cacar', f.id()).companion, null);
  assert.equal(f.forest.act(CHAT, A, 'Lobo', 'plantar', f.id()).companion, null, 'talento só vale para a ação certa');
  f.advance(3 * HOUR);
  f.raw.prepare('UPDATE lineage_wolves SET fed_at=? WHERE id=?').run(f.now() - 21 * HOUR, hunter);
  assert.equal(companionPerk(f.raw, CHAT, A, 'cacar', f.now()), null, 'faminto não ajuda');
  f.raw.prepare('UPDATE lineage_wolves SET fed_at=?, genome=? WHERE id=?').run(f.now(), JSON.stringify(genome('kk Aa Dd gg ss')), hunter);
  assert.equal(companionPerk(f.raw, CHAT, A, 'cacar', f.now()).bonus, 0.3);
  f.raw.prepare('UPDATE lineage_wolves SET born_at=? WHERE id=?').run(f.now(), hunter);
  assert.equal(companionPerk(f.raw, CHAT, A, 'cacar', f.now()), null, 'filhote ainda não ajuda');
});

test('comandos mostram toca, DNA, previsão e pedidos com menção e prefixo da instalação', async t => {
  const f = fixture(t);
  const handlers = createLineageHandlers({ service: f.lineage, prefix: () => '#' });
  const sent = [], sock = { sendMessage: async (jid, content, options) => sent.push({ ...content, options }) };
  const ctx = (sender, args = [], mention) => ({ jid: CHAT, sender, args, pushName: 'Lobo', msg: { key: { id: f.id() }, message: mention ? { extendedTextMessage: { contextInfo: { mentionedJid: [mention] } } } : {} } });
  await handlers.adopt(sock, ctx(A, ['Luar']));
  assert.match(sent.at(-1).text, /FILHOTE ADOTADO/);
  assert.ok(sent.at(-1).text.includes('#alimentar') && !sent.at(-1).text.includes('!alimentar'));
  f.plant(B, 'kk aa dd gg ss');
  f.raw.prepare('UPDATE lineage_wolves SET born_at=? WHERE owner_jid=?').run(START - 6 * DAY, A);
  await handlers.dna(sock, ctx(A));
  assert.match(sent.at(-1).text, /DNA DE LUAR/);
  await handlers.dna(sock, ctx(A, [], B));
  assert.match(sent.at(-1).text, /PREVISÃO GENÉTICA/);
  await handlers.breed(sock, ctx(A, [], B));
  assert.match(sent.at(-1).text, /PEDIDO DE CRUZAMENTO/);
  assert.deepEqual(sent.at(-1).mentions, [B]);
  await handlers.breed(sock, ctx(B, ['aceitar']));
  assert.match(sent.at(-1).text, /NASCERAM FILHOTES/);
  assert.equal(sent.at(-1).mentions.length, 2);
  await handlers.den(sock, ctx(A));
  assert.match(sent.at(-1).text, /2\/6/);
  await handlers.family(sock, ctx(A, ['2']));
  assert.match(sent.at(-1).text, /Pais:/);
  await handlers.companion(sock, ctx(A));
  assert.match(sent.at(-1).text, /Filhotes:/);
  await handlers.care('alimentar')(sock, ctx(A));
  assert.match(sent.at(-1).text, /barriga cheia/);
  await handlers.breed(sock, ctx(A));
  assert.match(sent.at(-1).text, /#cruzar @pessoa/);
  await handlers.den(sock, ctx(A, ['voar']));
  assert.match(sent.at(-1).text, /#toca usar N/);
  const broken = createLineageHandlers({ service: { companion: () => { throw Error('SQLITE_IOERR interno'); } } });
  await broken.companion(sock, ctx(A));
  assert.ok(!sent.at(-1).text.includes('SQLITE_IOERR'));
  assert.ok(sent.every(item => item.options.quoted));
  assert.equal(age(2 * DAY), '2d');
  assert.equal(age(26 * HOUR), '1d 2h');
});

test('registro cria oito comandos na categoria linhagem sem colidir com o bot', () => {
  const registered = [];
  register(definition => registered.push(definition));
  assert.deepEqual(registered.map(item => item.name), ['adotar', 'companheiro', 'toca', 'alimentar', 'brincar', 'cruzar', 'genes', 'linhagem']);
  const interval = global.setInterval;
  global.setInterval = (...args) => interval(...args).unref();
  try { require('../src/handlers/commands').loadAllCommands(); } finally { global.setInterval = interval; }
  const registry = require('../src/core/commandRegistry').registry;
  for (const item of registered) assert.equal(registry.get(item.name).category, 'linhagem');
  assert.equal(registry.get('dna').name, 'genes');
  assert.equal(require('../src/menus/catalog').categoryOf(registry.get('linhagem')), 'linhagem');
});
