'use strict';
const engine = require('./engine');
const { mono, command, flavor } = require('../ui/text');
const { canonicalArcadeUser,recordArcadeResult } = require('./history');
function createArcade(db, { now = Date.now, pick } = {}) {
  const play = db.transaction((chat, user, name, game, input, event, prefix) => {
    if (!chat || !user || !event) throw Error('Não foi possível identificar esta jogada.');
    const legacyLocalActor=typeof user==='string'&&!user.includes('@');
    const originalUser=user;if(!legacyLocalActor)user=canonicalArcadeUser(db,chat,user);
    if(originalUser!==user){
      // Only a verified wallet alias may carry an unfinished LID session to its
      // confirmed phone. An already existing phone session always takes priority.
      const legacy=db.prepare('SELECT 1 FROM arcade_sessions WHERE chat_jid=? AND user_jid=? AND game=?').get(chat,originalUser,game);
      const current=db.prepare('SELECT 1 FROM arcade_sessions WHERE chat_jid=? AND user_jid=? AND game=?').get(chat,user,game);
      if(legacy&&!current)db.prepare('UPDATE arcade_sessions SET user_jid=? WHERE chat_jid=? AND user_jid=? AND game=?').run(user,chat,originalUser,game);
    }
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
      if (action && !/^(?:iniciar|novo|start)(?:\s|$)/.test(action)) throw Error(`Inicie com ${command(`${prefix}${game}`)}.`);
      if (row && now() < row.available_at) throw Error(`Aguarde ${mono(`${Math.ceil((row.available_at - now()) / 1000)}s`)} para iniciar outra rodada.`);
      const options=engine.startOptions(game,action);
      state = engine.start(game, pick,{...options,now});
      state._startedAt=now();
      result = { text: '🌕 *Nova partida iniciada!*\n_A matilha acompanha sua trilha._' };
    } else if (!action || action === 'status') {
      result = { text: '🐺 *Sua partida atual*' };
    } else {
      result = engine.advance(game, state, input,{now});
      state = result.finished ? null : result.state;
    }
    if (result.finished) {
      if(!legacyLocalActor&&!recordArcadeResult(db,{chat,user,name,game,event,points:result.points,won:result.won,state:result.state,at:now()}))return null;
      db.prepare(`INSERT INTO arcade_scores(chat_jid,user_jid,name,points,wins,played) VALUES (?,?,?,?,?,1)
        ON CONFLICT(chat_jid,user_jid) DO UPDATE SET name=excluded.name,points=points+excluded.points,wins=wins+excluded.wins,played=played+1`)
        .run(chat, user, name, result.points, Number(result.won));
      if(!legacyLocalActor){
        const {recordGameEvent}=require('../missions/service');
        recordGameEvent(db,{chat,user,event,kind:'arcade_complete',at:now(),metadata:{game,won:result.won,points:result.points}});
        if(game==='aventura'&&result.won)recordGameEvent(db,{chat,user,event,kind:'adventure_complete',at:now(),metadata:{game,won:true,points:result.points}});
        if(game==='quiz')recordGameEvent(db,{chat,user,event,kind:'quiz_complete',at:now(),metadata:{game,won:result.won,points:result.points}});
      }
      result.text += '\n' + flavor(result.won ? 'win' : 'loss');
      result.text += `\n⭐ *Recompensa:* ${mono(`+${result.points}`)} pontos de jogos\n_Pontos de jogos não são WoK coin._\n> 🏆 ${command(`${prefix}placarjogos`)}`;
    }
    const available = state ? 0 : now() + 60000;
    db.prepare(`INSERT INTO arcade_sessions(chat_jid,user_jid,game,state,updated_at,available_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(chat_jid,user_jid,game) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,available_at=excluded.available_at`)
      .run(chat, user, game, state ? JSON.stringify(state) : null, now(), available);
    db.prepare('INSERT INTO arcade_events(chat_jid,event_id,created_at) VALUES (?,?,?)').run(chat, event, now());
    // Keep accepted event IDs across restarts and long-delayed message replays.
    return result.text + (state ? '\n' + engine.view(game, state, prefix) + `\n> _Encerrar:_ ${command(`${prefix}${game} parar`)}` : '');
  });
  return {
    play,
    ranking: chat => db.prepare('SELECT name,points,wins,played FROM arcade_scores WHERE chat_jid=? ORDER BY points DESC,wins DESC,played ASC,user_jid ASC LIMIT 10').all(chat),
    profile: (chat, user) => db.prepare('SELECT * FROM arcade_scores WHERE chat_jid=? AND user_jid=?').get(chat, user),
  };
}
module.exports = { createArcade };
