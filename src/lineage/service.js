'use strict';

const { randomInt } = require('node:crypto');
const context = require('../isolation/context');
const genetics = require('./genetics');
const { canonicalPlayer } = require('../services/player-identity');

const { HOUR, DAY } = genetics;
const DEN_LIMIT = 6;
const ADOPTION_COOLDOWN = 7 * DAY;
const BREED_COOLDOWN = 3 * DAY;
const PROPOSAL_TTL = 10 * 60_000;
const CARE = Object.freeze({
  alimentar: Object.freeze({ column: 'fed_at', cooldown: 3 * HOUR, xp: 3 }),
  brincar: Object.freeze({ column: 'played_at', cooldown: 2 * HOUR, xp: 3 }),
});

function error(code, message, extra = {}) { return Object.assign(new Error(message), { code, ...extra }); }
function rawDatabase(db) { return db?.[Symbol.for('lobo.rawDatabase')] || db; }
function validName(value) {
  const name = String(value ?? '').normalize('NFC').replace(/[^\p{L}\p{N} '-]/gu, '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 16) throw error('LINEAGE_NAME', 'O nome precisa ter de 2 a 16 letras ou números.');
  return name;
}
function eventId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\x00-\x1f]/.test(value)) throw error('LINEAGE_EVENT', 'Ação sem identificador válido.');
  return value;
}
const hydrate = row => row && { ...row, genome: JSON.parse(row.genome) };
const describe = (wolf, at) => wolf && { ...wolf, traits: genetics.phenotype(wolf), condition: genetics.condition(wolf, at) };

// Used by the Living Forest inside its own transaction; `user` is already canonical.
function companionPerk(database, chat, user, kind, at) {
  const row = rawDatabase(database).prepare("SELECT * FROM lineage_wolves WHERE chat_jid=? AND owner_jid=? AND active=1 AND status='toca'").get(chat, user);
  if (!row) return null;
  const wolf = hydrate(row), traits = genetics.phenotype(wolf);
  if (traits.talent.action !== kind || !genetics.condition(wolf, at).talentActive) return null;
  return { name: wolf.name, size: traits.size.name, label: traits.talent.label, bonus: traits.talent.bonus };
}

function createLineage(api, { now = Date.now, random = () => randomInt(1_000_000) / 1_000_000, forest } = {}) {
  const db = rawDatabase(api.db);
  const timestamp = () => {
    const at = now();
    if (!Number.isSafeInteger(at) || at < 0) throw error('LINEAGE_TIME', 'Relógio da linhagem inválido.');
    return at;
  };
  const player = (chat, original, message = 'Não consegui identificar seu perfil. Tente novamente em instantes.') => {
    const id = canonicalPlayer(db, chat, original);
    if (!id) throw error('LINEAGE_IDENTITY', message);
    return id;
  };
  const get = (chat, id) => hydrate(db.prepare('SELECT * FROM lineage_wolves WHERE chat_jid=? AND id=?').get(chat, id));
  const den = (chat, owner) => db.prepare("SELECT * FROM lineage_wolves WHERE chat_jid=? AND owner_jid=? AND status='toca' ORDER BY id").all(chat, owner).map(hydrate);
  const active = (chat, owner) => hydrate(db.prepare("SELECT * FROM lineage_wolves WHERE chat_jid=? AND owner_jid=? AND status='toca' AND active=1").get(chat, owner));
  function pick(chat, owner, index) {
    if (index === undefined || index === null || index === '') {
      const wolf = active(chat, owner);
      if (!wolf) throw error('LINEAGE_NONE', 'Você ainda não tem um lobo. Adote um filhote com !adotar.');
      return wolf;
    }
    const position = Number(index), list = den(chat, owner);
    if (!Number.isSafeInteger(position) || position < 1 || position > list.length) throw error('LINEAGE_INDEX', `Escolha um lobo de 1 a ${Math.max(1, list.length)} da sua toca.`);
    return list[position - 1];
  }
  function claim(chat, user, actionId, kind, at) {
    const result = db.prepare('INSERT OR IGNORE INTO lineage_events(chat_jid,event_id,user_jid,kind,at) VALUES(?,?,?,?,?)').run(chat, eventId(actionId), user, kind, at);
    if (!result.changes) throw error('LINEAGE_DUPLICATE', 'Esta ação já foi processada; nada foi repetido.');
  }
  function kin(a, b) {
    const parents = wolf => [wolf.parent_a, wolf.parent_b].filter(value => value != null);
    return a.id === b.id || parents(a).includes(b.id) || parents(b).includes(a.id) || parents(a).some(id => parents(b).includes(id));
  }
  function checkPair(a, b, at) {
    for (const wolf of [a, b]) {
      if (!genetics.stage(wolf.born_at, at).canBreed) throw error('LINEAGE_YOUNG', `${wolf.name} ainda não é adulto; lobos se tornam adultos aos 5 dias.`);
      if (wolf.bred_at != null && wolf.bred_at + BREED_COOLDOWN > at) throw error('LINEAGE_BREED_COOLDOWN', `${wolf.name} teve filhotes há pouco tempo.`, { remaining: wolf.bred_at + BREED_COOLDOWN - at });
    }
    if (kin(a, b)) throw error('LINEAGE_KIN', 'Parentes próximos não podem cruzar. Busque sangue novo para a matilha.');
  }
  const insert = (chat, owner, name, born, generation, parents, at, isActive) => db.prepare(`INSERT INTO lineage_wolves(chat_jid,owner_jid,name,genome,mark,generation,parent_a,parent_b,born_at,fed_at,played_at,bond,bred_at,status,active)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,'toca',?)`).run(chat, owner, name, JSON.stringify(born.genome), born.mark, generation, parents[0], parents[1], at, at, at, parents[0] ? 15 : 10, isActive ? 1 : 0).lastInsertRowid;
  const scoped = (chat, run) => { const id = context.chatId(chat); return context.run(id, () => db.transaction(() => run(id))()); };

  function adopt(chat, original, name, actionId) {
    return scoped(chat, id => {
      const user = player(id, original), at = timestamp();
      const last = db.prepare("SELECT max(at) AS at FROM lineage_events WHERE chat_jid=? AND user_jid=? AND kind='adotar'").get(id, user).at;
      if (last != null && last + ADOPTION_COOLDOWN > at) throw error('LINEAGE_ADOPTION_COOLDOWN', 'Você adotou um filhote recentemente.', { remaining: last + ADOPTION_COOLDOWN - at });
      if (den(id, user).length >= DEN_LIMIT) throw error('LINEAGE_DEN_FULL', `Sua toca já tem ${DEN_LIMIT} lobos. Solte um com !toca soltar N.`);
      const label = name ? validName(name) : genetics.pickName(random);
      claim(id, user, actionId, 'adotar', at);
      const wolfId = insert(id, user, label, genetics.wild(random), 1, [null, null], at, !active(id, user));
      return describe(get(id, wolfId), at);
    });
  }

  function companion(chat, original, index) {
    const id = context.chatId(chat), user = player(id, original), at = timestamp(), wolf = pick(id, user, index);
    const parents = [wolf.parent_a, wolf.parent_b].map(parent => parent == null ? null : describe(get(id, parent), at));
    const children = db.prepare('SELECT count(*) AS n FROM lineage_wolves WHERE chat_jid=? AND (parent_a=? OR parent_b=?)').get(id, wolf.id, wolf.id).n;
    return { ...describe(wolf, at), parents, children };
  }

  function listDen(chat, original) {
    const id = context.chatId(chat), user = player(id, original), at = timestamp();
    return { wolves: den(id, user).map(wolf => describe(wolf, at)), limit: DEN_LIMIT };
  }

  function use(chat, original, index) {
    return scoped(chat, id => {
      const user = player(id, original), wolf = pick(id, user, index);
      db.prepare('UPDATE lineage_wolves SET active=0 WHERE chat_jid=? AND owner_jid=? AND active=1').run(id, user);
      db.prepare('UPDATE lineage_wolves SET active=1 WHERE id=?').run(wolf.id);
      db.prepare('DELETE FROM lineage_proposals WHERE chat_jid=? AND from_jid=?').run(id, user);
      return describe(get(id, wolf.id), timestamp());
    });
  }

  function rename(chat, original, index, name) {
    return scoped(chat, id => {
      const user = player(id, original), wolf = pick(id, user, index), label = validName(name);
      db.prepare('UPDATE lineage_wolves SET name=? WHERE id=?').run(label, wolf.id);
      return { previous: wolf.name, wolf: describe(get(id, wolf.id), timestamp()) };
    });
  }

  function release(chat, original, index, actionId) {
    return scoped(chat, id => {
      const user = player(id, original), at = timestamp(), wolf = pick(id, user, index);
      claim(id, user, actionId, 'soltar', at);
      db.prepare("UPDATE lineage_wolves SET status='livre',active=0 WHERE id=?").run(wolf.id);
      db.prepare('DELETE FROM lineage_proposals WHERE chat_jid=? AND from_jid=?').run(id, user);
      let promoted = null;
      if (wolf.active) {
        promoted = den(id, user)[0] || null;
        if (promoted) db.prepare('UPDATE lineage_wolves SET active=1 WHERE id=?').run(promoted.id);
      }
      const joined = (forest || require('../forest/service').createForest(api, { now })).welcome(id, wolf.name);
      return { wolf: describe(wolf, at), promoted: describe(promoted, at), joinedForest: joined };
    });
  }

  function care(chat, original, kind, actionId) {
    const spec = CARE[kind];
    if (!spec) throw error('LINEAGE_ACTION', 'Cuidado desconhecido.');
    return scoped(chat, id => {
      const user = player(id, original), at = timestamp(), wolf = pick(id, user);
      const ready = wolf[spec.column] + spec.cooldown;
      if (ready > at) throw error('LINEAGE_CARE_COOLDOWN', kind === 'alimentar' ? `${wolf.name} ainda está de barriga cheia.` : `${wolf.name} ainda está cansado de brincar.`, { remaining: ready - at, kind });
      claim(id, user, actionId, kind, at);
      const before = genetics.condition(wolf, at), traits = genetics.phenotype(wolf);
      const base = kind === 'alimentar' ? (before.hunger >= 50 ? 6 : 3) : (before.stage.id === 'filhote' ? 7 : 5);
      const gain = Math.round(base * traits.bondFactor), bond = Math.min(100, before.bond + gain);
      db.prepare(`UPDATE lineage_wolves SET bond=?,${spec.column}=? WHERE id=?`).run(bond, at, wolf.id);
      api.addXP(user, spec.xp);
      return { kind, gain, before, wolf: describe(get(id, wolf.id), at), xp: spec.xp };
    });
  }

  function propose(chat, original, target, actionId) {
    return scoped(chat, id => {
      const user = player(id, original), at = timestamp();
      const partner = player(id, target, 'Marque o dono do outro lobo: !cruzar @pessoa.');
      if (partner === user) throw error('LINEAGE_SELF', 'Escolha o lobo de outra pessoa; seus lobos já são da mesma toca.');
      const mine = pick(id, user), theirs = active(id, partner);
      if (!theirs) throw error('LINEAGE_PARTNER_NONE', 'Essa pessoa ainda não tem um lobo companheiro.');
      checkPair(mine, theirs, at);
      claim(id, user, actionId, 'propor', at);
      db.prepare(`INSERT INTO lineage_proposals(chat_jid,from_jid,to_jid,created_at,expires_at) VALUES(?,?,?,?,?)
        ON CONFLICT(chat_jid,from_jid) DO UPDATE SET to_jid=excluded.to_jid,created_at=excluded.created_at,expires_at=excluded.expires_at`).run(id, user, partner, at, at + PROPOSAL_TTL);
      return { mine: describe(mine, at), theirs: describe(theirs, at), partner, expiresAt: at + PROPOSAL_TTL, prediction: genetics.predict(mine, theirs) };
    });
  }

  function respond(chat, original, accept, actionId) {
    return scoped(chat, id => {
      const user = player(id, original), at = timestamp();
      const proposal = db.prepare('SELECT * FROM lineage_proposals WHERE chat_jid=? AND to_jid=? AND expires_at>? ORDER BY created_at DESC LIMIT 1').get(id, user, at);
      if (!proposal) throw error('LINEAGE_NO_PROPOSAL', 'Nenhum pedido de cruzamento esperando por você (pedidos valem 10 minutos).');
      claim(id, user, actionId, accept ? 'aceitar' : 'recusar', at);
      db.prepare('DELETE FROM lineage_proposals WHERE chat_jid=? AND from_jid=?').run(id, proposal.from_jid);
      if (!accept) return { accepted: false, from: proposal.from_jid };
      const theirs = active(id, proposal.from_jid), mine = active(id, user);
      if (!theirs || !mine) throw error('LINEAGE_NONE', 'Um dos lobos não está mais na toca como companheiro.');
      checkPair(theirs, mine, at);
      for (const owner of [proposal.from_jid, user]) if (den(id, owner).length >= DEN_LIMIT) throw error('LINEAGE_DEN_FULL', `Uma das tocas já tem ${DEN_LIMIT} lobos. Solte um com !toca soltar N.`);
      const generation = Math.max(theirs.generation, mine.generation) + 1;
      const cubs = [proposal.from_jid, user].map(owner => {
        const wolfId = insert(id, owner, genetics.pickName(random), genetics.inherit(theirs, mine, random), generation, [theirs.id, mine.id], at, false);
        return describe(get(id, wolfId), at);
      });
      db.prepare('UPDATE lineage_wolves SET bred_at=? WHERE id IN (?,?)').run(at, theirs.id, mine.id);
      return { accepted: true, from: proposal.from_jid, parents: [describe(theirs, at), describe(mine, at)], cubs };
    });
  }

  function genes(chat, original, index) {
    const id = context.chatId(chat);
    return describe(pick(id, player(id, original), index), timestamp());
  }

  function predictWith(chat, original, target) {
    const id = context.chatId(chat), at = timestamp();
    const mine = pick(id, player(id, original)), partner = player(id, target, 'Marque o dono do outro lobo.');
    const theirs = active(id, partner);
    if (!theirs) throw error('LINEAGE_PARTNER_NONE', 'Essa pessoa ainda não tem um lobo companheiro.');
    return { mine: describe(mine, at), theirs: describe(theirs, at), prediction: genetics.predict(mine, theirs), kin: kin(mine, theirs) };
  }

  function tree(chat, original, index) {
    const id = context.chatId(chat), at = timestamp(), wolf = pick(id, player(id, original), index);
    const parentsOf = item => [item.parent_a, item.parent_b].map(parent => parent == null ? null : describe(get(id, parent), at));
    const parents = parentsOf(wolf);
    const children = db.prepare('SELECT * FROM lineage_wolves WHERE chat_jid=? AND (parent_a=? OR parent_b=?) ORDER BY id LIMIT 8').all(id, wolf.id, wolf.id).map(row => describe(hydrate(row), at));
    return { wolf: describe(wolf, at), parents, grandparents: parents.map(parent => parent ? parentsOf(parent) : null), children };
  }

  return { adopt, companion, listDen, use, rename, release, care, propose, respond, genes, predictWith, tree };
}

module.exports = { createLineage, companionPerk, DEN_LIMIT, ADOPTION_COOLDOWN, BREED_COOLDOWN, PROPOSAL_TTL };
