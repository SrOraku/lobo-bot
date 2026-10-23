'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {runMigrations}=require('../src/config/migrations');
const {createScopedDatabase}=require('../src/isolation/sqlite');
const context=require('../src/isolation/context');
const {attachUniversalStore,balance}=require('../src/services/universal-currency');
const A='123@g.us',B='456@g.us',P='5543999999999@s.whatsapp.net',Q='5543988888888@s.whatsapp.net';
async function fixture(t,{gold=500,coins=100}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-universal-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const raw=new Database(path.join(root,'db.sqlite'));raw.pragma('foreign_keys=ON');t.after(()=>raw.close());runMigrations(raw);
 const db=createScopedDatabase(raw),api={db,getUser:jid=>db.prepare('SELECT * FROM users WHERE jid=?').get(jid)};
 context.run(A,()=>db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(P,'Lobo',gold));
 const {Store,defaultGame}=await import('../addons/alcateia/src/store.js');
 const {createPlayer}=await import('../addons/alcateia/src/game/players.js');
 const game=defaultGame();game.players[P]=createPlayer({jid:P,number:P.split('@')[0],name:'Lobo'});game.players[P].coins=coins;
 const file=path.join(root,'game.json');fs.writeFileSync(file,JSON.stringify({version:1,groups:{},game}));
 const store=attachUniversalStore(new Store(file),api);
 return {root,raw,db,api,store,file,Store};
}
test('migration adds Gold and WOK once and preserves the legacy JSON on restart',async t=>{
 const f=await fixture(t);assert.equal(balance(f.raw,A,P),600);
 const original=fs.readFileSync(f.file,'utf8');assert.equal(fs.readFileSync(f.file+'.pre-universal','utf8'),original);
 const restored=attachUniversalStore(new f.Store(f.file),f.api);
 assert.equal((await restored.scoped(A).transactionGame(game=>game.players[P])).coins,600);
 assert.equal(balance(f.raw,A,P),600);assert.equal(fs.readFileSync(f.file,'utf8'),original);
});
test('legacy SQL, game expenses and rewards share one wallet and remain isolated by chat',async t=>{
 const f=await fixture(t);
 context.run(A,()=>f.db.prepare('UPDATE users SET gold=gold+200 WHERE jid=?').run(P));
 await f.store.scoped(A).transactionGame(game=>{assert.equal(game.players[P].coins,800);game.players[P].coins-=70;});
 assert.equal(context.run(A,()=>f.api.getUser(P).gold),730);
 assert.equal((await f.store.scoped(B).transactionGame(game=>game.players[P])).coins,100);
 assert.equal(context.run(B,()=>f.api.getUser(P).gold),100);
});
test('failed game commit rolls back both the wallet and full game state',async t=>{
 const f=await fixture(t);await assert.rejects(f.store.scoped(A).transactionGame(game=>{game.players[P].coins=-1;game.players[P].hp=1;}));
 assert.equal(balance(f.raw,A,P),600);
 assert.equal((await f.store.scoped(A).transactionGame(game=>game.players[P])).hp,100);
 f.raw.exec("CREATE TRIGGER reject_state BEFORE UPDATE ON universal_game_states BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 await assert.rejects(f.store.scoped(A).transactionGame(game=>{game.players[P].coins-=20;}),/fixture failure/);
 assert.equal(balance(f.raw,A,P),600);
});
test('concurrent game operations do not lose money and SQL transactions roll back mirrored balance',async t=>{
 const f=await fixture(t);
 await Promise.all(Array.from({length:10},()=>f.store.scoped(A).transactionGame(game=>{game.players[P].coins-=10;})));
 assert.equal(balance(f.raw,A,P),500);
 assert.throws(()=>context.run(A,()=>f.db.transaction(()=>{f.db.prepare('UPDATE users SET gold=gold-50 WHERE jid=?').run(P);throw Error('rollback');})()),/rollback/);
 assert.equal(balance(f.raw,A,P),500);
});
test('verified PN/LID aliases merge once and both legacy identities spend the same balance',async t=>{
 const f=await fixture(t);const lid='999999@lid';
 context.run(A,()=>f.db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(lid,'LID',50));
 f.store.linkWallet(A,P,lid);f.store.linkWallet(A,P,lid);
 assert.equal(balance(f.raw,A,P),650);assert.equal(balance(f.raw,A,lid),650);
 context.run(A,()=>f.db.prepare('UPDATE users SET gold=gold-10 WHERE jid=?').run(lid));
 assert.equal(context.run(A,()=>f.api.getUser(P).gold),640);
 await f.store.scoped(A).transactionGame(game=>{assert.equal(game.players[P].coins,640);game.players[P].coins+=5;});
 assert.equal(context.run(A,()=>f.api.getUser(lid).gold),645);
});
test('new game registration uses the existing wallet without minting another bonus',async t=>{
 const f=await fixture(t);context.run(A,()=>f.db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(Q,'Outro',900));
 const {registerPlayer}=await import('../addons/alcateia/src/game/players.js');
 const player=await f.store.scoped(A).transactionGame(game=>registerPlayer(game,{jid:Q,number:Q.split('@')[0],name:'Outro'}));
 assert.equal(player.coins,900);assert.equal(balance(f.raw,A,Q),900);
});
test('overflow migration aborts without modifying either source balance',async t=>{
 await assert.rejects(fixture(t,{gold:Number.MAX_SAFE_INTEGER,coins:1}),/limite seguro/);
});
test('normal message identity resolution links the wallet before giving another initial balance',async t=>{
 const f=await fixture(t);const lid='888888@lid';
 const {linkMessageWallet,sameWallet}=require('../src/services/universal-currency');
 await linkMessageWallet(f.api,{signalRepository:{lidMapping:{getPNForLID:async()=>P}}},{key:{participantAlt:P},message:{conversation:'!carteira'}},{jid:A,sender:lid,isGroup:true});
 context.run(A,()=>f.db.prepare('INSERT INTO users(jid,name) VALUES(?,?)').run(lid,'Lobo'));
 assert.equal(balance(f.raw,A,P),600);assert.equal(context.run(A,()=>f.api.getUser(lid).gold),600);
 assert.equal(sameWallet(f.api,A,P,lid),true);
});
test('invalid or unverified identity never merges an unrelated account',async t=>{
 const f=await fixture(t);const lid='777777@lid';
 context.run(A,()=>f.db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(lid,'Outro',80));
 const {linkMessageWallet}=require('../src/services/universal-currency');
 await linkMessageWallet(f.api,{}, {key:{},message:{conversation:'meu numero '+P}}, {jid:A,sender:lid,isGroup:true});
 assert.equal(balance(f.raw,A,P),600);assert.equal(balance(f.raw,A,lid),80);
});
test('snapshots contain current universal balances and preserved family treasury',async t=>{
 const f=await fixture(t);
 await f.store.scoped(A).transactionGame(game=>{game.rp.families.family={coins:77};});
 context.run(A,()=>f.db.prepare('UPDATE users SET gold=gold+5 WHERE jid=?').run(P));
 const data=f.store.snapshot();assert.equal(data.games[A].players[P].coins,605);assert.equal(data.games[A].rp.families.family.coins,77);
});
test('daily, legacy transfer and RP transfers use the same transactional wallet',async t=>{
 const f=await fixture(t);
 f.api.addXP=()=>{};f.api.logGoldTransaction=(from,to,amount,reason)=>f.db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES(?,?,?,?)').run(from,to,amount,reason);
 const economy=require('../src/services/economy').createEconomy(f.api);
 context.run(A,()=>{assert.equal(economy.daily(P,'daily-1').gold,200);economy.transfer(P,Q,100,'transfer-1');});
 const {registerPlayer}=await import('../addons/alcateia/src/game/players.js');
 const {transfer}=await import('../addons/alcateia/src/game/wallet.js');
 await f.store.scoped(A).transactionGame(game=>{const other=registerPlayer(game,{jid:Q,number:Q.split('@')[0]});assert.equal(game.players[P].coins,700);assert.equal(other.coins,600);transfer(other,game.players[P],50);});
 assert.equal(context.run(A,()=>f.api.getUser(P).gold),750);assert.equal(context.run(A,()=>f.api.getUser(Q).gold),550);
});
test('full database reopen preserves currency and game changes without importing JSON again',async t=>{
 const f=await fixture(t);
 await f.store.scoped(A).transactionGame(game=>{game.players[P].coins-=30;game.players[P].wolves=21;});
 // Use another SQLite connection, as a fresh runtime would.
 const raw=new Database(path.join(f.root,'db.sqlite'));t.after(()=>raw.close());
 const db=createScopedDatabase(raw),api={db,getUser:jid=>db.prepare('SELECT * FROM users WHERE jid=?').get(jid)};
 const store=attachUniversalStore(new f.Store(f.file),api);
 const player=await store.scoped(A).transactionGame(game=>game.players[P]);
 assert.equal(player.coins,570);assert.equal(player.wolves,21);
});
test('self transfer using a verified alias is rejected without moving money',async t=>{
 const f=await fixture(t);const lid='666666@lid';f.store.linkWallet(A,P,lid);
 const economy=require('../src/services/economy').createEconomy(f.api);
 assert.throws(()=>context.run(A,()=>economy.transfer(P,lid,20)),/si mesmo/);
 assert.equal(balance(f.raw,A,P),600);
});
test('multiple players roll back together if a late wallet update fails',async t=>{
 const f=await fixture(t);
 const {registerPlayer}=await import('../addons/alcateia/src/game/players.js');
 await f.store.scoped(A).transactionGame(game=>registerPlayer(game,{jid:Q,number:Q.split('@')[0]}));
 await assert.rejects(f.store.scoped(A).transactionGame(game=>{game.players[P].coins-=100;game.players[Q].coins=Number.MAX_SAFE_INTEGER+1;}));
 assert.equal(balance(f.raw,A,P),600);assert.equal(balance(f.raw,A,Q),100);
});
