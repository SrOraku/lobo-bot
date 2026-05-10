'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/lobo.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -32000');
db.pragma('temp_store = MEMORY');
db.pragma('foreign_keys = ON');

const { runMigrations } = require('../config/migrations');
console.log('🌹 Verificando banco de dados...');
runMigrations(db);

const stmts = {
  getUser:       db.prepare(`SELECT * FROM users WHERE jid=?`),
  upsertUser:    db.prepare(`INSERT INTO users(jid,name)VALUES(?,?) ON CONFLICT(jid) DO UPDATE SET name=excluded.name,last_seen=datetime('now')`),
  updateGold:    db.prepare(`UPDATE users SET gold=MAX(0,gold+?) WHERE jid=?`),
  updateXP:      db.prepare(`UPDATE users SET xp=?,level=?,rank=? WHERE jid=?`),
  setBanned:     db.prepare(`UPDATE users SET banned=? WHERE jid=?`),
  setMuted:      db.prepare(`UPDATE users SET muted=? WHERE jid=?`),
  setPremium:    db.prepare(`UPDATE users SET premium=?,premium_until=? WHERE jid=?`),
  topGold:       db.prepare(`SELECT * FROM users ORDER BY gold DESC LIMIT 10`),
  topLevel:      db.prepare(`SELECT * FROM users ORDER BY level DESC,xp DESC LIMIT 10`),
  getStrategy:   db.prepare(`SELECT * FROM wolf_strategy WHERE jid=?`),
  upsertStrat:   db.prepare(`INSERT INTO wolf_strategy(jid,attack,defense,counter)VALUES(?,?,?,?) ON CONFLICT(jid) DO UPDATE SET attack=excluded.attack,defense=excluded.defense,counter=excluded.counter,updated_at=datetime('now')`),
  setWolves:     db.prepare(`UPDATE wolf_strategy SET wolves_alive=?,updated_at=datetime('now') WHERE jid=?`),
  incrAtk:       db.prepare(`UPDATE wolf_strategy SET total_attacks=total_attacks+1 WHERE jid=?`),
  incrVic:       db.prepare(`UPDATE wolf_strategy SET total_victories=total_victories+1 WHERE jid=?`),
  topWolves:     db.prepare(`SELECT ws.*,u.name FROM wolf_strategy ws LEFT JOIN users u ON u.jid=ws.jid ORDER BY ws.total_victories DESC LIMIT 10`),
  updateBattle:  db.prepare(`UPDATE users SET wins=wins+?,losses=losses+?,battles=battles+1 WHERE jid=?`),
  getGroup:      db.prepare(`SELECT * FROM groups WHERE jid=?`),
  upsertGroup:   db.prepare(`INSERT INTO groups(jid,name)VALUES(?,?) ON CONFLICT(jid) DO UPDATE SET name=CASE WHEN excluded.name!='' THEN excluded.name ELSE name END`),
  upsertAct:     db.prepare(`INSERT INTO activity_log(jid,group_id,message_count,last_message)VALUES(?,?,1,datetime('now')) ON CONFLICT(jid,group_id) DO UPDATE SET message_count=message_count+1,last_message=datetime('now')`),
  getInactive:   db.prepare(`SELECT jid FROM activity_log WHERE group_id=? AND last_message<datetime('now','-'||?||' days')`),
  getAutoR:      db.prepare(`SELECT * FROM auto_replies WHERE group_id=? OR group_id IS NULL`),
  addAutoR:      db.prepare(`INSERT INTO auto_replies(group_id,trigger,response)VALUES(?,?,?)`),
  delAutoR:      db.prepare(`DELETE FROM auto_replies WHERE id=? AND group_id=?`),
  logGold:       db.prepare(`INSERT INTO gold_transactions(from_jid,to_jid,amount,reason)VALUES(?,?,?,?)`),
  logBattle:     db.prepare(`INSERT INTO battle_log(attacker,defender,attacker_wolves_before,defender_wolves_before,attacker_wolves_after,defender_wolves_after,result,group_id)VALUES(?,?,?,?,?,?,?,?)`),
  isAdmin:       db.prepare(`SELECT * FROM admins WHERE jid=?`),
  addAdmin:      db.prepare(`INSERT OR REPLACE INTO admins(jid,level)VALUES(?,?)`),
  removeAdmin:   db.prepare(`DELETE FROM admins WHERE jid=?`),
};

function getRank(level) {
  if(level>=90)return'👑 Alpha Supremo';
  if(level>=75)return'🌕 Alfa da Matilha';
  if(level>=60)return'🐺 Lobo Veterano';
  if(level>=50)return'⚔️ Guerreiro da Lua';
  if(level>=40)return'🔥 Lobo Selvagem';
  if(level>=30)return'🌙 Lobo Lunar';
  if(level>=20)return'🌹 Lobo Jovem';
  if(level>=10)return'🦴 Filhote Crescido';
  return'🐾 Filhote de Lobo';
}
function calcLevel(xp){const l=Math.min(100,Math.floor(0.1*Math.sqrt(xp))+1);return{level:l,rank:getRank(l)};}

module.exports = {
  db,
  getUser:    j=>stmts.getUser.get(j),
  upsertUser: (j,n)=>stmts.upsertUser.run(j,n),
  addGold:    (j,a)=>stmts.updateGold.run(a,j),
  addXP:(jid,amount)=>{
    const u=stmts.getUser.get(jid);if(!u)return null;
    const newXP=(u.xp||0)+amount;
    const{level,rank}=calcLevel(newXP);
    stmts.updateXP.run(newXP,level,rank,jid);
    return{oldLevel:u.level,newLevel:level,rank,xp:newXP};
  },
  setBanned:  (j,v)=>stmts.setBanned.run(v,j),
  setMuted:   (j,v)=>stmts.setMuted.run(v,j),
  setPremium: (j,v,u)=>stmts.setPremium.run(v,u||null,j),
  topGold:    ()=>stmts.topGold.all(),
  topLevel:   ()=>stmts.topLevel.all(),
  calcLevel,getRank,
  getStrategy:       j=>stmts.getStrategy.get(j),
  upsertStrategy:    (j,a,d,c)=>stmts.upsertStrat.run(j,a,d,c),
  updateWolvesAlive: (j,w)=>stmts.setWolves.run(w,j),
  incrementAttackStats:  j=>stmts.incrAtk.run(j),
  incrementVictoryStats: j=>stmts.incrVic.run(j),
  updateBattleResult:(j,w,l)=>stmts.updateBattle.run(w,l,j),
  topWolves: ()=>stmts.topWolves.all(),
  logBattle: d=>stmts.logBattle.run(d.attacker,d.defender,d.atkBefore,d.defBefore,d.atkAfter,d.defAfter,d.result,d.groupId),
  getGroup:    j=>stmts.getGroup.get(j),
  upsertGroup: (j,n)=>stmts.upsertGroup.run(j,n||''),
  updateGroup: (j,f,v)=>db.prepare(`UPDATE groups SET ${f}=? WHERE jid=?`).run(v,j),
  upsertActivity:   (j,g)=>stmts.upsertAct.run(j,g),
  getInactiveUsers: (g,d)=>stmts.getInactive.all(g,d),
  getAutoReplies:   g=>stmts.getAutoR.all(g),
  addAutoReply:     (g,t,r)=>stmts.addAutoR.run(g,t,r),
  removeAutoReply:  (i,g)=>stmts.delAutoR.run(i,g),
  logGoldTransaction:(f,t,a,r)=>stmts.logGold.run(f,t,a,r),
  isBotAdmin:    j=>!!stmts.isAdmin.get(j),
  addBotAdmin:   (j,l)=>stmts.addAdmin.run(j,l||1),
  removeBotAdmin:j=>stmts.removeAdmin.run(j),
};
