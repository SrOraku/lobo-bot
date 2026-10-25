'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const sharp=require('sharp'),fs=require('node:fs');
const {createLocalMedia,quoteSVG,FILTERS}=require('../src/commands/local-media');
const context=(args=[])=>({jid:'120000@g.us',args,msg:{key:{id:'local'},message:{extendedTextMessage:{contextInfo:{participant:'5511999@s.whatsapp.net',quotedMessage:{conversation:'Olá <matilha> & lua'}}}}}});
function socket(){const sent=[];return {sent,sock:{sendMessage:async(_,value)=>sent.push(value),profilePictureUrl:async()=>{throw Error('private');}}};}
test('toimg emits actual PNG from WebP and completes processing reactions',async()=>{const input=await sharp({create:{width:16,height:16,channels:4,background:'#00ff0080'}}).webp().toBuffer();const f=socket();await createLocalMedia({read:async()=>input})('toimg')(f.sock,context());const image=f.sent.find(v=>v.image);assert.equal((await sharp(image.image).metadata()).format,'png');assert.equal(f.sent.at(-1).react.text,'✅');});
test('sfundo preserves transparent output and removes temporary directory after sending',async()=>{const input=await sharp({create:{width:16,height:16,channels:4,background:'#00ff0080'}}).png().toBuffer();let folder;const f=socket();await createLocalMedia({read:async()=>input,remove:async(i,o)=>{folder=require('node:path').dirname(i);fs.copyFileSync(i,o);}})('sfundo')(f.sock,context(['sticker']));const sticker=f.sent.find(v=>v.sticker);assert.equal((await sharp(sticker.sticker).metadata()).format,'webp');assert.equal((await sharp(sticker.sticker).metadata()).hasAlpha,true);assert.equal(fs.existsSync(folder),false);});
test('failed segmentation cleans input and does not report successful media',async()=>{const input=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).png().toBuffer();let folder;const f=socket();await createLocalMedia({read:async()=>input,remove:async(i)=>{folder=require('node:path').dirname(i);throw Error('failed');}})('sfundo')(f.sock,context());assert.equal(fs.existsSync(folder),false);assert.ok(!f.sent.some(v=>v.image||v.sticker));assert.ok(!f.sent.some(v=>v.react?.text==='✅'));});
test('quote escapes XML and produces a valid WebP when profile photo is unavailable',async()=>{assert.ok(quoteSVG('<nome>','a & b').toString().includes('&lt;nome&gt;'));const f=socket();await createLocalMedia()('qc')(f.sock,context());assert.equal((await sharp(f.sent.find(v=>v.sticker).sticker).metadata()).format,'webp');});
test('audio effects are fixed filters and reject arbitrary filter input',async()=>{assert.deepEqual(Object.keys(FILTERS),['estourado','esquilo','grave','lento']);const f=socket();await createLocalMedia()('efeito')(f.sock,context(['unknown;sh']));assert.ok(f.sent.some(v=>v.text?.includes('Use !efeito')));assert.ok(!f.sent.some(v=>v.audio));});
test('real FFmpeg extracts MP3 and returns Opus voice notes for every supported effect',async t=>{
 const os=require('node:os'),path=require('node:path'),exec=require('node:util').promisify(require('node:child_process').execFile);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-convert-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const video=path.join(dir,'input.mp4');await exec(require('@ffmpeg-installer/ffmpeg').path,['-y','-f','lavfi','-i','color=c=black:s=32x32:d=0.3','-f','lavfi','-i','sine=frequency=440:duration=0.3','-c:v','mpeg4','-c:a','aac','-shortest',video]);
 const bytes=fs.readFileSync(video);
 const mp3=socket();await createLocalMedia({read:async()=>bytes})('tomp3')(mp3.sock,context());
 assert.ok(mp3.sent.find(v=>v.audio)?.audio.length>100);assert.equal(mp3.sent.find(v=>v.audio).mimetype,'audio/mpeg');
 for(const effect of Object.keys(FILTERS)){
  const f=socket();await createLocalMedia({read:async()=>bytes})('efeito')(f.sock,context([effect]));
  const voice=f.sent.find(v=>v.audio);assert.ok(voice,effect);assert.equal(voice.audio.subarray(0,4).toString(),'OggS');assert.equal(voice.ptt,true);
 }
});
test('hidetag is registered with group/admin requirements and existing toimg aliases survive',()=>{
 const defs=new Map([['toimg',{aliases:['stickertoimg']}]]);
 require('../src/commands/local-media').register(def=>defs.set(def.name,def),defs);
 assert.equal(defs.get('hidetag').groupOnly,true);assert.equal(defs.get('hidetag').minLevel,1);assert.equal(defs.get('hidetag').adminOnly,true);
 assert.deepEqual(defs.get('toimg').aliases,['stickertoimg']);
});

test('image captions still select the direct image when replying to plain text',()=>{const image={caption:'!sfundo',contextInfo:{quotedMessage:{conversation:'Mensagem anterior'}}};const ctx={msg:{message:{imageMessage:image}}};assert.equal(require('../src/commands/local-media').mediaNode(ctx,'image'),image);});
test('hidetag sends hidden mentions for a real group admin and rejects forged member role flags',async()=>{
 const group='1515151515@g.us',admin='5511976543210@s.whatsapp.net',member='5511965432109@s.whatsapp.net',bot='5511900000000@s.whatsapp.net';
 const defs=new Map();require('../src/commands/local-media').register(def=>defs.set(def.name,def),defs);
 const sent=[],sock={user:{id:bot},groupMetadata:async()=>({id:group,owner:admin,participants:[{id:admin,admin:'superadmin'},{id:member},{id:bot,admin:'admin'}]}),sendMessage:async(_,payload)=>sent.push(payload)};
 const ctx={jid:group,isGroup:true,sender:admin,senderNumber:admin.split('@')[0],args:['Aviso','da','matilha'],msg:{key:{id:'hide'}}};
 await defs.get('hidetag').handler(sock,ctx);
 assert.equal(sent.at(-1).text,'Aviso da matilha');assert.deepEqual(sent.at(-1).mentions,[admin,member,bot]);
 sent.length=0;await defs.get('hidetag').handler(sock,{...ctx,sender:member,senderNumber:member.split('@')[0],senderLevel:3,isOwner:true});
 assert.ok(sent.length);assert.ok(!sent.some(payload=>payload.mentions));
});
