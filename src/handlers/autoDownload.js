'use strict';
const {definitions}=require('../integrations/bronxys/catalog');
const HOSTS=Object.freeze({
 'instagram.com':['instagram','Instagram'],'www.instagram.com':['instagram','Instagram'],'m.instagram.com':['instagram','Instagram'],
 'facebook.com':['face_video','Facebook'],'www.facebook.com':['face_video','Facebook'],'m.facebook.com':['face_video','Facebook'],'web.facebook.com':['face_video','Facebook'],'fb.watch':['face_video','Facebook'],
 'tiktok.com':['tiktok_video','TikTok'],'www.tiktok.com':['tiktok_video','TikTok'],'m.tiktok.com':['tiktok_video','TikTok'],'vm.tiktok.com':['tiktok_video','TikTok'],'vt.tiktok.com':['tiktok_video','TikTok'],
 'kwai.com':['kwai','Kwai'],'www.kwai.com':['kwai','Kwai'],'m.kwai.com':['kwai','Kwai'],'s.kwai.app':['kwai','Kwai'],'v.kwai.com':['kwai','Kwai'],
 'threads.net':['threads','Threads'],'www.threads.net':['threads','Threads'],'threads.com':['threads','Threads'],'www.threads.com':['threads','Threads'],
 'twitter.com':['twitter_video','X/Twitter'],'www.twitter.com':['twitter_video','X/Twitter'],'mobile.twitter.com':['twitter_video','X/Twitter'],'x.com':['twitter_video','X/Twitter'],'www.x.com':['twitter_video','X/Twitter'],
 'youtube.com':['play_video','YouTube'],'www.youtube.com':['play_video','YouTube'],'m.youtube.com':['play_video','YouTube'],'music.youtube.com':['play_video','YouTube'],'youtu.be':['play_video','YouTube'],
 'open.spotify.com':['spotify','Spotify'],'spotify.link':['spotify','Spotify'],
 'soundcloud.com':['soundcloud','SoundCloud'],'www.soundcloud.com':['soundcloud','SoundCloud'],'m.soundcloud.com':['soundcloud','SoundCloud'],'on.soundcloud.com':['soundcloud','SoundCloud'],
 'ifunny.co':['ifunny','iFunny'],'www.ifunny.co':['ifunny','iFunny'],
});
const domains=Object.keys(HOSTS).sort((a,b)=>b.length-a.length).map(host=>host.replaceAll('.','\\.')).join('|');
function detectSocialLink(text) {
 const source=String(text||'').slice(0,20000).replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'');
 const pattern=new RegExp('(?:(?<![a-z0-9@])https?:\\/\\/|(?<![a-z0-9@./:-])(?:'+domains+'))[^\\s<>"`]*','gi');
 for(const match of source.matchAll(pattern)) {
  let candidate=match[0].replace(/[)\]},.;!]+$/g,'');
  // WhatsApp formatting around a link is presentation, not part of the post ID.
  const before=source.slice(0,match.index).match(/[*_~]+$/)?.[0]||'';
  for(const marker of before.split('').reverse())if(candidate.endsWith(marker))candidate=candidate.slice(0,-1);
  candidate=candidate.replace(/[)\]},.;!]+$/g,'');
  let url;try{url=new URL(/^https?:\/\//i.test(candidate)?candidate:'https://'+candidate);}catch{continue;}
  const entry=HOSTS[url.hostname.toLowerCase()];
  if(!entry||url.username||url.password||url.port||!['http:','https:'].includes(url.protocol)||url.pathname==='/')continue;
  const [name,platform]=entry;
  // Avoid wasting paid calls on profile/channel/home pages.
  if(name==='instagram'&&!/^\/(?:p|reel|reels|tv|stories|share\/(?:reel|p))\/[^/]+/i.test(url.pathname))continue;
  if(name==='twitter_video'&&!/\/status\/\d+/i.test(url.pathname))continue;
  if(name==='play_video'&&url.hostname!=='youtu.be'&&!((url.pathname==='/watch'&&url.searchParams.has('v'))||/^\/(shorts|live)\//.test(url.pathname)))continue;
  if(name==='spotify'&&url.hostname!=='spotify.link'&&!/^\/(?:intl-[a-z-]+\/)?(?:track|episode)\//i.test(url.pathname))continue;
  if(name==='threads'&&!/\/post\//i.test(url.pathname))continue;
  if(name==='tiktok_video'&&!['vm.tiktok.com','vt.tiktok.com'].includes(url.hostname)&&!/^\/(?:@[^/]+\/(?:video|photo)\/[^/]+|t\/[^/]+)/i.test(url.pathname))continue;
  if(name==='face_video'&&url.hostname!=='fb.watch'&&!((/^\/watch\/?$/i.test(url.pathname)&&url.searchParams.get('v'))||/^\/(?:reel|reels|share\/(?:v|r|p))\/[^/]+/i.test(url.pathname)||/\/(?:videos|posts)\/[^/]+/i.test(url.pathname)||(/^\/(?:story|permalink)\.php$/i.test(url.pathname)&&url.searchParams.get('story_fbid'))))continue;
  if(name==='soundcloud'&&url.hostname!=='on.soundcloud.com'&&!/^\/[^/]+\/[^/]+/.test(url.pathname))continue;
  const definition=definitions.find(def=>def.name===name);
  if(definition)return {definition,url:url.href,platform};
 }
 return null;
}
function createAutoDownload({
 enabled=jid=>require('../activations/manager').manager.isEnabled(jid,'autodownload'),
 active=jid=>require('../activations/store').getStore().get(jid).bot,
 configured=()=>!!require('../integrations/bronxys/key').getKey(),
 prefix=()=>require('../config').get('PREFIX'),
 now=Date.now,maxEntries=10000,
 dispatch,
}={}) {
 const entries=new Map(),notices=new Map();
 const ready=ctx=>{try{return enabled(ctx.jid)&&active(ctx.jid)&&configured();}catch{return false;}};
 async function feedback(send) {
  let timer;
  try{await Promise.race([Promise.resolve().then(send),new Promise(resolve=>{timer=setTimeout(resolve,1000);})]);}catch{/* Optional feedback cannot prevent a download or block the message pipeline. */}
  finally{clearTimeout(timer);}
 }
 async function notify(sock,msg,ctx,reason,text) {
  const timestamp=now(),key=ctx.jid+':'+reason;
  for(const [id,until]of notices)if(until<=timestamp)notices.delete(id);
  if(notices.has(key)||notices.size>=maxEntries)return;
  notices.set(key,timestamp+60000);
  await feedback(()=>sock.sendMessage?.(ctx.jid,{text},{quoted:msg}));
 }
 async function react(sock,msg,ctx,text) {
  await feedback(()=>sock.sendMessage?.(ctx.jid,{react:{text,key:msg.key}}));
 }
 async function handle(sock,msg,ctx) {
  if(!ctx.sender||!ctx.isGroup||!ctx.jid?.endsWith('@g.us')||msg.key?.fromMe||ctx.user?.muted||ctx.user?.banned||!ctx.body||ctx.body.startsWith(prefix())||!msg.key?.id||!enabled(ctx.jid)||!active(ctx.jid))return false;
  const link=detectSocialLink(ctx.body);if(!link)return false;
  let hasKey=false;
  try{hasKey=configured();}catch{
   await notify(sock,msg,ctx,'key','⚠️ Não consegui ler a configuração privada da API. O dono pode conferir '+prefix()+'apibronxys status no privado.');return true;
  }
  if(!hasKey){await notify(sock,msg,ctx,'key','⚠️ O download automático está ligado, mas falta configurar a API Bronxys nesta instalação. O dono deve usar '+prefix()+'apibronxys status no privado. A chave salva em data/bronxys-api-key é reutilizada nos próximos inícios.');return true;}
  const timestamp=now();
  for(const [key,until]of entries)if(until<=timestamp)entries.delete(key);
  const seen='message:'+ctx.jid+':'+msg.key.id,user='user:'+ctx.jid+':'+ctx.sender,group='group:'+ctx.jid;
  if(entries.has(seen))return true;
  if(entries.has(user)||entries.has(group)||entries.size+3>maxEntries){
   const seconds=Math.max(1,Math.ceil((Math.max(entries.get(user)||timestamp,entries.get(group)||timestamp)-timestamp)/1000));
   await notify(sock,msg,ctx,'limit',entries.size+3>maxEntries?'⏳ A fila de downloads automáticos está ocupada. Reenvie o link em instantes.':'⏳ Aguarde '+seconds+' segundos e reenvie o link para baixar automaticamente.');return true;
  }
  entries.set(seen,timestamp+15*60000);entries.set(user,timestamp+30000);entries.set(group,timestamp+10000);
  const next={...ctx,msg,args:[link.url],command:link.definition.name,autoDownload:true};
  // Check again inside the shared download queue if an admin disables the feature while waiting.
  await react(sock,msg,ctx,'⏳');
  let result;
  try {
   result=dispatch?await dispatch(sock,next,link.definition):await require('../integrations/bronxys/handler').queuedHandler(link.definition,{shouldRun:ready})(sock,next);
  } catch {
   result={ok:false};await notify(sock,msg,ctx,'failure','⚠️ Não consegui concluir o download agora. Reenvie o link em alguns segundos.');
  }
  if(result?.ok!==false&&!(result?.ok===true&&Number.isSafeInteger(result.mediaCount)&&result.mediaCount>0)) {
   result={ok:false};await notify(sock,msg,ctx,'failure','⚠️ O baixador não confirmou o envio da mídia. Reenvie o link em alguns segundos.');
  }
  if(result?.ok===false) {
   // Failed/skipped jobs may be retried after a short backoff. Keep partial albums deduplicated.
   if(!result.mediaCount)entries.set(seen,now()+10000);
   await react(sock,msg,ctx,result.code==='BRONXYS_SKIPPED'?'':'⚠️');
  } else await react(sock,msg,ctx,'✅');
  return true;
 }
 return {handle,entries};
}
let service;
async function handleAutoDownload(sock,msg,ctx) {return (service ||= createAutoDownload()).handle(sock,msg,ctx);}
module.exports={HOSTS,detectSocialLink,createAutoDownload,handleAutoDownload};
