'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {detectSocialLink,createAutoDownload}=require('../src/handlers/autoDownload');

test('shared and formatted links arrive at the provider without WhatsApp markup or invisible suffixes',()=>{
 for(const [body,url,name]of [
  ['*https://www.instagram.com/share/reel/ABC/*','https://www.instagram.com/share/reel/ABC/','instagram'],
  ['_https://www.instagram.com/share/p/ABC/_','https://www.instagram.com/share/p/ABC/','instagram'],
  ['Veja (*https://x.com/user/status/123*).','https://x.com/user/status/123','twitter_video'],
  ['https://youtu.be/jNQXAC9IVRw\u200e','https://youtu.be/jNQXAC9IVRw','play_video'],
  ['www.instagram.com/reel/ABC/\u2069','https://www.instagram.com/reel/ABC/','instagram'],
  ['https://spotify.link/ABC','https://spotify.link/ABC','spotify'],
  ['https://www.facebook.com/share/v/ABC/','https://www.facebook.com/share/v/ABC/','face_video'],
  ['https://www.tiktok.com/@user/photo/123','https://www.tiktok.com/@user/photo/123','tiktok_video'],
  ['https://www.tiktok.com/t/ABC/','https://www.tiktok.com/t/ABC/','tiktok_video'],
  ['https://open.spotify.com/intl-pt/track/ABC?si=original','https://open.spotify.com/intl-pt/track/ABC?si=original','spotify'],
  ['Link:https://youtu.be/jNQXAC9IVRw','https://youtu.be/jNQXAC9IVRw','play_video'],
 ]){const result=detectSocialLink(body);assert.equal(result?.url,url,body);assert.equal(result.definition.name,name);}
});

test('profiles, embedded URLs, unsupported schemes and disguised domains never consume a paid download',()=>{
 for(const body of [
  'https://www.tiktok.com/@profile','https://soundcloud.com/artist','https://www.facebook.com/profile.php?id=123',
  'https://instagram.com.evil.test/reel/abc','https://user:password@instagram.com/reel/abc','ftp://instagram.com/reel/abc',
  'https://evil.test/?u=instagram.com/reel/abc','https://evil.test/instagram.com/reel/abc','test@instagram.com/reel/abc',
  'https://www.youtube.com/@channel','https://www.instagram.com/profile','https://www.facebook.com/watch/','https://www.facebook.com/reel/',
 ])assert.equal(detectSocialLink(body),null,body);
});

function fixture(){
 let time=0,key=true,outcome={ok:true,mediaCount:1},calls=0;
 const sent=[],ctx={jid:'123@g.us',sender:'1@s.whatsapp.net',isGroup:true,body:'https://www.instagram.com/reel/ABC/',user:{}};
 const msg=id=>({key:{id,remoteJid:ctx.jid,participant:ctx.sender}});
 const sock={sendMessage:async(jid,payload,options)=>sent.push({jid,payload,options})};
 const service=createAutoDownload({now:()=>time,enabled:()=>true,active:()=>true,configured:()=>{if(key instanceof Error)throw key;return key;},prefix:()=> '!',dispatch:async()=>{calls++;if(outcome instanceof Error)throw outcome;return outcome;}});
 return {service,sent,ctx,msg,sock,run:id=>service.handle(sock,msg(id),ctx),setTime:value=>time=value,setKey:value=>key=value,setOutcome:value=>outcome=value,calls:()=>calls};
}

test('missing/unreadable key is explained once per minute without provider calls or secret leakage',async()=>{
 const f=fixture();f.setKey(false);
 await f.run('a');await f.run('b');
 assert.equal(f.calls(),0);assert.equal(f.sent.length,1);assert.match(f.sent[0].payload.text,/apibronxys status/);
 f.setTime(61000);f.setKey(Error('private-secret-fixture'));await f.run('c');
 assert.equal(f.sent.length,2);assert.match(f.sent[1].payload.text,/configuração privada/);
 assert.ok(!JSON.stringify(f.sent).includes('private-secret-fixture'));
 f.setKey(true);await f.run('d');assert.equal(f.calls(),1);
});

test('cooldown drops are visible, rate limited and never dispatch a second job early',async()=>{
 const f=fixture();await f.run('a');await f.run('b');await f.run('c');
 assert.equal(f.calls(),1);const notices=f.sent.filter(item=>item.payload.text);assert.equal(notices.length,1);assert.match(notices[0].payload.text,/30 segundos/);
 f.setTime(31000);await f.run('d');assert.equal(f.calls(),2);
 assert.deepEqual(f.sent.filter(item=>item.payload.react).map(item=>item.payload.react.text),['⏳','✅','⏳','✅']);
});

test('failed jobs can be retried after backoff while successful and partially delivered posts stay deduplicated',async()=>{
 for(const outcome of [{ok:false,mediaCount:0,code:'BRONXYS_QUEUE'},Error('secret-error-fixture')]){
  const f=fixture();f.setOutcome(outcome);await f.run('a');await f.run('a');assert.equal(f.calls(),1);
  assert.ok(!JSON.stringify(f.sent).includes('secret-error-fixture'));
  assert.ok(!f.sent.some(item=>item.payload.react?.text==='✅'));
  f.setTime(31000);f.setOutcome({ok:true,mediaCount:1});await f.run('a');assert.equal(f.calls(),2);
  f.setTime(62000);await f.run('a');assert.equal(f.calls(),2);
 }
 const partial=fixture();partial.setOutcome({ok:false,mediaCount:1,code:'BRONXYS_AUTH'});await partial.run('a');
 partial.setTime(31000);await partial.run('a');assert.equal(partial.calls(),1);
});

test('an empty/unknown download result never produces a success reaction',async()=>{
 for(const result of [undefined,true,{ok:true,mediaCount:0}]){
  const f=fixture();f.setOutcome(result);await f.run('a');
  assert.ok(!f.sent.some(item=>item.payload.react?.text==='✅'));
  assert.ok(f.sent.some(item=>item.payload.text?.includes('não confirmou')));
 }
});

test('unresponsive optional reactions and notices do not trap automatic processing',async()=>{
 const f=fixture();
 const handled=await f.service.handle({sendMessage:()=>new Promise(()=>{})},f.msg('a'),f.ctx);
 assert.equal(handled,true);assert.equal(f.calls(),1);
 f.setKey(false);
 assert.equal(await f.service.handle({sendMessage:()=>new Promise(()=>{})},f.msg('b'),f.ctx),true);
});
