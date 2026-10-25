'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {detectSocialLink,createAutoDownload}=require('../src/handlers/autoDownload');
const links=[
 ['https://www.instagram.com/reel/ABC/','instagram'],['https://www.facebook.com/watch/?v=123','face_video'],
 ['https://vm.tiktok.com/ABC/','tiktok_video'],['https://s.kwai.app/s/ABC','kwai'],
 ['https://www.threads.net/@user/post/ABC','threads'],['https://x.com/user/status/123','twitter_video'],
 ['https://youtu.be/abcd','play_video'],['https://open.spotify.com/track/123','spotify'],
 ['https://soundcloud.com/artist/song','soundcloud'],['https://ifunny.co/video/123','ifunny'],
];
test('detects supported social networks by exact hostname without pretending to support other sites',()=>{
 for(const [url,command]of links)assert.equal(detectSocialLink('Confira '+url)?.definition.name,command);
 assert.equal(detectSocialLink('www.instagram.com/reel/ABC/')?.definition.name,'instagram');
 assert.equal(detectSocialLink('kwai.com/d/abc')?.definition.name,'kwai');
 for(const url of ['https://instagram.com.evil.test/reel/ABC','https://evil.test/?url=https%3A%2F%2Finstagram.com','https://www.instagram.com/user','https://youtube.com/@channel','https://pinterest.com/pin/123','http://127.0.0.1/video','file:///etc/passwd','https://user:secret@instagram.com/reel/abc'])assert.equal(detectSocialLink(url),null,url);
});
function fixture() {
 let clock=0,on=new Set(['123@g.us','456@g.us']),active=true,configured=true;const calls=[];
 const service=createAutoDownload({now:()=>clock,enabled:jid=>on.has(jid),active:()=>active,configured:()=>configured,prefix:()=> '!',dispatch:async(sock,ctx,def)=>calls.push({ctx,def})});
 const ctx={jid:'123@g.us',sender:'1@s.whatsapp.net',isGroup:true,body:links[0][0],user:{}};
 const msg=id=>({key:{id}});return {service,calls,ctx,msg,setClock:value=>clock=value,setOn:value=>on=value,setActive:value=>active=value,setConfigured:value=>configured=value};
}
test('automatic download needs active group setting and API key and ignores own, muted and command messages',async()=>{
 const f=fixture(),run=(id,ctx=f.ctx,msg=f.msg(id))=>f.service.handle({},msg,ctx);
 f.setOn(new Set());assert.equal(await run('off'),false);f.setOn(new Set([f.ctx.jid]));
 f.setConfigured(false);assert.equal(await run('key'),false);f.setConfigured(true);
 f.setActive(false);assert.equal(await run('paused'),false);f.setActive(true);
 assert.equal(await run('muted',{...f.ctx,user:{muted:1}}),false);
 assert.equal(await run('command',{...f.ctx,body:'!play '+links[0][0]}),false);
 assert.equal(await run('own',f.ctx,{key:{id:'own',fromMe:true}}),false);
 assert.equal(await run('private',{...f.ctx,isGroup:false,jid:'1@s.whatsapp.net'}),false);
 assert.equal(await run('ok'),true);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].ctx.args,[links[0][0]]);
});
test('dedup, limits and group isolation avoid repeated API usage',async()=>{
 const f=fixture();await f.service.handle({},f.msg('a'),f.ctx);assert.equal(await f.service.handle({},f.msg('b'),f.ctx),false);
 assert.equal(await f.service.handle({},f.msg('a'),{...f.ctx,jid:'456@g.us'}),true);
 f.setClock(31000);assert.equal(await f.service.handle({},f.msg('a'),f.ctx),false);
 assert.equal(await f.service.handle({},f.msg('c'),f.ctx),true);assert.equal(f.calls.length,3);
 f.setClock(16*60000);await f.service.handle({},f.msg('d'),f.ctx);assert.ok(f.service.entries.size<=3);
});
test('one message with multiple links triggers only the first supported download',async()=>{
 const f=fixture();await f.service.handle({},f.msg('a'),{...f.ctx,body:links[0][0]+' '+links[1][0]});assert.equal(f.calls.length,1);assert.equal(f.calls[0].def.name,'instagram');
});
test('activation number uses shared manager, confirms 1, cancels 2 and persists only selected group',async t=>{
 const Database=require('better-sqlite3'),{runMigrations}=require('../src/config/migrations'),{createPolicyStore}=require('../src/activations/store'),{createInteraction}=require('../src/activations/interaction');
 const db=new Database(':memory:');t.after(()=>db.close());runMigrations(db);const store=createPolicyStore(db);
 const ui=createInteraction({store,resolveActor:async()=>({admin:true,botAdmin:false,phone:'admin'})});
 const rows=require('../src/activations/registry').list().filter(f=>f.source!=='sector'),number=rows.findIndex(f=>f.id==='autodownload')+1;
 assert.equal(rows[number-1].default,false);assert.equal(rows[number-1].bulkSafe,false);
 const sent=[],sock={sendMessage:async(jid,data)=>sent.push(data.text)},ctx={jid:'123@g.us',sender:'1@s.whatsapp.net',msg:{key:{id:'open'}}};
 ui.open(ctx);ctx.msg.key.id='select';await ui.handle(sock,ctx,String(number));assert.ok(sent.at(-1).includes('*1* — Sim'));
 ctx.msg.key.id='cancel';await ui.handle(sock,ctx,'2');assert.equal(store.get(ctx.jid).features.autodownload,false);
 ui.open(ctx);ctx.msg.key.id='select2';await ui.handle(sock,ctx,String(number));ctx.msg.key.id='yes';await ui.handle(sock,ctx,'1');
 assert.equal(store.get(ctx.jid).features.autodownload,true);assert.equal(store.get('456@g.us').features.autodownload,false);
 assert.equal(createPolicyStore(db).get(ctx.jid).features.autodownload,true);
});
test('message pipeline applies protection before automatic downloads and keeps prefixed commands separate',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),module={exports:{}},calls=[];let blocked=true;
 const replacements={
  '../automation/anti-pv':{createAntiPV:()=>({handle:async()=>false})},'../games/gartic':{gartic:()=>({guess:async()=>null})},'../progression/service':{progression:()=>({touch(){},refresh:()=>[]})},
  '../services/universal-currency':{linkMessageWallet:async()=>{}},
  '../integrations/control-center':{controlCenter:()=>({authorizeGroup:async()=>({allowed:true,status:'disabled'}),notifyDenied:async()=>false})},
  dotenv:{config(){}},'../utils/helpers':{cleanJid:j=>j,getNumber:j=>j.split('@')[0],PREFIX:'!',logger:{error(){}},BOT_NAME:'Lobo'},
  '../utils/database':{upsertUser(){},getUser:()=>({}),upsertActivity(){},upsertGroup(){},getGroup:()=>({name:'Grupo de teste'})},
  '../core/eventBus':{bus:{emit(){}},EVENTS:{}},'../core/commandRegistry':{execute:async(_name,_sock,ctx)=>{calls.push('command');assert.equal(ctx.groupName,'Grupo de teste');}},
  './protection':{handleProtection:async()=>{calls.push('protection');return blocked;}},
  './autoReply':{handleAutoReply:async()=>calls.push('reply')},'./xp':{handleXP:async()=>{}},
  './autoDownload':{handleAutoDownload:async()=>{calls.push('download');return true;}},
  '../isolation/context':{run:(jid,callback)=>callback()},
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/handlers/message.js'),'utf8'),{module,require:name=>{if(!replacements[name])throw Error(name);return replacements[name];}});
 const msg={key:{remoteJid:'123@g.us',participant:'1@s.whatsapp.net',id:'msg'},message:{conversation:links[0][0]}};
 await module.exports.handleMessage({},msg);assert.deepEqual(calls,['protection']);
 blocked=false;calls.length=0;await module.exports.handleMessage({},msg);assert.deepEqual(calls,['protection','download']);
 calls.length=0;await module.exports.handleMessage({},{...msg,message:{conversation:'!play vídeo'}});assert.deepEqual(calls,['protection','command']);
});
test('queued download is skipped if the feature was disabled while waiting',async()=>{
 let calls=0;const handler=require('../src/integrations/bronxys/handler').queuedHandler(require('../src/integrations/bronxys/catalog').definitions.find(d=>d.name==='play'),{shouldRun:()=>false,client:{configured:()=>{calls++;return true;}}});
 await handler({sendMessage:async()=>calls++},{jid:'123@g.us',args:['música'],msg:{}});assert.equal(calls,0);
});
