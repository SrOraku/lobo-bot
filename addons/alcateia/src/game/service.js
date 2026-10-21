import { randomUUID } from 'node:crypto';
import { COOLDOWNS, LIMITS } from './constants.js';
import { GameError, assertGameOwner, assertBalance, brazilianNumber, canonicalPlayerJid,
  integer, quantity, formatRemaining, validatePlayer } from './validation.js';
import { registerPlayer, requirePlayer, addWolves, trainPlayer, setFormation, rankPlayers } from './players.js';
import { SHOP_ITEMS, buyItem } from './shop.js';
import { createClan, joinClan, clanProfile } from './clans.js';
import { runEvent } from './events.js';
import { resolveBattle } from './battle.js';
import { consumeCommand } from './rate-limit.js';
import { isRPCommand } from '../rp/commands.js';
import { dispatchRP } from '../rp/service.js';
import { credit, debit } from './wallet.js';

function exactArgs(args, count, usage) {
  if (args.length !== count) throw new GameError(`Use ${usage}.`);
}

function safeAdd(value, delta, label = 'Saldo') {
  const next = value + delta;
  return integer(next, { label });
}

function ensureBattlePlayer(player, now) {
  if (player.hp <= 0) throw new GameError('Um dos jogadores está sem HP. Recupere HP no evento lunar ou com um administrador do jogo.', 'HP');
  if (player.lastBattle !== null && now - player.lastBattle < COOLDOWNS.battle) {
    throw new GameError(`${player.name}: aguarde ${formatRemaining(COOLDOWNS.battle - (now - player.lastBattle))} para outra batalha.`, 'COOLDOWN');
  }
}

function completeBattle(game, attacker, defender, request, now) {
  if (attacker.jid === defender.jid) throw new GameError('Você não pode atacar a si mesmo.');
  ensureBattlePlayer(attacker, now);
  ensureBattlePlayer(defender, now);
  const battle = { id: randomUUID(), chatId: request.chatId, mode: 'pvp',
    ...resolveBattle(attacker, defender, { now }) };
  battle.date = new Date(now).toISOString().slice(0, 10);
  battle.time = new Date(now).toISOString().slice(11, 23);
  for (const [player, side] of [[attacker, battle.attacker], [defender, battle.defender]]) {
    player.hp = side.hpAfter;
    player.coins = side.coinsAfter;
    const counter = { win: 'wins', loss: 'losses', draw: 'draws' }[side.outcome];
    player[counter] = safeAdd(player[counter], 1, counter);
    player.lastBattle = now;
    player.updatedAt = now;
    if (player.clan) {
      const clan = game.clans[player.clan];
      if (clan && clan.members.includes(player.jid)) {
        if (side.outcome === 'win') clan.wins = safeAdd(clan.wins, 1, 'Vitórias do clã');
        if (side.outcome === 'loss') clan.losses = safeAdd(clan.losses, 1, 'Derrotas do clã');
        clan.coins = safeAdd(clan.coins, Math.max(0, side.coinChange), 'Moedas do clã');
        clan.updatedAt = now;
      }
    }
    validatePlayer(player);
  }
  game.battles.push(battle);
  return { type: 'battle', battle };
}

export class GameService {
  constructor({ store, now = () => Date.now(), rng = Math.random }) { this.store = store; this.now = now; this.rng = rng; }

  async execute(request) {
    try {
      const jid = canonicalPlayerJid(request.actor?.jid);
      const now = integer(request.now ?? this.now(), { label: 'Data' });
      return await this.store.transactionGame(game => {
        const allowance = consumeCommand(game, jid, now);
        if (!allowance.allowed) return { type: 'rate-limit', ...allowance };
        // Keep the accepted anti-spam timestamp even if the action is rejected,
        // while discarding every partial action mutation on validation failure.
        const action = structuredClone(game);
        try {
          const response = this.dispatch(action, { ...request, actor: { ...request.actor, jid } }, now);
          for (const [key, value] of Object.entries(action)) game[key] = value;
          return response;
        } catch (error) {
          if (error instanceof GameError) return { type: 'error', message: error.message, code: error.code };
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof GameError) return { type: 'error', message: error.message, code: error.code };
      throw error;
    }
  }

  dispatch(game, request, now) {
    const { command, actor, chatId } = request;
    const args = request.args || [];
    const argText = request.argText || '';
    // Old invitations have no effect after duels were removed.
    game.duels = {};
    if (command === 'admin') return this.admin(game, request, now);
    if (isRPCommand(command, args)) return dispatchRP(game, request, { now, rng: this.rng });
    if (command === 'start') {
      exactArgs(args, 0, '!start');
      return { type: 'registered', player: registerPlayer(game, actor, now) };
    }
    const player = requirePlayer(game, actor.jid);
    function targetPlayer() {
      if (!request.target?.jid) throw new GameError('Mencione exatamente um jogador usando @ na mensagem.');
      return requirePlayer(game, canonicalPlayerJid(request.target.jid));
    }

    switch (command) {
      case 'perfil': {
        exactArgs(args, 0, '!perfil');
        const rank = rankPlayers(game).findIndex(entry => entry.jid === player.jid) + 1;
        return { type: 'profile', player, rank };
      }
      case 'treino':
        exactArgs(args, 0, '!treino');
        return { type: 'training', player, ...trainPlayer(player, { now, rng: this.rng }) };
      case 'formacao':
        exactArgs(args, 2, '!formacao A/D/C quantidade');
        setFormation(player, args[0], args[1], now);
        return { type: 'formation', player };
      case 'ataque': {
        const defender = targetPlayer();
        return completeBattle(game, player, defender, request, now);
      }
      case 'rank':
        exactArgs(args, 0, '!rank');
        return { type: 'ranking', players: rankPlayers(game).slice(0, 10) };
      case 'loja':
        exactArgs(args, 0, '!loja');
        return { type: 'shop', items: SHOP_ITEMS };
      case 'comprar':
        exactArgs(args, 1, '!comprar 1/2/3/4');
        return { type: 'purchase', player, ...buyItem(player, args[0], { now, rng: this.rng }) };
      case 'clan': {
        const subcommand = args[0]?.toLowerCase();
        const name = argText.replace(/^\S+\s*/, '');
        if (subcommand === 'criar') createClan(game, player, name, now);
        else if (subcommand === 'entrar') joinClan(game, player, name, now);
        else if (subcommand === 'perfil') exactArgs(args, 1, '!clan perfil');
        else throw new GameError('Use !clan criar nome, !clan entrar nome ou !clan perfil.');
        const clan = clanProfile(game, player);
        return { type: 'clan', clan, rank: clan.ranking };
      }
      case 'evento':
        exactArgs(args, 0, '!evento');
        return { type: 'event', player, reward: runEvent(player, { now, rng: this.rng }) };
      default:
        throw new GameError('Comando do jogo desconhecido.');
    }
  }

  admin(game, request, now) {
    assertGameOwner(request.actor.jid);
    const args = request.args || [];
    const action = args[0]?.toLowerCase();
    if (action === 'status') {
      exactArgs(args, 1, '!admin status');
      return { type: 'admin-status', stats: { players: Object.keys(game.players).length,
        battles: game.battles.length, clans: Object.keys(game.clans).length } };
    }
    if (action === 'backup') { exactArgs(args, 1, '!admin backup'); return { type: 'backup' }; }
    if (action === 'broadcast') {
      const message = (request.argText || '').replace(/^\S+\s*/, '').trim();
      if (!message || message.length > 2000) throw new GameError('Use !admin broadcast mensagem com até 2.000 caracteres.');
      return { type: 'broadcast', message, recipients: Object.values(game.players).filter(p => !p.banned).map(p => p.jid) };
    }
    const counts = { addmoedas: 3, removemoedas: 3, ban: 2, unban: 2, resetcooldown: 2, sethp: 3, addlobos: 3 };
    if (!Object.hasOwn(counts, action)) throw new GameError('Use !admin status/addmoedas/removemoedas/ban/unban/backup/broadcast/resetcooldown/sethp/addlobos.');
    exactArgs(args, counts[action], `!admin ${action} numero${counts[action] === 3 ? ' quantidade' : ''}`);
    const jid = `${brazilianNumber(args[1])}@s.whatsapp.net`;
    const player = requirePlayer(game, jid, { allowBanned: true });
    switch (action) {
      case 'addmoedas': credit(player, quantity(args[2])); break;
      case 'removemoedas': {
        const value = quantity(args[2]);
        assertBalance(player, value);
        debit(player, value);
        break;
      }
      case 'ban':
      case 'unban':
        player.banned = action === 'ban';
        if (player.banned) {
          for (const [id, invite] of Object.entries(game.rp?.invites || {})) {
            if (invite.from === jid || invite.to === jid) delete game.rp.invites[id];
          }
        }
        break;
      case 'resetcooldown':
        player.lastTraining = null; player.normalTrainingAt = null;
        player.lastBattle = null; player.lastEvent = null;
        if (player.rp) { player.rp.lastWork = null; player.rp.lastJobAction = null; player.rp.jailedUntil = null; }
        break;
      case 'sethp': player.hp = integer(args[2], { max: LIMITS.hp, label: 'HP' }); break;
      case 'addlobos': addWolves(player, quantity(args[2], LIMITS.wolves), this.rng, now); break;
    }
    player.updatedAt = now;
    validatePlayer(player);
    return { type: 'admin-updated', player, action };
  }
}
