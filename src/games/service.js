'use strict';
const engine = require('./engine');
const { mono, command, flavor } = require('../ui/text');
function createArcade(db, { now = Date.now, pick } = {}) {
  const play = db.transaction((chat, user, name, game, input, event, prefix) => {
    if (!chat || !user || !event) throw Error('Não foi possível identificar esta jogada.');
    if (db.prepare('SELECT 1 FROM arcade_events WHERE chat_jid=? AND event_id=?').get(chat, event)) return null;
    const row = db.prepare('SELECT * FROM arcade_sessions WHERE chat_jid=? AND user_jid=? AND game=?').get(chat, user, game);
    let state = row?.state ? JSON.parse(row.state) : null;
    if (state && now() - row.updated_at > (game==='akinator'?600000:86400000)) state = null;
    const action = engine.normalize(input);
    let result;
    if (['parar', 'sair', 'cancelar', 'stop'].includes(action)) {
      if (!state) throw Error('Você não tem uma partida ativa neste jogo.');
      state = null;
      result = { text: '🌙 *Partida encerrada.*\n_Seus pontos anteriores foram preservados._' };
    } else if (!state) {
      if (action && !['iniciar', 'novo', 'start'].includes(action)) throw Error(`Inicie com ${command(`${prefix}${game}`)}.`);
      if (row && now() < row.available_at) throw Error(`Aguarde ${mono(`${Math.ceil((row.available_at - now()) / 1000)}s`)} para iniciar outra rodada.`);
      state = engine.start(game, pick);
      result = { text: '🌕 *Nova partida iniciada!*\n_A matilha acompanha sua trilha._' };
    } else if (!action || action === 'status') {
      result = { text: '🐺 *Sua partida atual*' };
    } else {
      result = engine.advance(game, state, input);
      state = result.finished ? null : result.state;
    }
    if (result.finished) {
      db.prepare(`INSERT INTO arcade_scores(chat_jid,user_jid,name,points,wins,played) VALUES (?,?,?,?,?,1)
        ON CONFLICT(chat_jid,user_jid) DO UPDATE SET name=excluded.name,points=points+excluded.points,wins=wins+excluded.wins,played=played+1`)
        .run(chat, user, name, result.points, Number(result.won));
      result.text += '\n' + flavor(result.won ? 'win' : 'loss');
      result.text += `\n⭐ *Recompensa:* ${mono(`+${result.points}`)} pontos de jogos\n_Pontos de jogos não são WoK coin._\n> 🏆 ${command(`${prefix}placarjogos`)}`;
    }
    const available = state ? 0 : now() + 60000;
    db.prepare(`INSERT INTO arcade_sessions(chat_jid,user_jid,game,state,updated_at,available_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(chat_jid,user_jid,game) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,available_at=excluded.available_at`)
      .run(chat, user, game, state ? JSON.stringify(state) : null, now(), available);
    db.prepare('INSERT INTO arcade_events(chat_jid,event_id,created_at) VALUES (?,?,?)').run(chat, event, now());
    // Deduplicação recente tem limite temporal; não altera pontuação nem partidas.
    db.prepare('DELETE FROM arcade_events WHERE created_at<?').run(now() - 7 * 86400000);
    return result.text + (state ? '\n' + engine.view(game, state, prefix) + `\n> _Encerrar:_ ${command(`${prefix}${game} parar`)}` : '');
  });
  return {
    play,
    ranking: chat => db.prepare('SELECT name,points,wins,played FROM arcade_scores WHERE chat_jid=? ORDER BY points DESC,wins DESC,played ASC,user_jid ASC LIMIT 10').all(chat),
    profile: (chat, user) => db.prepare('SELECT * FROM arcade_scores WHERE chat_jid=? AND user_jid=?').get(chat, user),
  };
}
module.exports = { createArcade };
