'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createBackgroundRemover,mediaFailure}=require('../media/background');
const {inspect}=require('../activations/message-rules');
const R=require('../core/response');
const backgroundQueue=new (require('../core/keyed-queue').KeyedQueue)({maxKeys:1,maxPending:2});
const FILTERS=Object.freeze({estourado:'volume=4,alimiter=limit=0.95',esquilo:'asetrate=48000*1.5,aresample=48000',grave:'asetrate=48000*0.75,aresample=48000',lento:'atempo=0.75'});
function source(ctx){const direct=inspect(ctx.msg.message).message;const values=Object.values(direct);const context=(values.find(v=>v?.contextInfo?.quotedMessage)||values.find(v=>v?.contextInfo))?.contextInfo;return {message:inspect(context?.quotedMessage||direct).message,context,quoted:!!context?.quotedMessage};}
function mediaNode(ctx,kind){return source(ctx).message[kind+'Message']||inspect(ctx.msg.message).message[kind+'Message'];}
async function receive(ctx,kind){const node=mediaNode(ctx,kind);if(!node)throw Error('Responda à mídia compatível com este comando.');if(Number(node.fileLength)>16*1024*1024)throw Error('Limite de mídia: 16 MB.');const {downloadContentFromMessage}=await require('../utils/baileys').loadBaileys();const stream=await downloadContentFromMessage(node,kind);let size=0;const chunks=[];try{for await(const chunk of stream){size+=chunk.length;if(size>16*1024*1024)throw Error('Limite de mídia: 16 MB.');chunks.push(chunk);}}finally{stream.destroy();}return Buffer.concat(chunks);}
function xml(value){return String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));}
function quoteSVG(name,text){
 const lines=[];let row='';const {width}=require('../ui/text');
 for(const {segment} of new Intl.Segmenter('pt',{granularity:'grapheme'}).segment(String(text))){
  if(segment==='\n'||width(row+segment)>30){lines.push(row);row='';}
  if(segment!=='\n')row+=segment;
 }
 if(row)lines.push(row);const height=Math.max(512,125+lines.length*30);
 return Buffer.from(`<svg width="512" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="25" width="420" height="${height-40}" rx="28" fill="#15251b"/><circle cx="43" cy="65" r="34" fill="#54bc79"/><text x="100" y="65" fill="#70e398" font-size="23" font-family="sans-serif">${xml(String(name))}</text>${lines.map((line,i)=>`<text x="100" y="${105+i*30}" fill="white" font-size="22" font-family="sans-serif">${xml(line)}</text>`).join('')}</svg>`);
}

function createLocalMedia({read=receive,remove=createBackgroundRemover(),log=entry=>require('../config/logger').logger.error({...entry,code:entry.errorCode},'Falha em '+entry.command+' / '+entry.stage)}={}){
 return name=>async(sock,ctx)=>{let directory,stage='prepare';const react=async text=>{let timer;if(ctx.msg?.key?.id)try{await Promise.race([sock.sendMessage(ctx.jid,{react:{text,key:ctx.msg.key}}),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}catch{/* Optional reaction. */}finally{clearTimeout(timer);}};
 try{
  const sharp=require('sharp');const s=source(ctx);
  if(name==='efeito'&&!Object.hasOwn(FILTERS,ctx.args[0]))throw Error('Use !efeito estourado, esquilo, grave ou lento respondendo a um áudio.');
  const backgroundMode=String(ctx.args[0]||'').toLowerCase();
  if(name==='sfundo'&&ctx.args.length&&!(ctx.args.length===1&&['sticker','figurinha'].includes(backgroundMode)))throw Error('Use !sfundo para imagem sem fundo ou !sfundo sticker para figurinha sem fundo. Responda a uma foto ou use a legenda.');
  if(['toimg','tomp3','qc','efeito'].includes(name)&&!s.quoted)throw Error('Responda à mensagem que deseja converter.');
  await react('⏳');directory=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-local-'));const input=path.join(directory,'input'),output=path.join(directory,'output');
  let payload;
  if(name==='qc'){
   const text=inspect(s.message).body;if(!text)throw Error('Responda a uma mensagem de texto (até 500 caracteres).');if(text.length>500)throw Error('Limite da citação: 500 caracteres.');
   const author=s.context?.participant;if(!author)throw Error('Não foi possível identificar o autor da mensagem respondida.');
   let label=s.context?.pushName||author.split('@')[0];
   try{label=require('../utils/database').getUser(author)?.name||label;}catch{/* A missing cached name falls back to the real author identifier. */}
   let image=sharp(quoteSVG(label,text));
   // Profile photos are optional. The original author JID remains the fallback.
   try{const url=await sock.profilePictureUrl(author,'image');const avatar=path.join(directory,'avatar');await require('../integrations/bronxys/client').createClient().download(url,avatar);image=image.composite([{input:await sharp(avatar).resize(64,64).png().toBuffer(),left:10,top:32}]);}catch{/* Privacy settings may hide the avatar. */}
   payload={sticker:await image.resize(512,512,{fit:'contain',background:'#00000000'}).webp().toBuffer()};
  }else if(name==='toimg'){payload={image:await sharp(await read(ctx,'sticker'),{limitInputPixels:25000000}).png().toBuffer(),mimetype:'image/png'};
  }else if(name==='sfundo'){
   // Apply the phone's EXIF orientation before stripping metadata for inference.
   stage='download';const photo=await read(ctx,'image');stage='decode';
   const normalized=await sharp(photo,{limitInputPixels:25000000}).rotate().toColourspace('srgb').ensureAlpha().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
   stage='prepare';fs.writeFileSync(input,normalized);stage='inference';await backgroundQueue.run('local-background',()=>remove(input,output));stage='encode';
   payload=['sticker','figurinha'].includes(backgroundMode)?{sticker:await sharp(output).resize(512,512,{fit:'contain',background:'#00000000'}).webp().toBuffer()}:{image:await sharp(output).png().toBuffer(),mimetype:'image/png',caption:'🖼️ *Fundo removido!*\n> 🌹 _Para criar figurinha, responda com_ *'+require('../config').get('PREFIX')+'s*.'};
  }else{
   fs.writeFileSync(input,await read(ctx,name==='tomp3'?'video':'audio'));
   const ffmpeg=require('fluent-ffmpeg');ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
   await new Promise((resolve,reject)=>{const job=ffmpeg(input).noVideo().duration(180);if(name==='efeito')job.audioFilters(FILTERS[ctx.args[0]]).audioCodec('libopus').format('ogg');else job.audioCodec('libmp3lame').format('mp3');const timer=setTimeout(()=>job.kill('SIGKILL'),60000);job.on('end',()=>{clearTimeout(timer);resolve();}).on('error',error=>{clearTimeout(timer);reject(error);}).save(output);});
   payload={audio:fs.readFileSync(output),mimetype:name==='tomp3'?'audio/mpeg':'audio/ogg; codecs=opus',ptt:name==='efeito'};
  }
  stage='send';await sock.sendMessage(ctx.jid,payload,{quoted:ctx.msg});await react('✅');return {ok:true};
 }catch(error){
  const validation=/^(Use|Responda|Limite|Não foi possível identificar)/.test(error.message);
  const failure=mediaFailure(error,stage);
  if(!validation)try{log({component:'local-media',command:name,stage:failure.stage,errorCode:failure.code});}catch{/* A log failure must not hide the processing error from the user. */}
  await react('❌');await sock.sendMessage(ctx.jid,{text:R.error('Mídia não concluída',validation?error.message:failure.message+'\nCódigo: `'+failure.code+'`.')},{quoted:ctx.msg});return {ok:false};
 }
 finally{if(directory){for(const file of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,file));fs.rmdirSync(directory);}}
 };}
async function hidetag(sock,ctx){const text=ctx.args.join(' ').trim();if(!text)return sock.sendMessage(ctx.jid,{text:R.usage('!hidetag texto','!hidetag Aviso da matilha')},{quoted:ctx.msg});const {requireGroupAdmin}=require('../middlewares/permissions');return requireGroupAdmin(async()=>{const meta=await sock.groupMetadata(ctx.jid);return sock.sendMessage(ctx.jid,{text,mentions:meta.participants.map(p=>p.id)},{quoted:ctx.msg});})(sock,ctx);}
function register(r,registry){for(const [name,category,description,usage]of [['sfundo','figurinhas','Remover fundo; sticker cria figurinha transparente','!sfundo [sticker|figurinha]'],['toimg','figurinhas','Figurinha para PNG','!toimg'],['tomp3','midia','Extrair MP3 de vídeo','!tomp3'],['qc','figurinhas','Citação em figurinha','!qc'],['efeito','midia','Efeitos locais de voz','!efeito estourado/esquilo/grave/lento']]){const old=registry.get(name);r({...old,name,category,description,usage,replace:!!old,handler:createLocalMedia()(name),cost:5,concurrency:'chat'});}r({name:'hidetag',category:'adm',description:'Aviso com menções ocultas',usage:'!hidetag texto',groupOnly:true,minLevel:1,adminOnly:true,handler:hidetag});}
module.exports={createLocalMedia,register,quoteSVG,FILTERS,mediaNode};
