'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {runMigrations}=require('../src/config/migrations');
const {createEconomy,isPremium}=require('../src/services/economy');
function fixture(t) {
 const db=new Database(':memory:');runMigrations(db);t.after(()=>db.close());let time=1800000000000;
 const api={db,getUser:j=>db.prepare('SELECT * FROM users WHERE jid=?').get(j),setPremium:(j,v,e)=>db.prepare('UPDATE users SET premium=?,premium_until=? WHERE jid=?').run(v,e,j),addXP:(j,a)=>db.prepare('UPDATE users SET xp=xp+? WHERE jid=?').run(a,j),logGoldTransaction:(f,to,a,r)=>db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES (?,?,?,?)').run(f,to,a,r)};
 db.prepare('INSERT INTO users(jid,gold) VALUES (?,?)').run('1@s.whatsapp.net',10000);
 return {db,api,service:createEconomy(api,{now:()=>time,scope:()=> '123@g.us'}),advance:ms=>time+=ms,now:()=>time};
}
test('transfer ensures recipient and commits both balances and ledger exactly once',t=>{
 const f=fixture(t);f.service.transfer('1@s.whatsapp.net','2@s.whatsapp.net',500,'a');
 assert.equal(f.api.getUser('1@s.whatsapp.net').gold,9500);assert.equal(f.api.getUser('2@s.whatsapp.net').gold,1000);
 assert.throws(()=>f.service.transfer('1@s.whatsapp.net','2@s.whatsapp.net',500,'a'),/processada/);
 assert.equal(f.db.prepare('SELECT count(*) n FROM gold_transactions').get().n,1);
});
test('ledger failure rolls back recipient creation and debit',t=>{
 const f=fixture(t);f.api.logGoldTransaction=()=>{throw Error('ledger unavailable');};
 assert.throws(()=>f.service.transfer('1@s.whatsapp.net','2@s.whatsapp.net',500,'b'),/unavailable/);
 assert.equal(f.api.getUser('1@s.whatsapp.net').gold,10000);assert.equal(f.api.getUser('2@s.whatsapp.net'),undefined);
});
test('two queued transfers cannot overspend the same balance',async t=>{
 const f=fixture(t);const results=await Promise.allSettled([1,2].map(n=>Promise.resolve().then(()=>f.service.transfer('1@s.whatsapp.net','2@s.whatsapp.net',7000,'t'+n))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.api.getUser('1@s.whatsapp.net').gold,3000);assert.equal(f.api.getUser('2@s.whatsapp.net').gold,7500);
});
test('premium extends remaining time and expires without cron',t=>{
 const f=fixture(t);f.service.buy('1@s.whatsapp.net',{id:1,price:2000},'p1');f.advance(3*86400000);f.service.buy('1@s.whatsapp.net',{id:1,price:2000},'p2');
 assert.equal(Date.parse(f.api.getUser('1@s.whatsapp.net').premium_until)-f.now(),11*86400000);
 assert.ok(isPremium(f.api.getUser('1@s.whatsapp.net'),f.now()));f.advance(12*86400000);assert.equal(isPremium(f.api.getUser('1@s.whatsapp.net'),f.now()),false);
});
test('boost shield and daily survive service recreation and expire',t=>{
 const f=fixture(t);f.service.buy('1@s.whatsapp.net',{id:4,price:500},'x');f.service.buy('1@s.whatsapp.net',{id:5,price:300},'s');
 const reopened=createEconomy(f.api,{now:f.now,scope:()=> '123@g.us'});
 assert.equal(reopened.activeEffect('1@s.whatsapp.net','xp').multiplier,3);assert.ok(reopened.activeEffect('1@s.whatsapp.net','shield'));
 assert.ok(reopened.daily('1@s.whatsapp.net','d').success);assert.equal(reopened.daily('1@s.whatsapp.net','e').success,false);
 f.advance(86400001);assert.equal(reopened.activeEffect('1@s.whatsapp.net','xp'),undefined);assert.equal(reopened.activeEffect('1@s.whatsapp.net','shield'),undefined);assert.ok(reopened.daily('1@s.whatsapp.net','f').success);
});
test('title purchase is persisted and invalid item rolls back debit',t=>{
 const f=fixture(t);f.service.buy('1@s.whatsapp.net',{id:6,price:5000},'title');assert.equal(f.service.titles('1@s.whatsapp.net')[0].title_id,'alfa-lua');
 assert.throws(()=>f.service.buy('1@s.whatsapp.net',{id:99,price:1},'bad'),/inválido/);assert.equal(f.api.getUser('1@s.whatsapp.net').gold,5000);
});
test('effects and daily cooldown are isolated by chat and migration reruns preserve balances',t=>{
 const f=fixture(t);f.service.buy('1@s.whatsapp.net',{id:5,price:300},'shield');
 const other=createEconomy(f.api,{now:f.now,scope:()=> '456@g.us'});
 assert.equal(other.activeEffect('1@s.whatsapp.net','shield'),undefined);
 assert.ok(f.service.daily('1@s.whatsapp.net','daily-a').success);assert.ok(other.daily('1@s.whatsapp.net','daily-b').success);
 const before=f.api.getUser('1@s.whatsapp.net').gold;runMigrations(f.db);assert.equal(f.api.getUser('1@s.whatsapp.net').gold,before);
});
test('unsafe, fractional, negative and self transfers never mutate the balance',t=>{
 const f=fixture(t);for(const value of [-1,0,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>f.service.transfer('1@s.whatsapp.net','2@s.whatsapp.net',value));
 assert.throws(()=>f.service.transfer('1@s.whatsapp.net','1@s.whatsapp.net',1));assert.equal(f.api.getUser('1@s.whatsapp.net').gold,10000);
});
function xpHandler(f) {
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),module={exports:{}};
 f.api.addGold=(jid,value)=>f.db.prepare('UPDATE users SET gold=gold+? WHERE jid=?').run(value,jid);
 f.api.addXP=(jid,value)=>{const user=f.api.getUser(jid),xp=user.xp+value,level=Math.floor(0.1*Math.sqrt(xp))+1;f.db.prepare('UPDATE users SET xp=?,level=? WHERE jid=?').run(xp,level,jid);return {oldLevel:user.level,newLevel:level,rank:'Teste'};};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/handlers/xp.js'),'utf8'),{module,Date,require:name=>{
  if(name==='../utils/database')return f.api;
  if(name==='../config')return {getNumber:key=>({XP_PER_MESSAGE:5,XP_PREMIUM_MULTIPLIER:2,XP_COOLDOWN_SEC:30})[key]};
  if(name==='../activations/manager')return {manager:{isEnabled:()=>true}};
  if(name==='../isolation/context')return {current:()=> '123@g.us'};
  if(name==='../services/economy')return {economy:()=>f.service,isPremium};
  if(name==='../utils/helpers')return {logger:{error(){}}};
  throw Error('Unexpected dependency: '+name);
 }});return module.exports.handleXP;
}
test('message XP applies persistent boost and commits level reward despite failed notification',async t=>{
 const f=fixture(t);f.service.buy('1@s.whatsapp.net',{id:4,price:500},'boost-xp');f.db.prepare('UPDATE users SET xp=95,level=1 WHERE jid=?').run('1@s.whatsapp.net');
 await xpHandler(f)({sendMessage:async()=>{throw Error('offline');}}, {}, {jid:'123@g.us',sender:'1@s.whatsapp.net'});
 assert.equal(f.api.getUser('1@s.whatsapp.net').xp,110);assert.equal(f.api.getUser('1@s.whatsapp.net').gold,9550);
});
test('XP ledger failure rolls back cooldown, XP and level bonus',async t=>{
 const f=fixture(t);f.db.prepare('UPDATE users SET xp=95,level=1 WHERE jid=?').run('1@s.whatsapp.net');f.api.logGoldTransaction=()=>{throw Error('ledger unavailable');};
 await xpHandler(f)({sendMessage:async()=>{}}, {}, {jid:'123@g.us',sender:'1@s.whatsapp.net'});
 assert.equal(f.api.getUser('1@s.whatsapp.net').xp,95);assert.equal(f.db.prepare("SELECT count(*) n FROM persistent_cooldowns WHERE action='xp'").get().n,0);
});
