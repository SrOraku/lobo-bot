'use strict';
const { createHash } = require('node:crypto');
const { chatId } = require('../isolation/context');
const activeStores=new WeakMap();
const prefixFor = chat => 'chat_' + createHash('sha256').update(chatId(chat)).digest('hex').slice(0,32) + '_';
function valid(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Saldo WoK coin inválido ou acima do limite seguro.');
  return value;
}
function account(db,chat,jid) {
  return db.prepare('SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=? AND user_jid=?').get(chat,jid)?.wallet_jid || jid;
}
function balance(db,chat,jid) {
  return db.prepare('SELECT balance FROM universal_wallets WHERE chat_jid=? AND wallet_jid=?').get(chat,account(db,chat,jid))?.balance;
}
function installTriggers(db,chat,prefix) {
  if(prefix!==prefixFor(chat))throw Error('Partição de moeda inválida.');
  const table=prefix+'users';
  // The interpolated table and chat are validated/generated here, never command input.
  const scope="'"+chat+"'";
  const wallet=`COALESCE((SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=${scope} AND user_jid=NEW.jid),NEW.jid)`;
  db.exec(`CREATE TRIGGER IF NOT EXISTS ${prefix}wallet_insert AFTER INSERT ON ${table} BEGIN
    INSERT OR IGNORE INTO universal_wallet_aliases VALUES(${scope},NEW.jid,NEW.jid);
    INSERT OR IGNORE INTO universal_wallets VALUES(${scope},${wallet},NEW.gold);
    UPDATE ${table} SET gold=(SELECT balance FROM universal_wallets WHERE chat_jid=${scope} AND wallet_jid=${wallet}) WHERE jid=NEW.jid;
  END;
  CREATE TRIGGER IF NOT EXISTS ${prefix}wallet_update AFTER UPDATE OF gold ON ${table} WHEN NEW.gold<>OLD.gold BEGIN
    INSERT OR IGNORE INTO universal_wallet_aliases VALUES(${scope},NEW.jid,NEW.jid);
    INSERT INTO universal_currency_audit(chat_jid,action,user_jid,amount) SELECT ${scope},'movement',NEW.jid,NEW.gold-balance FROM universal_wallets WHERE chat_jid=${scope} AND wallet_jid=${wallet} AND balance<>NEW.gold;
    INSERT INTO universal_wallets VALUES(${scope},${wallet},NEW.gold) ON CONFLICT(chat_jid,wallet_jid) DO UPDATE SET balance=excluded.balance;
    UPDATE ${table} SET gold=NEW.gold WHERE gold<>NEW.gold AND jid IN (SELECT user_jid FROM universal_wallet_aliases WHERE chat_jid=${scope} AND wallet_jid=${wallet});
  END;`);
}
function ensureScope(db,chat,prefix) {
  if(db.prepare('SELECT 1 FROM universal_game_states WHERE chat_jid=?').get(chat))return;
  const seed=db.prepare('SELECT state FROM universal_currency_seed WHERE id=1').get();
  if(!seed)return;
  db.transaction(()=>{
    const table=prefix+'users';
    installTriggers(db,chat,prefix);
    if(db.prepare('SELECT 1 FROM universal_game_states WHERE chat_jid=?').get(chat))return;
    const source=JSON.parse(seed.state);
    const game=structuredClone(source.games[chat] || source.gameSeed);
    for(const user of db.prepare(`SELECT jid,gold FROM ${table}`).all()) {
      valid(user.gold);
      db.prepare('INSERT OR IGNORE INTO universal_wallet_aliases VALUES(?,?,?)').run(chat,user.jid,user.jid);
      db.prepare('INSERT OR IGNORE INTO universal_wallets VALUES(?,?,?)').run(chat,user.jid,user.gold);
    }
    for(const player of Object.values(game.players)) {
      valid(player.coins);
      db.prepare(`INSERT OR IGNORE INTO ${table}(jid,name,gold) VALUES(?,?,0)`).run(player.jid,player.name);
      const combined=valid(balance(db,chat,player.jid)+player.coins);
      db.prepare(`UPDATE ${table} SET gold=? WHERE jid=?`).run(combined,player.jid);
      db.prepare('INSERT INTO universal_currency_audit(chat_jid,action,user_jid,amount) VALUES(?,?,?,?)').run(chat,'merge_legacy_wok',player.jid,player.coins);
      player.coins=combined;
    }
    db.prepare('INSERT INTO universal_game_states VALUES(?,?)').run(chat,JSON.stringify(game));
  })();

}
function attachUniversalStore(store,api) {
  const db=api.db[Symbol.for('lobo.rawDatabase')];
  if(!db)throw Error('SQLite original necessário para unificar a moeda.');
  // Keep the old JSON intact. SQLite becomes authoritative for new game transactions.
  const fs=require('node:fs');
  if(fs.existsSync(store.file)) {
    try {fs.copyFileSync(store.file,store.file+'.pre-universal',fs.constants.COPYFILE_EXCL);fs.chmodSync(store.file+'.pre-universal',0o600);}
    catch(error){if(error.code!=='EEXIST')throw error;}
  }
  db.prepare('INSERT OR IGNORE INTO universal_currency_seed VALUES(1,?)').run(JSON.stringify({gameSeed:store.data.gameSeed,games:store.data.games}));
  function prepare(chat) {
    chatId(chat);
    require('../isolation/context').run(chat,()=>api.getUser('0@s.whatsapp.net'));
    ensureScope(db,chat,prefixFor(chat));
  }
  // Migrate all already known chats once, preserving their independent balances.
  const chats=new Set([...Object.keys(store.data.games),...db.prepare('SELECT chat_jid FROM chat_partitions').all().map(row=>row.chat_jid)]);
  for(const chat of chats)prepare(chat);
  store.scoped=chat=>({transactionGame(callback){
    const pending=store.gameQueue.then(()=>{
      prepare(chat);
      return db.transaction(()=>{
        const game=JSON.parse(db.prepare('SELECT state FROM universal_game_states WHERE chat_jid=?').get(chat).state);
        for(const player of Object.values(game.players))player.coins=valid(balance(db,chat,player.jid));
        game.universalBalances=Object.fromEntries(db.prepare('SELECT a.user_jid,w.balance FROM universal_wallet_aliases a JOIN universal_wallets w ON w.chat_jid=a.chat_jid AND w.wallet_jid=a.wallet_jid WHERE a.chat_jid=?').all(chat).map(row=>[row.user_jid,row.balance]));
        game.universalModifiers={};
        for(const player of Object.values(game.players)) {
          const effects=db.prepare('SELECT type,multiplier,expires_at FROM user_effects WHERE chat_jid=? AND user_jid=? AND expires_at>?').all(chat,account(db,chat,player.jid),Date.now());
          game.universalModifiers[player.jid]={day:require('../config/expansion').dateParts(Date.now()).day,...Object.fromEntries(effects.map(e=>[e.type,e.multiplier]))};
          player.economicShieldUntil=effects.find(e=>e.type==='economicShield')?.expires_at || 0;
        }
        const result=callback(game);
        if(result&&typeof result.then==='function')throw Error('Transação do jogo deve ser síncrona.');
        delete game.universalBalances;
        delete game.universalModifiers;
        const table=prefixFor(chat)+'users';
        for(const player of Object.values(game.players)) {
          valid(player.coins);
          db.prepare(`INSERT OR IGNORE INTO ${table}(jid,name,gold) VALUES(?,?,?)`).run(player.jid,player.name,player.coins);
          db.prepare(`UPDATE ${table} SET gold=? WHERE jid=?`).run(player.coins,player.jid);
        }
        db.prepare('UPDATE universal_game_states SET state=? WHERE chat_jid=?').run(JSON.stringify(game),chat);
        return structuredClone(result);
      })();
    });
    store.gameQueue=pending.catch(()=>{});
    return pending;
  }});
  store.snapshot=()=>{
    const data=structuredClone(store.data);
    for(const row of db.prepare('SELECT chat_jid,state FROM universal_game_states').all()){
      const game=JSON.parse(row.state);
      for(const player of Object.values(game.players))player.coins=balance(db,row.chat_jid,player.jid);
      data.games[row.chat_jid]=game;
    }
    return data;
  };
  store.linkWallet=(chat,phone,lid)=>{
    if(!/^\d+@s\.whatsapp\.net$/.test(phone)||!/^\d+@lid$/.test(lid))return;
    prepare(chat);
    return db.transaction(()=>{
      const to=account(db,chat,phone),from=account(db,chat,lid);
      if(to===from)return;
      const phoneBalance=balance(db,chat,phone),lidBalance=balance(db,chat,lid);
      const total=valid(phoneBalance===undefined&&lidBalance===undefined?500:(phoneBalance||0)+(lidBalance||0));
      db.prepare('INSERT INTO universal_wallets VALUES(?,?,?) ON CONFLICT(chat_jid,wallet_jid) DO UPDATE SET balance=excluded.balance').run(chat,to,total);
      db.prepare('INSERT OR IGNORE INTO universal_wallet_aliases VALUES(?,?,?)').run(chat,phone,to);
      db.prepare('INSERT OR IGNORE INTO universal_wallet_aliases VALUES(?,?,?)').run(chat,lid,from);
      db.prepare('UPDATE universal_wallet_aliases SET wallet_jid=? WHERE chat_jid=? AND wallet_jid=?').run(to,chat,from);
      db.prepare('DELETE FROM universal_wallets WHERE chat_jid=? AND wallet_jid=?').run(chat,from);
      db.prepare(`INSERT OR IGNORE INTO ${prefixFor(chat)}users(jid,name,gold) VALUES(?,?,?)`).run(phone,phone.split('@')[0],total);
      db.prepare(`UPDATE ${prefixFor(chat)}users SET gold=? WHERE jid IN (SELECT user_jid FROM universal_wallet_aliases WHERE chat_jid=? AND wallet_jid=?)`).run(total,chat,to);
      db.prepare('INSERT INTO universal_currency_audit(chat_jid,action,user_jid,amount) VALUES(?,?,?,?)').run(chat,'verified_identity_merge',phone,total);
    })();
  };
  activeStores.set(db,store);
  return store;
}
async function linkMessageWallet(api,sock,msg,{jid,sender,isGroup}) {
  const raw=api.db?.[Symbol.for('lobo.rawDatabase')],store=activeStores.get(raw);
  if(!store)return;
  const {normalizeJid,phoneJid}=await import('../../addons/alcateia/src/identity.js');
  const mapping=sock.signalRepository?.lidMapping;
  const alternative=msg.key.fromMe?sock.user?.id:isGroup?msg.key.participantAlt:msg.key.remoteJidAlt;
  const mentions=require('../activations/message-rules').inspect(msg.message).mentions;
  for(const value of new Set([sender,...mentions.slice(0,20)])) {
    const id=normalizeJid(value);if(!id)continue;
    if(id.endsWith('@lid')&&account(raw,jid,id)!==id)continue;
    let phone=phoneJid(id),lid=id.endsWith('@lid')?id:null;
    try {
      if(lid)phone=phoneJid(id===normalizeJid(sender)?alternative:null)||phoneJid(await mapping?.getPNForLID?.(lid));
      else lid=normalizeJid(await mapping?.getLIDForPN?.(phone));
    } catch {continue;} // Keep both original balances until WhatsApp can verify their relationship.
    if(phone&&lid?.endsWith('@lid'))store.linkWallet(jid,phone,lid);
  }
}
function sameWallet(api,chat,left,right) {
  const raw=api.db?.[Symbol.for('lobo.rawDatabase')];
  return !!raw&&account(raw,chat,left)===account(raw,chat,right);
}
module.exports={attachUniversalStore,ensureScope,prefixFor,balance,linkMessageWallet,sameWallet};
