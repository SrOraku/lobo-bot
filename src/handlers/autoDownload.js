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
 'open.spotify.com':['spotify','Spotify'],
 'soundcloud.com':['soundcloud','SoundCloud'],'www.soundcloud.com':['soundcloud','SoundCloud'],'m.soundcloud.com':['soundcloud','SoundCloud'],'on.soundcloud.com':['soundcloud','SoundCloud'],
 'ifunny.co':['ifunny','iFunny'],'www.ifunny.co':['ifunny','iFunny'],
});
const domains=Object.keys(HOSTS).sort((a,b)=>b.length-a.length).map(host=>host.replaceAll('.','\\.')).join('|');
function detectSocialLink(text) {
 const source=String(text||'').slice(0,20000);
 const pattern=new RegExp('(?:https?:\\/\\/|(?<![\\w@.-])(?:'+domains+'))[^\\s<>"`]*','gi');
 for(const match of source.matchAll(pattern)) {
  const candidate=match[0].replace(/[)\]},.;!]+$/g,'');
  let url;try{url=new URL(/^https?:\/\//i.test(candidate)?candidate:'https://'+candidate);}catch{continue;}
  const entry=HOSTS[url.hostname.toLowerCase()];
  if(!entry||url.username||url.password||url.port||!['http:','https:'].includes(url.protocol)||url.pathname==='/')continue;
  const [name,platform]=entry;
  // Avoid wasting paid calls on profile/channel/home pages.
  if(name==='instagram'&&!/^\/(?:p|reel|reels|tv|stories)\//i.test(url.pathname))continue;
  if(name==='twitter_video'&&!/\/status\/\d+/i.test(url.pathname))continue;
  if(name==='play_video'&&url.hostname!=='youtu.be'&&!((url.pathname==='/watch'&&url.searchParams.has('v'))||/^\/(shorts|live)\//.test(url.pathname)))continue;
  if(name==='spotify'&&!/^\/(?:intl-[a-z-]+\/)?(?:track|episode)\//i.test(url.pathname))continue;
  if(name==='threads'&&!/\/post\//i.test(url.pathname))continue;
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
 const entries=new Map();
 const ready=ctx=>enabled(ctx.jid)&&active(ctx.jid)&&configured();
 async function handle(sock,msg,ctx) {
  if(!ctx.sender||!ctx.isGroup||!ctx.jid?.endsWith('@g.us')||msg.key?.fromMe||ctx.user?.muted||ctx.user?.banned||!ctx.body||ctx.body.startsWith(prefix())||!msg.key?.id||!ready(ctx))return false;
  const link=detectSocialLink(ctx.body);if(!link)return false;
  const timestamp=now();
  for(const [key,until]of entries)if(until<=timestamp)entries.delete(key);
  const seen='message:'+ctx.jid+':'+msg.key.id,user='user:'+ctx.jid+':'+ctx.sender,group='group:'+ctx.jid;
  if(entries.has(seen)||entries.has(user)||entries.has(group)||entries.size+3>maxEntries)return false;
  entries.set(seen,timestamp+15*60000);entries.set(user,timestamp+30000);entries.set(group,timestamp+10000);
  const next={...ctx,msg,args:[link.url],command:link.definition.name,autoDownload:true};
  // Check again inside the shared download queue if an admin disables the feature while waiting.
  if(dispatch)await dispatch(sock,next,link.definition);
  else await require('../integrations/bronxys/handler').queuedHandler(link.definition,{shouldRun:ready})(sock,next);
  return true;
 }
 return {handle,entries};
}
let service;
async function handleAutoDownload(sock,msg,ctx) {return (service ||= createAutoDownload()).handle(sock,msg,ctx);}
module.exports={HOSTS,detectSocialLink,createAutoDownload,handleAutoDownload};
