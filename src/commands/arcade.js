'use strict';
const { clean, frameMenu, frameNotice } = require('../menus/render');
const { createArcade } = require('../games/service');
const TITLES = { akinator: '🔮 AKINATOR DA MATILHA', quiz: '🧠 QUIZ DA MATILHA', forca: '🧩 FORCA LUNAR', adivinhar: '🎯 NÚMERO SECRETO', aventura: '🏕️ TRILHAS DA LUA' };
function createArcadeCommand(game, { repository } = {}) {
  return async (sock, ctx) => {
    const reply = text => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
    const arcade = repository || createArcade(require('../utils/database').db);
    const prefix = require('../config').get('PREFIX');
    try {
      if (game === 'placarjogos') {
        const ranking = arcade.ranking(ctx.jid), profile = arcade.profile(ctx.jid, ctx.sender);
        const badge = !profile ? '🐾 Iniciante' : profile.points >= 500 ? '🌕 Lenda Lunar' : profile.points >= 200 ? '⚔️ Explorador' : profile.points >= 50 ? '🐺 Aprendiz' : '🐾 Iniciante';
        return reply(frameMenu('🏆 PLACAR DOS JOGOS', [
          ranking.length ? ranking.map((p, i) => `${i + 1}. ${clean(p.name)} — ⭐ ${p.points} • 🏆 ${p.wins} • 🎮 ${p.played}`).join('\n') : '_Ainda não há partidas concluídas neste chat._',
          `Sua conquista: ${badge}\n_Pontos exclusivos dos minijogos; não movimentam a economia._`,
          `📖 _${prefix}menu jogos_`,
        ]));
      }
      const text = arcade.play(ctx.jid, ctx.sender, clean(ctx.pushName || 'Lobo'), game, ctx.args.join(' '), ctx.msg.key.id, prefix);
      if (text) return reply(frameMenu(TITLES[game], [text]));
    } catch (error) {
      if (error.code || error instanceof SyntaxError) throw error;
      return reply(frameNotice('⚠️ JOGADA INVÁLIDA', [error.message]));
    }
  };
}
module.exports = { createArcadeCommand };
