'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { frameNotice } = require('../menus/render');
const { command, mono } = require('../ui/text');
let processing = false;
async function menuPhoto(sock,ctx) {
  const actor = await require('../activations/access').resolveActor(sock,ctx);
  const reply = text => sock.sendMessage(ctx.jid,{text:frameNotice('🖼️ CAPA DOS MENUS',[text])},{quoted:ctx.msg});
  if (!actor.owner) return reply('Somente donos cadastrados podem alterar a capa.');
  const settings = require('../security/settings'), p = require('../config').get('PREFIX');
  if (ctx.args[0] === 'remover') {settings.set('menu-media',null,actor.phone);settings.set('menu-default-disabled',true,actor.phone);return reply('✅ Capa removida. Os menus continuam em texto.');}
  if (ctx.args[0] === 'ver') return require('../menus/media').sendMenu(sock,{...ctx,args:[]},'🖼️ Prévia da capa configurada.');
  const direct = require('../activations/message-rules').inspect(ctx.msg.message).message;
  const quoted = direct.extendedTextMessage?.contextInfo?.quotedMessage;
  const message = quoted ? require('../activations/message-rules').inspect(quoted).message : direct;
  const document = message.documentMessage;
  const documentType = document?.mimetype;
  const sourceKind = message.imageMessage ? 'image' : message.videoMessage ? 'video' : document && ['image/gif','image/jpeg','image/png','image/webp','video/mp4'].includes(documentType) ? 'document' : null;
  const mime = sourceKind ? message[sourceKind+'Message'].mimetype : '';
  const kind = mime === 'image/gif' || mime === 'video/mp4' || sourceKind === 'video' ? 'video' : sourceKind ? 'image' : null;
  if (!kind) return reply(`Envie uma foto ou GIF/vídeo com a legenda ${command(p + 'fotomenu')}, ou responda à mídia com esse comando.\n${command(p + 'fotomenu ver')} • ${command(p + 'fotomenu remover')}\n> Limite: ${mono('8 MB')}. Animações são convertidas em clipes de até ${mono('12 segundos')}.`);
  if(processing) return reply('Aguarde a conversão da capa que já está em andamento.');
  const directory = path.join(__dirname,'../../data/menu');await fs.mkdir(directory,{recursive:true});
  const id = randomUUID(), input = path.join(directory,id+'.input'), output = path.join(directory,id+(kind === 'image'?'.jpg':'.mp4'));
  processing = true;
  try {
    const {downloadContentFromMessage} = await require('../utils/baileys').loadBaileys();
    const stream = await downloadContentFromMessage(message[sourceKind+'Message'],sourceKind), chunks = [];let bytes = 0;
    const downloadTimer = setTimeout(()=>stream.destroy(Error('Tempo de download excedido.')),30000);
    try {
      for await (const chunk of stream) {bytes += chunk.length;if(bytes > 8*1024*1024) throw Error('A mídia excede 8 MB.');chunks.push(chunk);}
    } finally {clearTimeout(downloadTimer);if(!stream.destroyed) stream.destroy();}
    const buffer = Buffer.concat(chunks);
    if(kind === 'image') {
      await require('sharp')(buffer,{limitInputPixels:20000000}).rotate().resize({width:1280,withoutEnlargement:true}).jpeg({quality:82}).toFile(output);
    } else {
      await fs.writeFile(input,buffer,{mode:0o600});
      await execFile(require('@ffmpeg-installer/ffmpeg').path,['-nostdin','-y','-i',input,'-t','12','-an','-vf','scale=640:-2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',output],{timeout:30000,maxBuffer:1024*1024});
    }
    if((await fs.stat(output)).size > 8*1024*1024) throw Error('Arquivo convertido excede 8 MB.');
    const previous = settings.get('menu-media',null);
    settings.set('menu-media',{type:kind,file:path.basename(output)},actor.phone);
    if(previous && /^[a-f0-9-]+\.(jpg|mp4)$/.test(previous.file)) await fs.rm(path.join(directory,previous.file),{force:true}).catch(()=>{});
    return reply('✅ Capa salva! Abra qualquer categoria do menu para visualizar.');
  } catch(error) {
    await fs.rm(output,{force:true});
    return reply(error.message === 'A mídia excede 8 MB.' ? error.message : 'Não consegui validar ou converter essa mídia. Envie outra foto ou um GIF/vídeo curto. A capa anterior foi mantida.');
  } finally {processing = false;await fs.rm(input,{force:true});}
}
module.exports = { menuPhoto };
