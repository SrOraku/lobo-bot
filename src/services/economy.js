'use strict';
const DAY = 86400000;
function isPremium(user, now = Date.now()) {
  if (!user?.premium) return false;
  // Preserve explicitly granted legacy permanent Premium; dated grants expire normally.
  return user.premium_until == null || (Number.isFinite(Number(user.premium_until)) ? Number(user.premium_until) : Date.parse(user.premium_until)) > now;
}
function createEconomy(api, { now = Date.now, scope = () => require('../isolation/context').current() || 'legacy' } = {}) {
  const db = api.db;
  const ensure = jid => {
    if (typeof jid !== 'string' || !/^\d+@(s\.whatsapp\.net|lid)$/.test(jid)) throw Error('Participante inválido.');
    db.prepare('INSERT INTO users(jid,name) VALUES (?,?) ON CONFLICT(jid) DO NOTHING').run(jid, jid.split('@')[0]);
  };
  const amount = value => { if (!Number.isSafeInteger(value) || value <= 0) throw Error('Informe uma quantidade inteira positiva válida.'); return value; };
  function operation(event, kind, fn) {
    return db.transaction(() => {
      if (event) {
        const inserted = db.prepare('INSERT OR IGNORE INTO economy_operations(chat_jid,event_id,kind,created_at) VALUES (?,?,?,?)').run(scope(),event,kind,now());
        if (!inserted.changes) throw Error('Esta operação já foi processada.');
      }
      return fn();
    })();
  }
  function move(jid, delta) {
    const user = api.getUser(jid);
    if (!Number.isSafeInteger(user.gold + delta) || user.gold + delta < 0) throw Error('Saldo insuficiente ou limite de saldo excedido.');
    const row = db.prepare('UPDATE users SET gold=gold+? WHERE jid=? AND gold+?>=0').run(delta,jid,delta);
    if (row.changes !== 1) throw Error('Não foi possível movimentar o saldo.');
  }
  function effect(jid, type, duration, multiplier = 1) {
    const old = db.prepare('SELECT expires_at FROM user_effects WHERE chat_jid=? AND user_jid=? AND type=?').get(scope(),jid,type);
    const end = Math.max(now(),old?.expires_at || 0)+duration;
    db.prepare('INSERT INTO user_effects VALUES (?,?,?,?,?,?) ON CONFLICT(chat_jid,user_jid,type) DO UPDATE SET multiplier=excluded.multiplier,expires_at=excluded.expires_at').run(scope(),jid,type,multiplier,now(),end);
    return end;
  }
  function activeEffect(jid,type) {
    return db.prepare('SELECT * FROM user_effects WHERE chat_jid=? AND user_jid=? AND type=? AND expires_at>?').get(scope(),jid,type,now());
  }
  return {
    activeEffect,
    transfer(from,to,value,event) {
      amount(value);
      if(from===to || require('./universal-currency').sameWallet(api,scope(),from,to)) throw Error('Você não pode transferir para si mesmo.');
      return operation(event,'transfer',()=>{ensure(from);ensure(to);move(from,-value);move(to,value);api.logGoldTransaction(from,to,value,'Transferência');return {success:true};});
    },
    daily(jid,event) {
      return operation(event,'daily',()=>{
        ensure(jid);
        const cooldown=db.prepare('SELECT expires_at FROM persistent_cooldowns WHERE chat_jid=? AND user_jid=? AND action=?').get(scope(),jid,'daily');
        if(cooldown?.expires_at>now()) return {success:false,remaining:Math.ceil((cooldown.expires_at-now())/1000)};
        const premium=isPremium(api.getUser(jid),now()),gold=premium?500:200,xp=premium?100:50;
        move(jid,gold);api.addXP(jid,xp);api.logGoldTransaction('daily',jid,gold,'Recompensa diária');
        db.prepare('INSERT INTO persistent_cooldowns VALUES (?,?,?,?) ON CONFLICT(chat_jid,user_jid,action) DO UPDATE SET expires_at=excluded.expires_at').run(scope(),jid,'daily',now()+DAY);
        return {success:true,premium,gold,xp};
      });
    },
    buy(jid,item,event) {
      return operation(event,'purchase',()=>{
        ensure(jid);amount(item.price);move(jid,-item.price);
        let message;
        if(item.id===1) {
          const user=api.getUser(jid),old=Number(user.premium_until)||Date.parse(user.premium_until)||0;
          const end=Math.max(now(),old)+7*DAY;
          api.setPremium(jid,1,new Date(end).toISOString());message='👑 Premium válido até '+new Date(end).toISOString();
        } else if(item.id===2) { if(!api.getStrategy(jid)) api.upsertStrategy(jid,34,33,33);api.updateWolvesAlive(jid,100);message='🐺 Todos os lobos foram curados.';
        } else if(item.id===3) { const atk=20+Math.floor(Math.random()*60),def=Math.floor(Math.random()*(80-atk));api.upsertStrategy(jid,atk,def,100-atk-def);message='🔮 Estratégia sorteada e salva.';
        } else if(item.id===4) { effect(jid,'xp',DAY,3);message='⚡ Boost XP 3× ativado por 24h.';
        } else if(item.id===5) { effect(jid,'shield',3*3600000);message='🛡️ Escudo ativado por 3h.';
        } else if(item.id===6) {
          db.prepare('UPDATE user_titles SET equipped=0 WHERE chat_jid=? AND user_jid=?').run(scope(),jid);
          db.prepare("INSERT INTO user_titles VALUES (?,?, 'alfa-lua','Alfa da Lua',?,1) ON CONFLICT(chat_jid,user_jid,title_id) DO UPDATE SET equipped=1").run(scope(),jid,now());message='🌕 Título Alfa da Lua salvo e equipado.';
        } else throw Error('Item inválido.');
        api.logGoldTransaction(jid,'shop',item.price,'Compra: '+item.id);
        return {message};
      });
    },
    titles(jid) { return db.prepare('SELECT title_id,title_name,equipped FROM user_titles WHERE chat_jid=? AND user_jid=?').all(scope(),jid); },
    equip(jid,id) { return operation(null,'title',()=>{
      const owned=db.prepare('SELECT 1 FROM user_titles WHERE chat_jid=? AND user_jid=? AND title_id=?').get(scope(),jid,id);
      if(!owned) throw Error('Título não adquirido.');
      db.prepare('UPDATE user_titles SET equipped=(title_id=?) WHERE chat_jid=? AND user_jid=?').run(id,scope(),jid);
    }); },
  };
}
let instance;
function economy() { return instance || (instance=createEconomy(require('../utils/database'))); }
module.exports={createEconomy,economy,isPremium};
