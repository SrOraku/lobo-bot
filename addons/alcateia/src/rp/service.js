import { GameError, integer, quantity, canonicalPlayerJid } from '../game/validation.js';
import { registerPlayer, requirePlayer } from '../game/players.js';
import { transfer } from '../game/wallet.js';
import { ensureRP, ensureRPWorld } from './state.js';
import { JOBS, listJobs, getJob, chooseJob, work, performJobAction } from './jobs.js';
import { RP_ITEMS, buyRPItem, useRPItem } from './shop.js';
import { createFamily, inviteFamily, proposeMarriage, respondFamilyInvite, leaveFamily,
  familyProfile, depositFamily, withdrawFamily, pruneFamilyInvites } from './family.js';

function usage(args, count, text) {
  if (args.length !== count) throw new GameError(`Use ${text}.`);
}

function paginate(items, page = 1) {
  const totalPages = Math.max(1, Math.ceil(items.length / 10));
  const current = integer(page, { min: 1, max: totalPages, label: 'Página' });
  return { page: current, totalPages, selected: items.slice((current - 1) * 10, current * 10) };
}

export function dispatchRP(game, request, { now, rng }) {
  const world = ensureRPWorld(game);
  pruneFamilyInvites(game, now);
  const { command, actor } = request;
  const args = request.args || [];
  const argText = request.argText || '';
  if (command === 'rp' && (!args.length || args[0]?.toLowerCase() === 'menu')) {
    if (args.length > 1) throw new GameError('Use !rp menu.');
    return { type: 'rp-menu' };
  }
  if (command === 'rp' && args[0]?.toLowerCase() === 'iniciar') {
    usage(args, 1, '!rp iniciar');
    const player = Object.hasOwn(game.players, actor.jid) ? requirePlayer(game, actor.jid) : registerPlayer(game, actor, now);
    const already = !!player.rp;
    const rp = ensureRP(player, now);
    player.updatedAt = now;
    return { type: 'rp-registered', player, rp, already };
  }
  // Registered game bans apply across both games, including read-only catalog commands.
  const leaving = command === 'familia' && ['sair', 'divorciar'].includes(args[0]?.toLowerCase());
  const player = requirePlayer(game, actor.jid, { allowBanned: leaving });
  if (command === 'profissoes') {
    const categoryArgs = [...args];
    const page = /^\d+$/.test(categoryArgs.at(-1) || '') ? categoryArgs.pop() : 1;
    const category = categoryArgs.join(' ').trim();
    const jobs = category ? listJobs(category) : JOBS;
    if (!jobs.length) throw new GameError('Categoria não encontrada. Use !profissoes para ver o catálogo.');
    const paging = paginate(jobs, page);
    return { type: 'rp-jobs', jobs: paging.selected, page: paging.page, totalPages: paging.totalPages, category };
  }
  if (command === 'rploja') {
    if (args.length > 1) throw new GameError('Use !rploja [página].');
    const paging = paginate(RP_ITEMS, args[0] || 1);
    return { type: 'rp-shop', items: paging.selected, page: paging.page, totalPages: paging.totalPages };
  }
  if (command === 'carteira') {
    usage(args, 0, '!carteira');
    return { type: 'rp-wallet', player };
  }
  if (!player.rp) throw new GameError('Sua carteira já existe. Use !rp iniciar para criar o personagem sem perder seu saldo.');
  const rp = ensureRP(player, now);

  function targetPlayer({ rpRequired = false } = {}) {
    if (!request.target?.jid || (request.mentionCount !== undefined && request.mentionCount !== 1)) {
      throw new GameError('Mencione exatamente um jogador usando @ na mensagem.');
    }
    const target = requirePlayer(game, canonicalPlayerJid(request.target.jid));
    if (rpRequired && !target.rp) throw new GameError('O outro jogador precisa usar !rp iniciar primeiro.');
    return target;
  }

  let response;
  switch (command) {
    case 'rp': {
      usage(args, 1, '!rp perfil');
      if (args[0]?.toLowerCase() !== 'perfil') throw new GameError('Use !rp iniciar, !rp perfil ou !rp menu.');
      const family = rp.familyId ? familyProfile(game, player) : null;
      return { type: 'rp-profile', player, rp, job: rp.jobId ? getJob(rp.jobId) : null, family };
    }
    case 'profissao': {
      if (!argText.trim()) throw new GameError('Use !profissao ID. Consulte !profissoes para escolher sua carreira.');
      const chosen = chooseJob(player, argText.trim(), now);
      response = { type: 'rp-job', player, job: chosen.job || chosen };
      break;
    }
    case 'trabalhar': {
      usage(args, 0, '!trabalhar');
      const result = work(player, { now, rng });
      const description = { salary: 'Expediente concluído. Seu salário entrou na carteira compartilhada.',
        fine: 'A cena fictícia terminou em multa e prisão RP temporária.',
        'fictional-success': 'Cena RP concluída. A recompensa entrou na carteira compartilhada.' }[result.event];
      response = { type: 'rp-work', player, job: result.job,
        reward: { ...result, amount: result.coinChange, xp: result.experienceGain, description } };
      break;
    }
    case 'acao': {
      const mentions = request.mentionCount ?? (request.target ? 1 : 0);
      if (mentions > 1) throw new GameError('Escolha somente um alvo para a ação profissional.');
      if (mentions === 1 && !request.target) throw new GameError('Não consegui identificar o jogador mencionado.');
      usage(args, mentions, '!acao [@jogador]');
      const job = rp.jobId ? getJob(rp.jobId) : null;
      if (!job) throw new GameError('Escolha uma profissão com !profissao ID.');
      const target = request.target ? targetPlayer({ rpRequired: true }) : undefined;
      const result = performJobAction(player, job.roleActionName, target, { now, rng });
      response = { type: 'rp-action', player, job, result };
      break;
    }
    case 'transferir': {
      usage(args, 2, '!transferir @jogador quantidade');
      const target = targetPlayer();
      const amount = quantity(args.at(-1));
      transfer(player, target, amount);
      target.updatedAt = now;
      response = { type: 'rp-transfer', player, target, amount };
      break;
    }
    case 'rpcomprar': {
      if (args.length < 1 || args.length > 2) throw new GameError('Use !rpcomprar ITEM [quantidade].');
      const result = buyRPItem(player, args[0], args[1] ?? 1, { now });
      response = { type: 'rp-purchase', player, result };
      break;
    }
    case 'usar': {
      const mentions = request.mentionCount ?? (request.target ? 1 : 0);
      if (!args.length || mentions > 1) throw new GameError('Use !usar ITEM ou !usar presente @jogador.');
      if (mentions === 1 && !request.target) throw new GameError('Não consegui identificar o destinatário mencionado. Nenhum item foi usado.');
      usage(args, mentions + 1, '!usar ITEM [@jogador]');
      if (!request.target && args.length !== 1) throw new GameError('Use !usar ITEM. Para presentes, mencione o destinatário.');
      const target = request.target ? targetPlayer({ rpRequired: true }) : undefined;
      const result = useRPItem(player, args[0], { now, target });
      response = { type: 'rp-use', player, result };
      break;
    }
    case 'inventario':
      usage(args, 0, '!inventario');
      return { type: 'rp-inventory', player, rp };
    case 'familia': {
      const action = args[0]?.toLowerCase() || 'perfil';
      const name = argText.replace(/^\S+\s*/, '').trim();
      if (action === 'criar') {
        const family = createFamily(game, player, name, now);
        response = { type: 'rp-family', family };
      } else if (['convidar', 'casar'].includes(action)) {
        if (action === 'casar') usage(args, 2, '!familia casar @jogador');
        else if (args.length < 2 || args.length > 3) throw new GameError('Use !familia convidar @jogador [parente/filho/irmao].');
        const target = targetPlayer({ rpRequired: true });
        const relation = args.length === 3 ? args[2].toLowerCase() : 'parente';
        if (action === 'convidar' && !['parente', 'filho', 'irmao'].includes(relation)) {
          throw new GameError('Parentesco inválido. Use parente, filho ou irmao.');
        }
        const invite = action === 'casar' ? proposeMarriage(game, player, target, now) :
          inviteFamily(game, player, target, relation, now);
        response = { type: 'rp-invite', invite: { ...invite, type: invite.kind }, target, player };
      } else if (['aceitar', 'recusar'].includes(action)) {
        usage(args, 2, '!familia aceitar/recusar ID');
        response = { type: 'rp-family-response', ...respondFamilyInvite(game, player, args[1], action === 'aceitar', now) };
      } else if (['sair', 'divorciar'].includes(action)) {
        usage(args, 1, '!familia sair/divorciar');
        if (action === 'divorciar' && !rp.relationship?.spouse) throw new GameError('Você não tem um casamento RP para encerrar. Use !familia sair para sair da família.');
        response = { type: 'rp-family-left', ...leaveFamily(game, player, now) };
      } else if (['depositar', 'retirar'].includes(action)) {
        usage(args, 2, '!familia depositar/retirar quantidade');
        const result = action === 'depositar' ? depositFamily(game, player, quantity(args[1]), now) :
          withdrawFamily(game, player, quantity(args[1]), now);
        response = { type: 'rp-family-bank', ...result, player, action };
      } else if (action === 'perfil') {
        if (args.length > 1) throw new GameError('Use !familia perfil.');
        return { type: 'rp-family', family: familyProfile(game, player) };
      } else throw new GameError('Use !familia criar/convidar/casar/aceitar/recusar/perfil/sair/divorciar/depositar/retirar.');
      break;
    }
    default:
      throw new GameError('Comando RP desconhecido. Use !rp menu.');
  }
  player.updatedAt = now;
  rp.updatedAt = now;
  world.history.push({ system: 'rp', action: command, at: now, actor: player.jid,
    balance: player.coins, target: request.target?.jid || null });
  if (world.history.length > 1000) world.history.splice(0, world.history.length - 1000);
  return response;
}
