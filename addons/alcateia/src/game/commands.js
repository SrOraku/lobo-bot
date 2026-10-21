import path from 'node:path';
import { contextOf } from '../messages.js';
import { DEV_SIGNATURE, header } from './constants.js';
import { generateBattleMessage } from './battle.js';
import { isRPCommand, rpMenu, handleRPResponse } from '../rp/commands.js';
import { formatMenu } from '../menu-style.js';

const COMMANDS = new Set([
  'start', 'perfil', 'treino', 'formacao', 'ataque', 'rank', 'loja', 'comprar',
  'clan', 'evento', 'admin',
]);
const BOOST_NAMES = { attack: 'Ataque', defense: 'Defesa', counter: 'Contra-ataque' };
const ADMIN_ACTIONS = {
  addmoedas: 'Moedas adicionadas', removemoedas: 'Moedas removidas', ban: 'Banimento aplicado ao jogo',
  unban: 'Banimento do jogo removido', resetcooldown: 'Cooldowns do jogo reiniciados',
  sethp: 'HP atualizado', addlobos: 'Lobisomens adicionados',
};

function line(value, fallback = 'nenhum') {
  return String(value ?? fallback).replace(/[\r\n]+/g, ' ').slice(0, 100);
}

function frame(title, lines) { return `${header(title)}\n${lines.join('\n')}\n${DEV_SIGNATURE}`; }

function duration(milliseconds) {
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}min`;
}

function date(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'nunca';
  return `${new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })} UTC`;
}

function boostLabel(boost, at) {
  return `${BOOST_NAMES[boost.type] || line(boost.type)} +${Math.round(boost.value * 100)}% (${duration(boost.expiresAt - at)})`;
}

function profileText(player, rank, at) {
  const boosts = (player.boosts || []).filter(boost => boost.activatedAt <= at && boost.expiresAt > at)
    .map(boost => boostLabel(boost, at));
  return frame('PERFIL DA ALCATEIA', [
    `🐺 Nome: ${line(player.name, 'Lobo')}`,
    `📱 Número: +${line(player.number)}`,
    `💎 HP: ${player.hp}/100 • 🐺 Lobisomens: ${player.wolves}/100`,
    `🗡️ Ataque: ${player.attack}/40 • 🛡️ Defesa: ${player.defense}/40`,
    `⚡ Contra-ataque: ${player.counter}/20`,
    `💰 WOK Coin: ${player.coins} • 🏆 Ranking: ${rank || 'fora do ranking'}`,
    `⚔️ Vitórias: ${player.wins} • Derrotas: ${player.losses} • Empates: ${player.draws}`,
    `🌹 Clã: ${line(player.clan || 'nenhum')}`,
    `⭐ Boosts ativos: ${boosts.length ? boosts.join(' | ') : 'nenhum'}`,
    `🐺 Treinos extras: ${player.extraTraining || 0}`,
    `⏳ Último treino: ${date(player.lastTraining)}`,
    `⚔️ Última batalha: ${date(player.lastBattle)}`,
  ]);
}

export function gameMenu(config) {
  const p = config.prefix;
  const game = formatMenu({ title: 'MENU DA ALCATEIA', botName: config.botName, botDescription: config.botDescription,
    ownerNumber: config.ownerNumber, subtitle: [
    '🌹100 LOBISOMENS ESTRATÉGIA🌹', '⚔️ Treine • lute • conquiste 🐺',
  ], signature: DEV_SIGNATURE, sections: [
    { title: '🐺 JORNADA DO LOBO', lines: [
      `🌙 ${p}start — entrar na alcateia`, `👤 ${p}perfil — ficha e progresso`, `💪 ${p}treino — fortalecer a matilha`,
      `🧠 ${p}formacao A/D/C qtd — estratégia`, `⚔️ ${p}ataque @user — batalha PVP`, `🏆 ${p}rank — top 10 jogadores`,
    ] },
    { title: '💰 TESOURO WOK COIN', lines: [
      `🛍️ ${p}loja — itens e boosts`, `💳 ${p}comprar 1/2/3/4 — adquirir item`, `🌕 ${p}evento — recompensa lunar`,
      '💎 Uma carteira para lobisomens e RP.',
    ] },
    { title: '🏰 CLÃS E LIDERANÇA', lines: [
      `🌹 ${p}clan criar/entrar/perfil`, `👑 ${p}admin status — painel do jogo`,
      '🐾 Estratégia, honra e força da alcateia.',
    ] },
  ] });
  return `${game}\n\n${rpMenu(config)}`;
}

function shopText(items, config) {
  return formatMenu({ title: 'LOJA DA ALCATEIA', botName: config.botName, botDescription: config.botDescription,
    ownerNumber: config.ownerNumber,
    subtitle: '💰 Tesouros e vantagens de batalha', signature: DEV_SIGNATURE,
    sections: [{ title: '🛍️ ARSENAL LUNAR', lines: items.map(item => {
    const effect = item.type === 'training' ? 'um treino extra imediato' :
      `${BOOST_NAMES[item.type] || line(item.type)} +${Math.round(item.value * 100)}% por 1 hora`;
    return `💎 ${item.id}. ${line(item.name)}\n💰 ${item.price} WOK Coin\n⭐ ${effect}`;
  }) }, { title: '💳 ORDEM DE COMPRA', lines: [`💰 Compre com ${config.prefix}comprar 1/2/3/4.`] }] });
}

function rankingText(players) {
  return frame('RANKING DA ALCATEIA', players.length ? players.slice(0, 10).map((player, index) =>
    `${index + 1}. 🐺 ${line(player.name, 'Lobo')} • 🏆 ${player.wins} • 💰 ${player.coins} • 🐺 ${player.wolves} • D ${player.losses}`) :
    ['🐺 Ainda não há jogadores no ranking.']);
}

function eventText(reward) {
  const text = reward.type === 'coins' ? `💰 Recompensa: ${reward.amount} WOK Coin` :
    reward.type === 'wolves' ? `🐺 Recompensa: ${reward.added ?? reward.amount} lobisomens` :
      reward.type === 'hp' ? `💎 Recompensa: +${reward.amount} HP` :
        reward.type === 'boost' ? `⭐ Recompensa: ${BOOST_NAMES[reward.boost?.type] || 'boost'} +${Math.round((reward.boost?.value || 0) * 100)}% por 1 hora` :
          '🌕 Hoje a lua não deixou uma recompensa.';
  return frame('EVENTO LUNAR', ['🌕 A lua brilhou para você.', text, '🐺 A alcateia segue em frente.', '⏳ Volte amanhã.']);
}

export function isGameCommand(command, args = []) {
  const name = String(command || '').toLowerCase();
  return COMMANDS.has(name) || isRPCommand(name, args);
}

async function combatTarget(ctx) {
  const mentions = contextOf(ctx.msg).mentionedJid;
  if (!Array.isArray(mentions) || mentions.length !== 1 || typeof mentions[0] !== 'string') return null;
  const member = typeof ctx.resolveMember === 'function' ? await ctx.resolveMember(mentions[0]) :
    await ctx.resolveTarget({ allowOutsideGroup: true });
  if (!member) return null;
  return { jid: member.phoneNumber || member.jid, name: member.name };
}

export function createGameCommandHandler({ service, backupManager, logger = console,
  now = () => Date.now(), sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  let broadcastTail = Promise.resolve();
  let pendingBroadcasts = 0;

  function reserveBroadcast(send) {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const position = ++pendingBroadcasts;
    const job = broadcastTail.catch(() => {}).then(async () => {
      if (await gate) await send();
    }).finally(() => { pendingBroadcasts--; });
    // Keep later notices available even if one notice or its final reply fails.
    broadcastTail = job.catch(() => {});
    return { position, run: () => { release(true); return job; }, cancel: () => release(false) };
  }

  return async function handleGameCommand(ctx) {
    const command = String(ctx.command || '').toLowerCase();
    const args = ctx.args || (ctx.argText?.trim() ? ctx.argText.trim().split(/\s+/) : []);
    if (!isGameCommand(command, args)) return false;
    const started = now();
    try {
      const target = ['ataque', 'acao', 'familia', 'transferir', 'usar'].includes(command) ? await combatTarget(ctx) : null;
      const actorJid = ctx.senderPhone || ctx.sender;
      const actor = { jid: actorJid, name: ctx.displayName,
        number: ctx.senderPhone?.endsWith('@s.whatsapp.net') ? ctx.senderPhone.split('@')[0] : null };
      const result = await service.execute({ command, args, argText: ctx.argText || '',
        actor, target, mentionCount: contextOf(ctx.msg).mentionedJid?.length || 0,
        chatId: ctx.chatId, isGroup: ctx.isGroup, now: started });
      const at = now();
      const prefix = ctx.config.prefix;

      switch (result.type) {
        case 'registered':
          await ctx.reply(frame('BEM-VINDO À ALCATEIA', [
            '🐺 Registro concluído, lobo.', '💎 HP: 100', '🐺 Lobisomens: 20/100',
            '💰 WOK Coin: 100', '⚔️ Prepare sua estratégia.',
          ]));
          break;
        case 'profile':
          await ctx.reply(profileText(result.player, result.rank, at));
          break;
        case 'training':
          await ctx.reply(frame('TREINO DA ALCATEIA', [
            `🐺 +${result.added} lobisomens • Total: ${result.player.wolves}/100`,
            `🗡️ ${result.player.attack}/40 • 🛡️ ${result.player.defense}/40 • ⚡ ${result.player.counter}/20`,
            result.usedExtra ? '⭐ Treino extra utilizado.' : '⏳ Próximo treino normal em 1 hora.',
          ]));
          break;
        case 'formation': {
          const p = result.player;
          await ctx.reply(frame('FORMAÇÃO ALTERADA', [
            `🗡️ Ataque: ${p.attack}/40`, `🛡️ Defesa: ${p.defense}/40`, `⚡ Contra: ${p.counter}/20`,
            `🐺 Total usado: ${p.attack + p.defense + p.counter}/${p.wolves}`, '⚔️ Estratégia atualizada.',
          ]));
          break;
        }
        case 'battle':
          await ctx.reply(generateBattleMessage(result.battle));
          break;
        case 'ranking':
          await ctx.reply(rankingText(result.players));
          break;
        case 'shop':
          await ctx.reply(shopText(result.items, ctx.config));
          break;
        case 'purchase':
          await ctx.reply(frame('COMPRA CONCLUÍDA', [
            `⭐ ${line(result.item.name)} adquirido.`, `💰 Saldo: ${result.player.coins} WOK Coin`,
            result.item.type === 'training' ? `🐺 Use ${prefix}treino para consumir um treino extra durante o cooldown.` :
              `⏳ Boost ativo por 1 hora: ${BOOST_NAMES[result.boost?.type || result.item.type]} +${Math.round((result.boost?.value ?? result.item.value) * 100)}%.`,
          ]));
          break;
        case 'clan':
          await ctx.reply(frame('CLÃ DA ALCATEIA', [
            `🌹 Nome: ${line(result.clan.name)}`, `👑 Líder: +${result.clan.leader.split('@')[0]}`,
            `🐺 Membros: ${result.clan.members.length}`, `🏆 Vitórias: ${result.clan.wins} • Derrotas: ${result.clan.losses}`,
            `💰 Pontuação WOK Coin: ${result.clan.coins} • ⭐ Ranking: ${result.rank ?? result.clan.ranking ?? '—'}`,
          ]));
          break;
        case 'event':
          await ctx.reply(eventText(result.reward));
          break;
        case 'admin-status': {
          const uptime = Math.max(0, at - ctx.startedAt);
          await ctx.reply(frame('STATUS DA ALCATEIA', [
            '🐺 Bot online', `⏳ Tempo ligado: ${Math.floor(uptime / 3_600_000)}h ${Math.floor((uptime % 3_600_000) / 60_000)}min`,
            `🐺 Jogadores: ${result.stats.players} • ⚔️ Batalhas: ${result.stats.battles} • 🌹 Clãs: ${result.stats.clans}`,
            `💎 Memória utilizada: ${(process.memoryUsage().rss / 1_048_576).toFixed(1)} MB`,
            `⚡ Ping interno: ${Math.max(0, at - started)} ms`,
          ]));
          break;
        }
        case 'admin-updated':
          await ctx.reply(frame('ADMINISTRAÇÃO DO JOGO', [
            `👑 ${ADMIN_ACTIONS[result.action] || 'Jogador atualizado'}.`,
            `🐺 ${line(result.player.name, 'Lobo')} • +${result.player.number}`,
            `💎 HP: ${result.player.hp}/100 • 🐺 Lobisomens: ${result.player.wolves}/100 • 💰 WOK Coin: ${result.player.coins}`,
          ]));
          break;
        case 'backup':
          try {
            const file = await backupManager.create();
            await ctx.reply(frame('BACKUP DA ALCATEIA', [`💎 Backup salvo: ${path.basename(file)}`]));
          } catch (error) {
            logger.warn({ error: error.message }, 'Falha ao criar backup manual do jogo.');
            await ctx.reply(frame('BACKUP DA ALCATEIA', ['🐺 Não consegui criar o backup. O bot continua online; tente novamente.']));
          }
          break;
        case 'broadcast': {
          const recipients = [...new Set(result.recipients)].filter(jid => /^55\d{10,11}@s\.whatsapp\.net$/.test(jid));
          const job = reserveBroadcast(async () => {
            let sent = 0;
            let failed = 0;
            for (let index = 0; index < recipients.length; index++) {
              if (index) await sleep(1000);
              try {
                await ctx.sock.sendMessage(recipients[index], { text: frame('AVISO DA ALCATEIA', [result.message]) });
                sent++;
              } catch (error) {
                failed++;
                logger.warn({ error: error.message }, 'Falha no envio de um aviso do jogo.');
              }
            }
            await ctx.reply(frame('AVISO CONCLUÍDO', [`💰 Enviados: ${sent} • Falhas: ${failed}`]));
          });
          try {
            if (typeof ctx.runInBackground === 'function') {
              await ctx.reply(frame('AVISO DA ALCATEIA', [`🐺 Mensagem recebida. Posição na fila: ${job.position}.`]));
              ctx.runInBackground(job.run);
            } else {
              await job.run();
            }
          } catch (error) {
            job.cancel();
            throw error;
          }
          break;
        }
        case 'rate-limit':
          await ctx.reply(frame('ANTI-SPAM', [
            '🐺 Calma, lobo.', '⏳ Aguarde antes de usar outro comando.',
            `⏳ Tempo restante: ${duration(result.retryAfter || 1000)}${result.reason === 'hour' ? ' • Limite de 50 comandos por hora.' : ''}`,
          ]));
          break;
        case 'error':
          await ctx.reply(frame('ALCATEIA', [`🐺 ${result.message}`]));
          break;
        default:
          if (await handleRPResponse(ctx, result, at)) break;
          throw new Error('Resposta desconhecida do serviço do jogo.');
      }
    } catch (error) {
      if (error?.name === 'GameError') {
        await ctx.reply(frame('ALCATEIA', [`🐺 ${error.message}`]));
      } else {
        logger.warn({ error: error?.message, command }, 'Falha ao executar comando do jogo.');
        await ctx.reply(frame('ALCATEIA', ['🐺 Não consegui concluir essa ação. Tente novamente em instantes.']));
      }
    }
    return true;
  };
}
