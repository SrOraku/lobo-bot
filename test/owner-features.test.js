'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {runMigrations}=require('../src/config/migrations');
const {createSettings}=require('../src/security/settings');
const {applyDonation}=require('../src/security/wok-donation');
test('cadastro de donos persiste, tem auditoria e mantém cache após falha de escrita', t=>{
  const db=new Database(':memory:');t.after(()=>db.close());runMigrations(db);
  const settings=createSettings(db);
  settings.set('owners',['5511999999999'],'owner','owners.adicionar');
  assert.deepEqual(createSettings(db).get('owners',[]),['5511999999999']);
  const clone=settings.get('owners',[]);clone.push('fake');assert.equal(settings.get('owners',[]).length,1);
  db.exec("CREATE TRIGGER fail_settings BEFORE UPDATE ON bot_settings BEGIN SELECT RAISE(ABORT,'test failure'); END");
  assert.throws(()=>settings.set('owners',[],'owner'));
  assert.deepEqual(settings.get('owners',[]),['5511999999999']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM security_audit').get().n,1);
});
test('doação exige dono, valida limites e saldo, registra emissão e não duplica', ()=>{
  const actor='5543920030769@s.whatsapp.net',target='5511999999999@s.whatsapp.net';
  const game={players:{[target]:{coins:100,banned:false}},donations:{}};
  const request={actor,target,amount:50,event:'message-id',now:1};
  assert.throws(()=>applyDonation(game,request,[]),/donos/);
  for(const amount of [-1,0,1.2,1000001]) assert.throws(()=>applyDonation(game,{...request,amount},[actor.split('@')[0]]));
  const result=applyDonation(game,request,[actor.split('@')[0]]);
  assert.equal(result.after,150);assert.equal(game.players[target].coins,150);
  assert.ok(applyDonation(game,request,[actor.split('@')[0]]).duplicate);
  assert.equal(game.players[target].coins,150);
  assert.throws(()=>applyDonation({players:{}},request,[actor.split('@')[0]]),/registrar/);
  game.players[target].coins=Number.MAX_SAFE_INTEGER;
  assert.throws(()=>applyDonation(game,{...request,event:'other'},[actor.split('@')[0]]),/limite seguro/);
});
test('painel de donos recusa membros e reserva cadastro ao principal',async t=>{
  const db=new Database(':memory:');t.after(()=>db.close());runMigrations(db);
  const settings=createSettings(db),sent=[];let actor={owner:false,phone:'5511999999999@s.whatsapp.net'};
  const file=require('node:path').join(__dirname,'../src/commands/owners.js');
  const native=require('node:module').createRequire(file),loaded={exports:{}};
  const mocks={'../activations/access':{resolveActor:async()=>actor},'../security/settings':settings};
  require('node:vm').runInNewContext(require('node:fs').readFileSync(file,'utf8'),{module:loaded,require:id=>mocks[id]||native(id)});
  const ctx={jid:'test',args:['adicionar','5511888888888'],msg:{}};
  const sock={sendMessage:async(_,c)=>sent.push(c.text)};
  await loaded.exports.owners(sock,ctx);assert.match(sent.at(-1),/exclusivo/);
  actor.owner=true;await loaded.exports.owners(sock,ctx);assert.match(sent.at(-1),/principal/);
  actor.phone='5543920030769@s.whatsapp.net';await loaded.exports.owners(sock,ctx);
  assert.deepEqual(settings.get('owners',[]),['5511888888888']);
});

test('antirroubo isola grupos, restaura mudança não autorizada e aceita autorizado',async t=>{
 const db=new Database(':memory:');t.after(()=>db.close());runMigrations(db);
 const service=require('../src/security/groups/service').createSecurity({db,owners:()=>['5543920030769'],botAdmin:()=>false});
 const guard=require('../src/security/group-guard').createGuard(service),A='1@g.us',B='2@g.us',bot='5511977777777@s.whatsapp.net',trusted='5511999999999@s.whatsapp.net',intruder='5511888888888@s.whatsapp.net';
 guard.save(A,{enabled:true,allowed:[trusted],subject:'Original',desc:'Regras',restrict:true,announce:false},'owner','enable');
 assert.equal(guard.get(B).enabled,false);
 const calls=[],meta={subject:'Modificado',participants:[{id:bot,admin:'admin'},{id:trusted,admin:'admin'},{id:intruder,admin:'admin'}]};
 const sock={user:{id:bot},groupMetadata:async()=>structuredClone(meta),groupUpdateSubject:async(_,value)=>{calls.push(value);meta.subject=value;},sendMessage:async()=>{}};
 await guard.enforce(sock,{id:A,author:intruder,subject:'Modificado'});
 assert.deepEqual(calls,['Original']);assert.equal(guard.get(A).subject,'Original');
 meta.subject='Novo nome';await guard.enforce(sock,{id:A,author:trusted,subject:'Novo nome'});
 assert.equal(guard.get(A).subject,'Novo nome');assert.equal(calls.length,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM group_audit_log').get().n,2);
});

test('menus enviam capa de foto/GIF com texto e fazem fallback sem apagar comandos',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path');
  const directory=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'lobo-menu-media-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const {sendMenu}=require('../src/menus/media');const messages=[];
  const sock={sendMessage:async(_,content)=>messages.push(content)},ctx={jid:'group',msg:{}};
  await fs.writeFile(path.join(directory,'abc.jpg'),'image fixture');
  await sendMenu(sock,ctx,'!menu jogos',{directory,getMedia:()=>({type:'image',file:'abc.jpg'})});
  assert.ok(Buffer.isBuffer(messages.at(-1).image));assert.equal(messages.at(-1).caption,'!menu jogos');
  await fs.writeFile(path.join(directory,'abc.mp4'),'video fixture');
  await sendMenu(sock,ctx,'!menu jogos',{directory,getMedia:()=>({type:'video',file:'abc.mp4'})});
  assert.equal(messages.at(-1).gifPlayback,true);
  await sendMenu(sock,ctx,'!menu jogos',{directory,getMedia:()=>({type:'image',file:'../secret.jpg'})});
  assert.equal(messages.at(-1).text,'!menu jogos');
  await sendMenu(sock,ctx,'!menu jogos',{directory,getMedia:()=>({type:'image',file:'missing.jpg'})});
  assert.equal(messages.at(-1).text,'!menu jogos');
});
