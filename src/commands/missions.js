'use strict';

const { frameMenu, frameNotice } = require('../menus/render');
const { mono, command } = require('../ui/text');
const { createMissions, LIMITS } = require('../missions/service');

function createMissionHandler({ api, service, prefix = () => require('../config').get('PREFIX') } = {}) {
  return async function missions(sock, ctx) {
    const p = prefix(), args = ctx.args || [];
    const reply = text => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
    try {
      const missions = service || createMissions(api || require('../utils/database'));
      const action = String(args[0] || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      if (action === 'resgatar') {
        if (args.length !== 2) throw Error(`Use ${p}missoes resgatar ID.`);
        const result = missions.claim(ctx.jid, ctx.sender, args[1], ctx.msg?.key?.id);
        return reply(frameMenu('🎯 MISSÃO RESGATADA', result.duplicate
          ? ['✅ Esta recompensa já foi resgatada neste período. Nenhum valor foi pago novamente.']
          : [`*${result.mission.name}*`, `💰 +${mono(result.coins)} WoK coin • ⭐ +${mono(result.xp)} XP`, '> Recompensa virtual registrada na carteira deste chat.']));
      }
      if (args.length > 1 || !['', 'diarias', 'semanais', 'progresso'].includes(action)) throw Error(`Use ${p}missoes [diarias|semanais|progresso|resgatar ID].`);
      const filter = action === 'diarias' ? 'daily' : action === 'semanais' ? 'weekly' : undefined;
      const rows = missions.list(ctx.jid, ctx.sender, filter);
      const sections = rows.map(item => `${item.claimed ? '✅' : item.complete ? '🎁' : '🐾'} *${item.name}* • ${mono(item.id)}\n_${item.description}_\n${item.period === 'daily' ? 'Diária' : 'Semanal'} • ${mono(item.progress + '/' + item.target)} • +${mono(item.coins)} WoK coin / +${mono(item.xp)} XP\n${item.claimed ? '_Resgatada neste período._' : item.complete ? '▸ ' + command(p + 'missoes resgatar ' + item.id) : '_Objetivo ainda em andamento._'}`);
      sections.push(`🌅 Diárias renovam à meia-noite; semanais na segunda-feira, horário de Brasília.\n💰 Limites: ${mono(LIMITS.dailyCoins)} WoK coin/dia e ${mono(LIMITS.weeklyCoins)} por semana, por jogador e chat.\n> As missões contam acontecimentos reais concluídos a partir desta atualização. Mensagens e simulações não rendem progresso.`);
      return reply(frameMenu('🎯 MISSÕES DA MATILHA', sections));
    } catch (error) {
      const known = /^MISSION_/.test(error.code || '') || !error.code;
      return reply(frameNotice('⚠️ MISSÕES', [known ? error.message : 'Não consegui processar a missão agora. Nenhuma recompensa parcial foi mantida.']));
    }
  };
}

function register(r) {
  r({ name: 'missoes', aliases: ['missões'], category: 'jogos', description: 'Objetivos diários e semanais dos jogos, com resgate único', usage: '!missoes [diarias|semanais|progresso|resgatar ID]', concurrency: 'chat', handler: createMissionHandler() });
}

module.exports = { createMissionHandler, register };
