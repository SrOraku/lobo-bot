'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {promisify}=require('node:util');
const execFile=promisify(require('node:child_process').execFile);
const {createClient,MAX_BYTES,publicURL}=require('./client');
const {definitions}=require('./catalog');
const {filename}=require('../../commands/youtube-media');
const {KeyedQueue}=require('../../core/keyed-queue');
const {command,numericText}=require('../../ui/text');
const queue=new KeyedQueue({maxKeys:100,maxPending:5});
const errors={BRONXYS_KEY:'A API Bronxys ainda não foi configurada. O dono pode usar apibronxys no privado.',BRONXYS_AUTH:'A API recusou a chave. Confira a configuração e a validade no painel Bronxys.',BRONXYS_QUOTA:'A API limitou as requisições ou a cota terminou. Confira seu painel.',BRONXYS_URL:'Informe um link público válido da plataforma.',BRONXYS_TIMEOUT:'O serviço demorou demais. Tente novamente.',BRONXYS_MEDIA:'A API não entregou um arquivo de mídia válido ou ele excedeu 32 MB.',BRONXYS_SERVICE:'Não foi possível acessar o serviço Bronxys. Tente mais tarde.'};
function formatJSON(value,key='',depth=0) {
 if(depth>5)return '';
 if(value==null)return '';
 if(typeof value!=='object')return (key?key+': ':'')+String(value);
 if(Array.isArray(value))return value.slice(0,20).map((item,index)=>formatJSON(item,String(index+1),depth+1)).join('\n\n');
 return Object.entries(value).filter(([name])=>!['apikey','api_key','token','key','cookie','cookies'].includes(name.toLowerCase())).map(([name,item])=>formatJSON(item,name,depth+1)).filter(Boolean).join('\n');
}
function safeText(text,key) {return String(text).replace(/([?&](?:apikey|api_key|token)=)[^\s&]+/gi,'$1[protegido]').split(key||'\u0000').join('[chave protegida]').slice(0,12000);}
// Some social posts contain photos even on endpoints normally used for video.
// CDN responses can also omit a useful content type; inspect common containers
// before selecting the WhatsApp payload instead of labelling every file MP4.
function socialMediaType(mime,bytes) {
 const type=String(mime||'').split(';')[0].trim().toLowerCase();
 if(type.startsWith('image/')||type.startsWith('video/'))return type;
 if(type&& !['application/octet-stream','binary/octet-stream','application/binary'].includes(type))throw Error('BRONXYS_MEDIA');
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()))return 'image/gif';
 if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
 if(bytes.subarray(4,8).toString()==='ftyp'&&['isom','iso2','mp41','mp42','avc1','M4V ','MSNV'].includes(bytes.subarray(8,12).toString()))return 'video/mp4';
 throw Error('BRONXYS_MEDIA');
}
function instagramMediaKind(item) {
 const type=String(item?.type||item?.mimetype||item?.mime_type||'').toLowerCase();
 if(type==='mp3'||type==='audio'||type.startsWith('audio/'))return 'audio';
 if(type==='mp4'||type==='video'||type.startsWith('video/'))return 'video';
 return 'image';
}
async function incoming(ctx,signal) {
 const {inspect}=require('../../activations/message-rules');const direct=inspect(ctx.msg.message).message;
 const quoted=Object.values(direct).find(value=>value?.contextInfo?.quotedMessage)?.contextInfo.quotedMessage;
 const message=quoted?inspect(quoted).message:direct;
 const kind=message.imageMessage?'image':message.audioMessage?'audio':message.videoMessage?'video':null;
 if(!kind)throw Error('Responda a uma imagem, áudio ou vídeo compatível com o comando.');
 const node=message[kind+'Message'];
 if(Number(node.fileLength)>8*1024*1024)throw Error('Limite de upload: 8 MB.');
 const {downloadContentFromMessage}=await import('@whiskeysockets/baileys');
 const stream=await downloadContentFromMessage(node,kind),chunks=[];let bytes=0;
 const abort=()=>stream.destroy(Error('BRONXYS_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});
 try{for await(const chunk of stream){bytes+=chunk.length;if(bytes>8*1024*1024)throw Error('Limite de upload: 8 MB.');chunks.push(chunk);}}
 finally{signal.removeEventListener('abort',abort);stream.destroy();}
 return {buffer:Buffer.concat(chunks),mime:node.mimetype||({image:'image/jpeg',audio:'audio/mpeg',video:'video/mp4'})[kind],kind};
}
function createHandler(def,{client=createClient(),tempRoot=os.tmpdir(),receive=incoming,convert,metadata=require('../../commands/media-info').lookupMedia}={}) {
 return async function handle(sock,ctx) {
  const reply=text=>sock.sendMessage(ctx.jid,{text},{quoted:ctx.msg});
  const reject=async(text,code)=>{await reply(text);return {ok:false,code,mediaCount:0};};
  const query=(ctx.args||[]).join(' ').trim();
  if(def.parameter&&!query)return reject(`❌ *Ação inválida!* _Informe ${def.parameter==='url'?'um link':'texto ou pesquisa'}._\n> 💡 *Use assim:* ${command(`${require('../../config').get('PREFIX')}${def.name} ${def.parameter==='url'?'link':'texto ou pesquisa'}`)}`,'BRONXYS_INPUT');
  if(query.length>2000)return reject('❌ *Ação inválida!* _Pesquisa ou texto muito longo._','BRONXYS_INPUT');
  if(!client.configured())return reject('⏳ *Aguarde um instante!* _'+errors.BRONXYS_KEY+'_','BRONXYS_KEY');
  let directory,mediaCount=0;
  const controller=new AbortController(),signal=controller.signal,timer=setTimeout(()=>controller.abort(),180000);
  const params=def.parameter?{[def.parameter]:query}:{};
  try {
   if(def.parameter==='url')await publicURL(query);
   if(def.parameter==='nome_url'&&/^[a-z][a-z0-9+.-]*:/i.test(query)) {
    const {url}=await publicURL(query);
    if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname))throw Error('BRONXYS_URL');
   }
   if(def.name==='cep') {params.cep=query.replace(/\D/g,'');if(!/^\d{8}$/.test(params.cep))throw Error('Informe um CEP com 8 dígitos.');}
   if(def.format==='logo'||def.format==='montage')params.category=def.name;
   if(def.name==='attp'||def.name==='attp2')params.fonte=def.name==='attp2'?'Roboto':'Noto Emoji, Noto Sans Mono';
   else if(def.format==='sticker'||def.name.startsWith('attp_'))params.fonte='Arial';
   if(def.name.endsWith('_video'))params.type='video';
   directory=await fs.mkdtemp(path.join(tempRoot,'lobo-bronxys-'));
   let mediaInfo;
   if(def.parameter==='nome_url'&&!ctx.autoDownload) {
    mediaInfo=await metadata(query);
    if(mediaInfo?.url)params.nome_url=mediaInfo.url;
   }
   const title=filename(mediaInfo?.title||query||def.name,'').replace(/\.$/,'');let counter=0;
   async function sendFile(url,kind='image',name=title,mime) {
    const file=path.join(directory,'media-'+counter++);
    const received=await client.download(url,file,{signal});let output=file,mediaMime;
    if(kind==='image'||kind==='video') {
     const handle=await fs.open(file,'r');
     try {const head=Buffer.alloc(16),{bytesRead}=await handle.read(head,0,head.length,0);mediaMime=socialMediaType(received,head.subarray(0,bytesRead));}
     finally {await handle.close();}
     kind=mediaMime.startsWith('video/')?'video':'image';
    }
    if(kind==='audio'||kind==='audio-document') {
     output=file+'.mp3';
     if(convert)await convert(file,output,signal);
     else await execFile(require('@ffmpeg-installer/ffmpeg').path,['-nostdin','-y','-i',file,'-vn','-c:a','libmp3lame','-b:a','128k','-fs',String(MAX_BYTES+1),output],{signal,timeout:90000,maxBuffer:1024*1024});
    } else if(kind==='sticker'&&received!=='image/webp') {
     output=file+'.webp';await require('sharp')(file,{animated:true,limitInputPixels:20000000}).resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp().toFile(output);
    }
    const size=(await fs.stat(output)).size;if(!size||size>MAX_BYTES)throw Error('BRONXYS_MEDIA');
    const buffer=await fs.readFile(output);
    const payload=kind==='audio-document'?{document:buffer,mimetype:'audio/mpeg',fileName:filename(name,'mp3')}:kind==='audio'?{audio:buffer,mimetype:'audio/mpeg',fileName:filename(name,'mp3'),ptt:false}:kind==='video'?{video:buffer,mimetype:mediaMime,fileName:filename(name,mediaMime==='video/mp4'?'mp4':mediaMime==='video/webm'?'webm':'video')}:kind==='document'?{document:buffer,mimetype:mime||received||'application/octet-stream',fileName:filename(name,'').replace(/\.$/,'')}:{[kind]:buffer,...(kind==='image'?{mimetype:mediaMime}:{})};
    await sock.sendMessage(ctx.jid,payload,{quoted:ctx.msg});
    mediaCount++;
    if(def.parameter==='nome_url'&&!ctx.autoDownload)await require('../../commands/media-info').sendMediaInfo(reply,mediaInfo||{});
   }
   const json=()=>client.json(def.endpoint,params,{signal});
   if(['upload','transcribe','montage'].includes(def.format)) {
    const media=await receive(ctx,signal);
    if(def.format==='transcribe') {if(media.kind==='image')throw Error('Responda a um áudio ou vídeo.');const data=await client.upload('transcrever',media.buffer,media.mime,{signal});if(typeof data.texto!=='string')throw Error('BRONXYS_RESPONSE');await reply(safeText(data.texto,require('./key').getKey()));}
    else {if(media.kind!=='image')throw Error('Responda a uma imagem.');const data=await client.upload('link_imagem',media.buffer,media.mime,{signal});if(!data.link)throw Error('BRONXYS_RESPONSE');if(def.format==='upload')await reply(safeText(data.link,require('./key').getKey()));else await sendFile(client.endpoint('montagem',{url:data.link,category:def.name}));}
   } else if(['audio','audio-document','video','image','sticker'].includes(def.format))await sendFile(client.endpoint(def.endpoint,params),def.format);
   else if(def.format==='json') {
    const result=await json();const text=safeText(formatJSON(result),require('./key').getKey());if(!text.trim())throw Error('BRONXYS_RESPONSE');for(let i=0;i<text.length;i+=3500)await reply(text.slice(i,i+3500));
   } else {
    const data=await json();
    if(def.format==='instagram'||def.format==='instagram-audio') {if(!Array.isArray(data.msg)||!data.msg.length)throw Error('BRONXYS_RESPONSE');for(const item of data.msg.slice(0,5))await sendFile(item.url,def.format==='instagram-audio'?'audio':instagramMediaKind(item));}
    else if(def.format==='mediafire'){const item=data.resultado?.[0];if(!item?.link)throw Error('BRONXYS_RESPONSE');await sendFile(item.link,'document',item.nama);}
    else if(def.format==='aptoide') {if(!data.link)throw Error('BRONXYS_RESPONSE');await sendFile(data.link,'document',data.titulo,'application/vnd.android.package-archive');}
    else if(def.format==='logo')await sendFile(typeof data.resultado==='string'?data.resultado:data.resultado?.imageUrl);
    else if(def.format==='google-image')await sendFile(data[0]?.url);
    else if(def.format==='pinterest')await sendFile(data[0]);
    else if(def.format==='pair') {await sendFile(data.link1);await sendFile(data.link2);}
    else if(def.format==='signo') {await sendFile(data.img);await reply(safeText(`${query}\n${data.title||''}\n${data.body||''}`,require('./key').getKey()));}
    else if(def.format==='news'){if(data[0]?.img)await sendFile(data[0].img);await reply(safeText(formatJSON(data),require('./key').getKey()));}
    else throw Error('BRONXYS_RESPONSE');
   }
   return {ok:true,mediaCount};
  } catch(error) {
   // Never log Axios errors/URLs: they can contain the API key.
   const known=errors[error.message] || (/^BRONXYS_|SIZE_LIMIT|abort|ENOENT|Command failed/i.test(error.message)?'A API não entregou o resultado esperado. Tente novamente mais tarde.':/^(Informe|Responda|Limite)/.test(error.message)?error.message:'Não foi possível processar a mídia ou a resposta da API.');
   try {await reply('⏳ *Aguarde um instante!* _'+numericText(known)+'_');}catch{}
   return {ok:false,mediaCount,code:Object.hasOwn(errors,error.message)||error.message==='BRONXYS_RESPONSE'?error.message:signal.aborted?'BRONXYS_TIMEOUT':'BRONXYS_MEDIA'};
  } finally {clearTimeout(timer);controller.abort();if(directory)await fs.rm(directory,{recursive:true,force:true});}
 };
}
function queuedHandler(def,options) {const handler=createHandler(def,options);return (sock,ctx)=>queue.run(ctx.jid,async()=>{if(options?.shouldRun&&!await options.shouldRun(ctx))return {ok:false,code:'BRONXYS_SKIPPED',mediaCount:0};return handler(sock,ctx);}).catch(async()=>{try{await sock.sendMessage(ctx.jid,{text:'⏳ *Aguarde um instante!* _Há downloads pendentes neste chat._'},{quoted:ctx.msg});}catch{}return {ok:false,code:'BRONXYS_QUEUE',mediaCount:0};});}
module.exports={incoming,createHandler,queuedHandler,definitions,formatJSON,safeText};
