import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGame } from '../src/store.js';
import { createPlayer } from '../src/game/players.js';
import { ensureRP, ensureRPWorld } from '../src/rp/state.js';
import { createFamily, inviteFamily, proposeMarriage, respondFamilyInvite, leaveFamily,
  familyProfile, depositFamily, withdrawFamily, pruneFamilyInvites } from '../src/rp/family.js';

const FIRST = '5511999999999@s.whatsapp.net';
const SECOND = '5511888888888@s.whatsapp.net';
const THIRD = '5511777777777@s.whatsapp.net';
const FOURTH = '5511666666666@s.whatsapp.net';
const NOW = 1_700_000_000_000;

function fixture() {
  const game = defaultGame();
  ensureRPWorld(game);
  for (const jid of [FIRST, SECOND, THIRD, FOURTH]) {
    const player = createPlayer({ jid, name: 'Lobo' }, NOW);
    player.coins = 1_000;
    ensureRP(player, NOW);
    game.players[jid] = player;
  }
  return { game, first: game.players[FIRST], second: game.players[SECOND],
    third: game.players[THIRD], fourth: game.players[FOURTH] };
}

function addMember(game, leader, player, relation = 'parente', now = NOW) {
  const invite = inviteFamily(game, leader, player, relation, now);
  return respondFamilyInvite(game, player, invite.id, true, now + 1);
}

function totalMoney(game) {
  return Object.values(game.players).reduce((sum, player) => sum + player.coins, 0) +
    Object.values(game.rp.families).reduce((sum, family) => sum + family.coins, 0);
}

test('family creation charges its creator 200 WOK Coin, keeps clan state separate and normalizes name uniqueness', () => {
  const { game, first, second } = fixture();
  first.clan = 'clan-existing';
  const family = createFamily(game, first, 'Família   Lunar', NOW);
  assert.equal(first.coins, 800);
  assert.equal(first.rp.familyId, family.id);
  assert.equal(first.clan, 'clan-existing');
  assert.equal(family.name, 'Família Lunar');
  assert.equal(family.leader, FIRST);
  assert.deepEqual(family.members, [{ jid: FIRST, role: 'leader' }]);
  assert.throws(() => createFamily(game, second, 'FAMÍLIA LUNAR', NOW), { code: 'FAMILY_NAME' });
  assert.equal(second.coins, 1_000);
  assert.equal(second.rp.familyId, null);
  assert.throws(() => createFamily(game, first, 'Outra Família', NOW), { code: 'ALREADY_FAMILY' });
});

test('creating a family validates name and balance before debiting or changing membership', () => {
  const { game, first } = fixture();
  first.coins = 199;
  const before = structuredClone(first);
  assert.throws(() => createFamily(game, first, 'Luna', NOW), { code: 'BALANCE' });
  assert.deepEqual(first, before);
  assert.throws(() => createFamily(game, first, '<invalid>', NOW));
  assert.deepEqual(game.rp.families, {});
});

test('inviting requires consent and cannot mutate the target or spend a marriage ring', () => {
  const { game, first, second } = fixture();
  createFamily(game, first, 'Luna', NOW);
  const before = structuredClone(second);
  const invite = inviteFamily(game, first, second, 'filho', NOW);
  assert.deepEqual(second, before);
  assert.equal(invite.relation, 'filho');
  assert.equal(invite.expiresAt, NOW + 600_000);
  assert.equal(game.rp.families[first.rp.familyId].members.length, 1);
  assert.throws(() => inviteFamily(game, first, second, 'parente', NOW), { code: 'FAMILY_INVITE_CONFLICT' });
  const accepted = respondFamilyInvite(game, second, invite.id, true, NOW + 1);
  assert.equal(accepted.accepted, true);
  assert.equal(second.rp.familyId, first.rp.familyId);
  assert.equal(accepted.family.members[1].role, 'filho');
});

test('only the invite recipient can accept or reject; rejection never joins or debits either player', () => {
  const { game, first, second, third } = fixture();
  createFamily(game, first, 'Luna', NOW);
  const invite = inviteFamily(game, first, second, 'irmao', NOW);
  assert.throws(() => respondFamilyInvite(game, first, invite.id, true, NOW), { code: 'FAMILY_INVITE_TARGET' });
  assert.throws(() => respondFamilyInvite(game, third, invite.id, false, NOW), { code: 'FAMILY_INVITE_TARGET' });
  assert.ok(game.rp.invites[invite.id]);
  const before = structuredClone(second);
  assert.equal(respondFamilyInvite(game, second, invite.id, false, NOW + 1).accepted, false);
  assert.deepEqual(second, before);
  assert.equal(game.rp.invites[invite.id], undefined);
  assert.equal(first.coins, 800);
});

test('expired invitation cannot be accepted at its ten-minute boundary and pruning frees conflicting invites', () => {
  const { game, first, second } = fixture();
  createFamily(game, first, 'Luna', NOW);
  const invite = inviteFamily(game, first, second, 'parente', NOW);
  assert.throws(() => respondFamilyInvite(game, second, invite.id, true, NOW + 600_000), { code: 'FAMILY_INVITE_EXPIRED' });
  assert.equal(second.rp.familyId, null);
  pruneFamilyInvites(game, NOW + 600_000);
  assert.equal(game.rp.invites[invite.id], undefined);
  assert.ok(inviteFamily(game, first, second, 'parente', NOW + 600_000));
});

test('family invitations reject self, unknown relation, unstarted RP and already-joined targets', () => {
  const { game, first, second, third } = fixture();
  createFamily(game, first, 'Luna', NOW);
  assert.throws(() => inviteFamily(game, first, first, 'parente', NOW), { code: 'FAMILY_SELF' });
  assert.throws(() => inviteFamily(game, first, second, 'estranho', NOW), { code: 'FAMILY_RELATION' });
  delete second.rp;
  assert.throws(() => inviteFamily(game, first, second, 'parente', NOW), { code: 'RP_NOT_STARTED' });
  assert.equal(second.rp, undefined);
  createFamily(game, third, 'Outra', NOW);
  assert.throws(() => inviteFamily(game, first, third, 'parente', NOW), { code: 'ALREADY_FAMILY' });
  assert.deepEqual(game.rp.invites, {});
});

test('one pending invitation per target applies globally across different families', () => {
  const { game, first, second, third } = fixture();
  createFamily(game, first, 'Luna', NOW);
  createFamily(game, third, 'Aurora', NOW);
  inviteFamily(game, first, second, 'parente', NOW);
  assert.throws(() => inviteFamily(game, third, second, 'irmao', NOW), { code: 'FAMILY_INVITE_CONFLICT' });
});

test('marriage consumes one ring only after consent and creates reciprocal spouse relationships once', () => {
  const { game, first, second } = fixture();
  createFamily(game, first, 'Luna', NOW);
  first.rp.inventory.alianca = 2;
  const targetBefore = structuredClone(second);
  const proposal = proposeMarriage(game, first, second, NOW);
  assert.equal(first.rp.inventory.alianca, 2);
  assert.deepEqual(second, targetBefore);
  const accepted = respondFamilyInvite(game, second, proposal.id, true, NOW + 1);
  assert.equal(accepted.marriage, true);
  assert.equal(first.rp.inventory.alianca, 1);
  assert.deepEqual(first.rp.relationship, { spouse: SECOND, since: NOW + 1 });
  assert.deepEqual(second.rp.relationship, { spouse: FIRST, since: NOW + 1 });
  assert.equal(accepted.family.members[1].role, 'conjuge');
  assert.throws(() => respondFamilyInvite(game, second, proposal.id, true, NOW + 2), { code: 'FAMILY_INVITE' });
  assert.equal(first.rp.inventory.alianca, 1);
});

test('marriage revalidates ring stock and bans at acceptance without partially joining the target', () => {
  for (const blockedBy of ['ring', 'proposer-ban', 'recipient-ban']) {
    const { game, first, second } = fixture();
    createFamily(game, first, 'Luna', NOW);
    first.rp.inventory.alianca = 1;
    const invite = proposeMarriage(game, first, second, NOW);
    if (blockedBy === 'ring') first.rp.inventory.alianca = 0;
    else (blockedBy === 'proposer-ban' ? first : second).banned = true;
    assert.throws(() => respondFamilyInvite(game, second, invite.id, true, NOW + 1),
      { code: blockedBy === 'ring' ? 'MARRIAGE_RING' : 'BANNED' });
    assert.equal(second.rp.familyId, null);
    assert.equal(second.rp.relationship, null);
    assert.equal(first.rp.relationship, null);
    assert.equal(game.rp.families[first.rp.familyId].members.length, 1);
  }
});

test('marriage cannot be proposed without a family, a ring, leadership or while married', () => {
  const { game, first, second, third } = fixture();
  first.rp.inventory.alianca = 2;
  assert.throws(() => proposeMarriage(game, first, second, NOW), { code: 'NO_FAMILY' });
  createFamily(game, first, 'Luna', NOW);
  first.rp.inventory.alianca = 0;
  assert.throws(() => proposeMarriage(game, first, second, NOW), { code: 'MARRIAGE_RING' });
  first.rp.inventory.alianca = 2;
  const proposal = proposeMarriage(game, first, second, NOW);
  assert.throws(() => proposeMarriage(game, first, third, NOW), { code: 'FAMILY_INVITE_CONFLICT' });
  respondFamilyInvite(game, second, proposal.id, true, NOW + 1);
  assert.throws(() => proposeMarriage(game, first, third, NOW + 2), { code: 'ALREADY_MARRIED' });
  second.rp.inventory.alianca = 1;
  assert.throws(() => proposeMarriage(game, second, third, NOW + 2), { code: 'FAMILY_LEADER' });
});

test('leaving a family dissolves both sides of a marriage without permission from the spouse', () => {
  const { game, first, second } = fixture();
  createFamily(game, first, 'Luna', NOW);
  first.rp.inventory.alianca = 1;
  const proposal = proposeMarriage(game, first, second, NOW);
  respondFamilyInvite(game, second, proposal.id, true, NOW + 1);
  first.banned = true;
  const result = leaveFamily(game, second, NOW + 2);
  assert.equal(result.formerSpouse, FIRST);
  assert.equal(first.rp.relationship, null);
  assert.equal(second.rp.relationship, null);
  assert.equal(second.rp.familyId, null);
  assert.equal(result.closed, false);
  assert.equal(game.rp.families[first.rp.familyId].members.length, 1);
});

test('leadership passes to the earliest remaining member and a departing leader cannot leave stale invitations', () => {
  const { game, first, second, third, fourth } = fixture();
  const family = createFamily(game, first, 'Luna', NOW);
  addMember(game, first, third, 'irmao', NOW + 1);
  addMember(game, first, second, 'parente', NOW + 3);
  const pending = inviteFamily(game, first, fourth, 'parente', NOW + 5);
  const result = leaveFamily(game, first, NOW + 6);
  assert.equal(result.newLeader, THIRD);
  assert.equal(game.rp.families[family.id].leader, THIRD);
  assert.equal(game.rp.families[family.id].members[0].role, 'leader');
  assert.equal(game.rp.invites[pending.id], undefined);
  assert.equal(first.rp.familyId, null);
  assert.equal(familyProfile(game, second).leader, THIRD);
});

test('deposits and leader withdrawals conserve shared WOK Coin without copying balances', () => {
  const { game, first, second } = fixture();
  const family = createFamily(game, first, 'Luna', NOW);
  addMember(game, first, second);
  const total = totalMoney(game);
  const deposited = depositFamily(game, second, 250, NOW + 2);
  assert.equal(deposited.balance, 750);
  assert.equal(deposited.family.coins, 250);
  assert.equal(totalMoney(game), total);
  assert.throws(() => withdrawFamily(game, second, 10, NOW + 3), { code: 'FAMILY_LEADER' });
  assert.equal(game.rp.families[family.id].coins, 250);
  const withdrawn = withdrawFamily(game, first, 100, NOW + 3);
  assert.equal(withdrawn.balance, 900);
  assert.equal(game.rp.families[family.id].coins, 150);
  assert.equal(totalMoney(game), total);
});

test('invalid treasury amounts, balance failures and integer overflow never partially move money', () => {
  const { game, first, second } = fixture();
  const family = createFamily(game, first, 'Luna', NOW);
  addMember(game, first, second);
  for (const amount of [0, -1, 1.5, 'NaN', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => depositFamily(game, first, amount, NOW));
    assert.throws(() => withdrawFamily(game, first, amount, NOW));
  }
  assert.throws(() => depositFamily(game, first, 801, NOW), { code: 'BALANCE' });
  assert.equal(first.coins, 800);
  assert.throws(() => withdrawFamily(game, first, 1, NOW), { code: 'FAMILY_BALANCE' });
  game.rp.families[family.id].coins = Number.MAX_SAFE_INTEGER;
  assert.throws(() => depositFamily(game, first, 1, NOW));
  assert.equal(first.coins, 800);
  assert.equal(game.rp.families[family.id].coins, Number.MAX_SAFE_INTEGER);
});

test('the last family member receives the entire treasury and a second leave cannot repeat the refund', () => {
  const { game, first } = fixture();
  const family = createFamily(game, first, 'Luna', NOW);
  depositFamily(game, first, 300, NOW + 1);
  const total = totalMoney(game);
  const result = leaveFamily(game, first, NOW + 2);
  assert.equal(result.closed, true);
  assert.equal(result.refunded, 300);
  assert.equal(first.coins, 800);
  assert.equal(game.rp.families[family.id], undefined);
  assert.equal(first.rp.familyId, null);
  assert.equal(totalMoney(game), total);
  assert.throws(() => leaveFamily(game, first, NOW + 3), { code: 'NO_FAMILY' });
  assert.equal(first.coins, 800);
});

test('family profile is a detached snapshot and family history retains the latest 1000 records', () => {
  const { game, first } = fixture();
  const family = createFamily(game, first, 'Luna', NOW);
  const profile = familyProfile(game, first);
  profile.members[0].role = 'conjuge';
  profile.coins = 999;
  assert.equal(game.rp.families[family.id].members[0].role, 'leader');
  assert.equal(game.rp.families[family.id].coins, 0);
  for (let i = 0; i < 500; i++) {
    depositFamily(game, first, 1, NOW + i + 1);
    withdrawFamily(game, first, 1, NOW + i + 1);
  }
  assert.equal(game.rp.history.length, 1000);
  assert.equal(game.rp.history.at(-1).action, 'withdraw');
  assert.equal(game.rp.history.at(-1).system, 'family');
});
