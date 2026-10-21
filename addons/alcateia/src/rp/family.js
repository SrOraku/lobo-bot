import { randomUUID } from 'node:crypto';
import { GameError, canonicalPlayerJid, integer, normalizeClanName, quantity } from '../game/validation.js';
import { requirePlayer } from '../game/players.js';
import { credit, debit } from '../game/wallet.js';
import { ensureRP, ensureRPWorld } from './state.js';

const INVITE_DURATION = 10 * 60_000;
const FAMILY_COST = 200;
const RELATIONS = new Set(['parente', 'filho', 'irmao']);
const HISTORY_LIMIT = 1_000;

function state(game) {
  return ensureRPWorld(game);
}

function timestamp(now) {
  return integer(now, { max: Number.MAX_SAFE_INTEGER - INVITE_DURATION, label: 'Data' });
}

function playerOf(game, candidate, { initialize = true, allowBanned = false } = {}) {
  const player = requirePlayer(game, canonicalPlayerJid(candidate?.jid), { allowBanned });
  if (!player.rp) throw new GameError('Os participantes precisam iniciar o RP com !rp iniciar.', 'RP_NOT_STARTED');
  if (initialize) ensureRP(player);
  return player;
}

function touch(player, now) {
  player.updatedAt = now;
  if (player.rp) player.rp.updatedAt = now;
}

function record(game, action, familyId, actor, now, details = {}) {
  const history = state(game).history;
  history.push({ id: randomUUID(), system: 'family', action, familyId, actor, at: now, ...details });
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
}

function familyOf(game, player) {
  const families = state(game).families;
  const id = player.rp.familyId;
  const family = id && Object.hasOwn(families, id) ? families[id] : null;
  if (!family || !family.members.some(member => member.jid === player.jid)) {
    throw new GameError('Você ainda não faz parte de uma família RP.', 'NO_FAMILY');
  }
  return family;
}

function noFamily(game, player) {
  if (player.rp.familyId || Object.values(state(game).families)
    .some(family => family.members.some(member => member.jid === player.jid))) {
    throw new GameError('Cada jogador só pode participar de uma família RP.', 'ALREADY_FAMILY');
  }
}

function leader(family, player) {
  if (family.leader !== player.jid) throw new GameError('Somente a liderança da família pode fazer isso.', 'FAMILY_LEADER');
}

function snapshot(family) {
  return { ...family, members: family.members.map(member => ({ ...member })) };
}

export function pruneFamilyInvites(game, now = Date.now()) {
  timestamp(now);
  const invites = state(game).invites;
  for (const [id, invite] of Object.entries(invites)) {
    if (!invite || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= now) delete invites[id];
  }
}

export function createFamily(game, candidate, rawName, now = Date.now()) {
  timestamp(now);
  const player = playerOf(game, candidate);
  const { key, name } = normalizeClanName(rawName);
  const rp = state(game);
  noFamily(game, player);
  if (Object.values(rp.families).some(family => family.key === key)) {
    throw new GameError('Já existe uma família RP com esse nome.', 'FAMILY_NAME');
  }
  const family = {
    id: randomUUID(), name, key, leader: player.jid,
    members: [{ jid: player.jid, role: 'leader' }], coins: 0, createdAt: now, updatedAt: now,
  };
  debit(player, FAMILY_COST);
  rp.families[family.id] = family;
  player.rp.familyId = family.id;
  touch(player, now);
  record(game, 'create', family.id, player.jid, now, { cost: FAMILY_COST });
  return snapshot(family);
}

function buildInvite(game, candidate, targetCandidate, relation, kind, now) {
  timestamp(now);
  const player = playerOf(game, candidate);
  const target = playerOf(game, targetCandidate, { initialize: false });
  if (player.jid === target.jid) throw new GameError('Você não pode convidar a si mesmo.', 'FAMILY_SELF');
  const family = familyOf(game, player);
  leader(family, player);
  noFamily(game, target);
  if (kind === 'marriage') {
    if (player.rp.relationship?.spouse || target.rp.relationship?.spouse) {
      throw new GameError('Um dos participantes já possui cônjuge RP.', 'ALREADY_MARRIED');
    }
    if (!Number.isSafeInteger(player.rp.inventory?.alianca) || player.rp.inventory.alianca < 1) {
      throw new GameError('Você precisa de uma aliança no inventário para propor casamento RP.', 'MARRIAGE_RING');
    }
  }
  pruneFamilyInvites(game, now);
  const pending = Object.values(state(game).invites);
  if (pending.some(invite => invite.to === target.jid) ||
      (kind === 'marriage' && pending.some(invite => invite.kind === 'marriage' &&
        (invite.from === player.jid || invite.to === player.jid)))) {
    throw new GameError('Um dos participantes já tem um convite RP conflitante. Aguarde a resposta ou a expiração.', 'FAMILY_INVITE_CONFLICT');
  }
  const invite = {
    id: randomUUID(), familyId: family.id, from: player.jid, to: target.jid,
    kind, relation, createdAt: now, expiresAt: now + INVITE_DURATION,
  };
  state(game).invites[invite.id] = invite;
  record(game, 'invite', family.id, player.jid, now, { target: target.jid, inviteId: invite.id, relation });
  return { ...invite };
}

export function inviteFamily(game, player, target, relation = 'parente', now = Date.now()) {
  if (!RELATIONS.has(relation)) throw new GameError('Use a relação RP parente, filho ou irmao.', 'FAMILY_RELATION');
  return buildInvite(game, player, target, relation, 'member', now);
}

// Marriage requires an existing family led by the proposer. The recipient must
// be free to join it; proposing never spends the ring or changes the recipient.
export function proposeMarriage(game, player, target, now = Date.now()) {
  return buildInvite(game, player, target, 'conjuge', 'marriage', now);
}

export function respondFamilyInvite(game, candidate, id, accept, now = Date.now()) {
  timestamp(now);
  if (typeof accept !== 'boolean') throw new GameError('Resposta inválida para o convite RP.');
  const player = playerOf(game, candidate);
  const invites = state(game).invites;
  if (typeof id !== 'string' || !Object.hasOwn(invites, id)) {
    throw new GameError('Convite RP não encontrado. Confira o ID recebido.', 'FAMILY_INVITE');
  }
  const invite = invites[id];
  if (invite.to !== player.jid) throw new GameError('Somente o jogador convidado pode responder.', 'FAMILY_INVITE_TARGET');
  if (invite.expiresAt <= now) throw new GameError('Esse convite RP expirou. Peça um novo convite.', 'FAMILY_INVITE_EXPIRED');
  if (!accept) {
    delete invites[id];
    record(game, 'decline', invite.familyId, player.jid, now, { inviteId: id, target: invite.from });
    return { accepted: false, invite: { ...invite } };
  }
  const proposer = playerOf(game, { jid: invite.from });
  const family = familyOf(game, proposer);
  if (family.id !== invite.familyId) throw new GameError('A família desse convite não está mais disponível.', 'FAMILY_INVITE');
  leader(family, proposer);
  noFamily(game, player);
  const marriage = invite.kind === 'marriage';
  if (marriage) {
    if (proposer.rp.relationship?.spouse || player.rp.relationship?.spouse) {
      throw new GameError('Um dos participantes já possui cônjuge RP.', 'ALREADY_MARRIED');
    }
    if (!Number.isSafeInteger(proposer.rp.inventory?.alianca) || proposer.rp.inventory.alianca < 1) {
      throw new GameError('A aliança da proposta não está mais no inventário.', 'MARRIAGE_RING');
    }
  } else if (!RELATIONS.has(invite.relation)) throw new GameError('A relação desse convite RP é inválida.', 'FAMILY_RELATION');
  if (marriage) {
    proposer.rp.inventory.alianca--;
    proposer.rp.relationship = { spouse: player.jid, since: now };
    player.rp.relationship = { spouse: proposer.jid, since: now };
    touch(proposer, now);
  }
  family.members.push({ jid: player.jid, role: marriage ? 'conjuge' : invite.relation });
  family.updatedAt = now;
  player.rp.familyId = family.id;
  touch(player, now);
  delete invites[id];
  record(game, marriage ? 'marriage' : 'join', family.id, player.jid, now, { target: proposer.jid, inviteId: id });
  return { accepted: true, invite: { ...invite }, family: snapshot(family), marriage };
}

export function familyProfile(game, candidate) {
  const player = playerOf(game, candidate);
  return snapshot(familyOf(game, player));
}

export function leaveFamily(game, candidate, now = Date.now()) {
  timestamp(now);
  const player = playerOf(game, candidate, { allowBanned: true });
  const family = familyOf(game, player);
  const remaining = family.members.filter(member => member.jid !== player.jid);
  const refunded = remaining.length ? 0 : integer(family.coins, { label: 'Tesouro da família' });
  integer(player.coins + refunded, { label: 'Saldo após encerrar família' });
  const formerSpouse = player.rp.relationship?.spouse || null;
  if (refunded) credit(player, refunded);
  player.rp.relationship = null;
  if (formerSpouse && Object.hasOwn(game.players, formerSpouse)) {
    const spouse = game.players[formerSpouse];
    if (spouse.rp?.relationship?.spouse === player.jid) {
      spouse.rp.relationship = null;
      touch(spouse, now);
    }
  }
  player.rp.familyId = null;
  touch(player, now);
  let newLeader = null;
  if (!remaining.length) delete state(game).families[family.id];
  else {
    family.members = remaining;
    if (formerSpouse) {
      const formerMember = remaining.find(member => member.jid === formerSpouse);
      if (formerMember?.role === 'conjuge') formerMember.role = 'parente';
    }
    if (family.leader === player.jid) {
      // Insertion order preserves the earliest remaining member deterministically.
      family.leader = remaining[0].jid;
      remaining[0].role = 'leader';
    }
    newLeader = family.leader;
    family.updatedAt = now;
  }
  for (const [id, invite] of Object.entries(state(game).invites)) {
    if (invite.from === player.jid || invite.to === player.jid || (!remaining.length && invite.familyId === family.id)) {
      delete state(game).invites[id];
    }
  }
  record(game, 'leave', family.id, player.jid, now, { formerSpouse, refunded, newLeader });
  return { familyId: family.id, familyName: family.name, closed: !remaining.length, newLeader, refunded, formerSpouse };
}

export function depositFamily(game, candidate, rawAmount, now = Date.now()) {
  timestamp(now);
  const player = playerOf(game, candidate);
  const family = familyOf(game, player);
  const amount = quantity(rawAmount);
  const balance = integer(family.coins + amount, { label: 'Tesouro da família' });
  debit(player, amount);
  family.coins = balance;
  family.updatedAt = now;
  touch(player, now);
  record(game, 'deposit', family.id, player.jid, now, { amount });
  return { family: snapshot(family), amount, balance: player.coins };
}

export function withdrawFamily(game, candidate, rawAmount, now = Date.now()) {
  timestamp(now);
  const player = playerOf(game, candidate);
  const family = familyOf(game, player);
  leader(family, player);
  const amount = quantity(rawAmount);
  const current = integer(family.coins, { label: 'Tesouro da família' });
  if (current < amount) throw new GameError('O tesouro da família não tem WOKCoin suficiente.', 'FAMILY_BALANCE');
  integer(player.coins + amount, { label: 'Saldo após retirada' });
  credit(player, amount);
  family.coins = current - amount;
  family.updatedAt = now;
  touch(player, now);
  record(game, 'withdraw', family.id, player.jid, now, { amount });
  return { family: snapshot(family), amount, balance: player.coins };
}
