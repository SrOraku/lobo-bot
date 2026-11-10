'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sharp=require('sharp');
const {createStickerHandlers}=require('../src/commands/stickers');
const {readStickerMetadata,listChunks}=require('../src/media/webp-exif');
function setup(t,download,convertVideo){
 const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-sticker-test-'));
 t.after(()=>fs.rmSync(temporaryRoot,{recursive:true,force:true}));
 const sent=[];
 return {temporaryRoot,sent,sock:{sendMessage:async(_,payload)=>sent.push(payload)},...createStickerHandlers({temporaryRoot,download,...(convertVideo?{convertVideo}:{})})};
}
function ctx(message,args=[]){return {jid:'120000@g.us',args,pushName:'Luna',msg:{key:{id:'transparent-sticker'},message}};}
function quoted(media){return {extendedTextMessage:{text:'!s',contextInfo:{quotedMessage:media}}};}
async function transparentPNG(){return sharp({create:{width:64,height:64,channels:4,background:'#00000000'}}).composite([{input:{create:{width:24,height:24,channels:4,background:'#33aa44ff'}},left:20,top:20}]).png().toBuffer();}
async function assertTransparentSticker(payload){
 assert.ok(payload?.sticker,'A sticker must actually be delivered');
 const meta=await sharp(payload.sticker).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.hasAlpha,true);
 const {data,info}=await sharp(payload.sticker).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(data[3],0,'Background must stay transparent');
 assert.ok(data[((256*info.width)+256)*4+3]>127,'Foreground must survive conversion');
}
test('!s preserves transparent PNG foreground and alpha with custom pack metadata',async t=>{
 const input=await transparentPNG(),node={mimetype:'image/png'};
 const f=setup(t,async(selected,type)=>{assert.equal(selected,node);assert.equal(type,'imageMessage');return input;});
 await f.criarSticker(f.sock,ctx(quoted({imageMessage:node}),['Minha','matilha']));
 const payload=f.sent.find(value=>value.sticker);await assertTransparentSticker(payload);
 // O Baileys ignora `stickerMetadata`: o pacote precisa estar no EXIF do WebP.
 assert.equal(payload.stickerMetadata,undefined);
 const meta=readStickerMetadata(payload.sticker);assert.equal(meta.packname,'Minha matilha');assert.equal(meta.author,'Pedido por Luna');
 assert.ok(payload.sticker.length<=100*1024,'Static stickers stay within WhatsApp limit');assert.deepEqual(fs.readdirSync(f.temporaryRoot),[]);
});
test('!s pacote | autor customizes both fields and plain !s uses the configured defaults',async t=>{
 const input=await transparentPNG(),f=setup(t,async()=>input);
 await f.criarSticker(f.sock,ctx(quoted({imageMessage:{}}),['Lobos','da','Lua','|','Matilha','{nome}']));
 let meta=readStickerMetadata(f.sent.find(value=>value.sticker).sticker);assert.equal(meta.packname,'Lobos da Lua');assert.equal(meta.author,'Matilha Luna');
 f.sent.length=0;await f.criarSticker(f.sock,ctx(quoted({imageMessage:{}})));
 meta=readStickerMetadata(f.sent.find(value=>value.sticker).sticker);assert.equal(meta.packname,require('../src/config').get('BOT_NAME'));assert.equal(meta.author,'Pedido por Luna');
});
test('!s resolves a wrapped quoted image even when metadata is its first property',async t=>{
 const input=await transparentPNG(),node={mimetype:'image/png'};
 const f=setup(t,async(selected,type)=>{assert.equal(selected,node);assert.equal(type,'imageMessage');return input;});
 const message={ephemeralMessage:{message:{messageContextInfo:{},extendedTextMessage:{text:'!s',contextInfo:{quotedMessage:{ephemeralMessage:{message:{messageContextInfo:{},imageMessage:node}}}}}}}};
 await f.criarSticker(f.sock,ctx(message));await assertTransparentSticker(f.sent.find(value=>value.sticker));assert.deepEqual(fs.readdirSync(f.temporaryRoot),[]);
});
test('!s accepts a direct image caption with a quoted text message and metadata first',async t=>{
 const input=await transparentPNG(),node={caption:'!s',contextInfo:{quotedMessage:{conversation:'Oi'}}};
 const f=setup(t,async(selected)=>{assert.equal(selected,node);return input;});
 await f.criarSticker(f.sock,ctx({ephemeralMessage:{message:{messageContextInfo:{},imageMessage:node}}}));await assertTransparentSticker(f.sent.find(value=>value.sticker));
});
test('!s treats existing WebP stickers as images rather than invoking the video converter',async t=>{
 const input=await sharp(await transparentPNG()).webp().toBuffer();
 const f=setup(t,async()=>input,async()=>{assert.fail('A static sticker must not use FFmpeg');});
 await f.criarSticker(f.sock,ctx(quoted({stickerMessage:{mimetype:'image/webp'}})));await assertTransparentSticker(f.sent.find(value=>value.sticker));
});
test('!s keeps the background of an opaque original photo',async t=>{
 const input=await sharp({create:{width:32,height:32,channels:3,background:'#ff0000'}}).png().toBuffer();
 const f=setup(t,async()=>input);await f.criarSticker(f.sock,ctx(quoted({imageMessage:{}})));
 const payload=f.sent.find(value=>value.sticker);assert.ok(payload);
 const {data}=await sharp(payload.sticker).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let index=3;index<data.length;index+=4)assert.equal(data[index],255,'Ordinary !s must not remove a background');
});
test('!s cleans its exclusive temporary directory when image conversion fails',async t=>{
 const f=setup(t,async()=>Buffer.from('not an image'));
 await f.criarSticker(f.sock,ctx(quoted({imageMessage:{}})));
 assert.ok(f.sent.some(value=>value.text?.includes('Erro ao criar figurinha')));assert.ok(!f.sent.some(value=>value.sticker));assert.deepEqual(fs.readdirSync(f.temporaryRoot),[]);
});
test('!s cleans its exclusive temporary directory when sending fails',async t=>{
 const input=await transparentPNG(),f=setup(t,async()=>input);
 const sock={sendMessage:async(_,payload)=>{if(payload.sticker){assert.ok(fs.readdirSync(f.temporaryRoot).length);throw Error('Send failed');}f.sent.push(payload);}};
 await f.criarSticker(sock,ctx(quoted({imageMessage:{}})));
 assert.ok(f.sent.some(value=>value.text?.includes('Erro ao criar figurinha')));assert.deepEqual(fs.readdirSync(f.temporaryRoot),[]);
});
test('video and animated sticker commands retain real FFmpeg conversion and clean temporary files',async t=>{
 const f=setup(t,async()=>video);
 const exec=require('node:util').promisify(require('node:child_process').execFile);
 const sourceDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-sticker-video-test-'));
 t.after(()=>fs.rmSync(sourceDirectory,{recursive:true,force:true}));
 const file=path.join(sourceDirectory,'source.mp4');
 await exec(require('@ffmpeg-installer/ffmpeg').path,['-y','-f','lavfi','-i','color=c=green:s=32x32:d=0.3','-c:v','mpeg4',file]);
 const video=fs.readFileSync(file);
 for(const name of ['criarSticker','criarStickerAnimado']){
  f.sent.length=0;await f[name](f.sock,ctx(quoted({videoMessage:{}})));
  const payload=f.sent.find(value=>value.sticker);assert.ok(payload,`${name} must deliver a sticker`);assert.equal(payload.sticker.subarray(0,4).toString(),'RIFF');assert.equal(payload.sticker.subarray(8,12).toString(),'WEBP');assert.deepEqual(fs.readdirSync(f.temporaryRoot),[]);
  assert.equal(readStickerMetadata(payload.sticker).author,'Pedido por Luna',`${name} must carry pack metadata`);
 }
});
test('!s preserves every frame when replying to an existing animated WebP sticker',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-existing-animation-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const exec=require('node:util').promisify(require('node:child_process').execFile),file=path.join(root,'animated.webp');
 await exec(require('@ffmpeg-installer/ffmpeg').path,['-y','-f','lavfi','-i','testsrc=duration=0.3:size=32x32:rate=10','-loop','0',file]);
 const input=fs.readFileSync(file);assert.ok((await sharp(input).metadata()).pages>1,'The fixture must have multiple frames');
 const f=setup(t,async()=>input);await f.criarSticker(f.sock,ctx(quoted({stickerMessage:{isAnimated:true,mimetype:'image/webp'}}),['Pacote','|','Autor']));
 const output=f.sent.find(value=>value.sticker)?.sticker;assert.ok(output);
 // Todos os quadros ficam idênticos; só mudam o EXIF e a flag EXIF do VP8X.
 const frames=webp=>listChunks(webp).filter(chunk=>!['EXIF','VP8X'].includes(chunk.type)).map(chunk=>chunk.type+':'+chunk.data.toString('base64'));
 assert.deepEqual(frames(output),frames(input),'No frame may be flattened or lost');
 const before=listChunks(input).find(chunk=>chunk.type==='VP8X').data,after=listChunks(output).find(chunk=>chunk.type==='VP8X').data;
 assert.equal(after[0],before[0]|0x08);assert.deepEqual(after.subarray(1),before.subarray(1));
 const meta=readStickerMetadata(output);assert.equal(meta.packname,'Pacote');assert.equal(meta.author,'Autor');assert.equal(meta.animated,true);
 assert.equal(meta.frames,(await sharp(input).metadata()).pages);assert.equal((await sharp(output,{animated:true}).metadata()).pages,meta.frames);
 assert.deepEqual(fs.readdirSync(f.temporaryRoot),[]);
});
