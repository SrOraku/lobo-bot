'use strict';

function canonicalArcadeUser(db, chat, user) {
  const alias = db.prepare('SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=? AND user_jid=?').get(chat,user)?.wallet_jid;
  const resolved = alias || user;
  if (typeof resolved !== 'string' || !/^\d{10,15}@s\.whatsapp\.net$/.test(resolved)) throw Error('Não foi possível confirmar seu telefone. Envie uma mensagem normal e tente novamente.');
  return resolved;
}

function recordArcadeResult(db,{chat,user,event,name='Lobo',game,points=0,won=false,state={},at=Date.now()}) {
  const actor = canonicalArcadeUser(db,chat,user);
  if (!event || !/^[a-z0-9]+$/.test(game) || !Number.isSafeInteger(points) || points<0 || points>10000) throw Error('Resultado de jogo inválido.');
  const details={};
  for(const key of ['theme','difficulty','campaign','ending','category','score','reactionMs','typingMs']) if(['string','number'].includes(typeof state[key])) details[key]=state[key];
  const moves=Math.max(0,Math.min(100000,Number(state.moves||state.turns||state.attempts||state.letters?.length||state.round||state.board?.filter(Boolean).length||0)))||0;
  const elapsed=Number.isSafeInteger(state._startedAt)?Math.max(0,at-state._startedAt):0;
  return db.prepare(`INSERT OR IGNORE INTO phase1_arcade_results(chat_jid,event_id,user_jid,name,game,points,won,moves,elapsed_ms,details,at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(chat,event,actor,String(name).slice(0,80),game,points,Number(Boolean(won)),moves,elapsed,JSON.stringify(details),at).changes>0;
}

function createHistory(db) {
  return {
    list(chat,user,{game=null,page=1}={}) {
      user=canonicalArcadeUser(db,chat,user);
      if(!Number.isSafeInteger(page)||page<1||page>1000)throw Error('Página inválida.');
      const filter=game?' AND game=?':'',params=game?[chat,user,game]:[chat,user];
      const total=db.prepare('SELECT COUNT(*) n FROM phase1_arcade_results WHERE chat_jid=? AND user_jid=?'+filter).get(...params).n;
      return {page,pages:Math.max(1,Math.ceil(total/8)),total,rows:db.prepare('SELECT * FROM phase1_arcade_results WHERE chat_jid=? AND user_jid=?'+filter+' ORDER BY at DESC,event_id DESC LIMIT 8 OFFSET ?').all(...params,(page-1)*8)};
    },
    records(chat,user,game=null) {
      user=canonicalArcadeUser(db,chat,user);
      return db.prepare(`SELECT game,COUNT(*) played,SUM(won) wins,MAX(points) best_points,
        MAX(json_extract(details,'$.score')) best_score,MIN(CASE WHEN won=1 AND elapsed_ms>0 THEN elapsed_ms END) fastest_ms
        FROM phase1_arcade_results WHERE chat_jid=? AND user_jid=?${game?' AND game=?':''} GROUP BY game ORDER BY game`).all(...(game?[chat,user,game]:[chat,user]));
    },
    ranking(chat,game,{since=0}={}) {
      return db.prepare(`SELECT user_jid,MAX(name) name,COUNT(*) played,SUM(won) wins,SUM(points) points,MAX(points) best_points
        FROM phase1_arcade_results WHERE chat_jid=? AND game=? AND at>=? GROUP BY user_jid ORDER BY points DESC,wins DESC,user_jid LIMIT 10`).all(chat,game,since);
    },
  };
}
module.exports={canonicalArcadeUser,recordArcadeResult,createHistory};
