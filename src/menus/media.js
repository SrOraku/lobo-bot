'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');

const DEFAULT_VIDEO_PARTS = [
  'part-00.txt','part-01.txt','part-02.txt','part-03.txt'
].map(file => path.join(__dirname, '../assets/menu-principal.mp4.b64.parts', file));

async function readSafeFiles(files) {
  const parts = [];
  for (const file of files) {
    if ((await fs.lstat(file)).isSymbolicLink()) throw Error('Capa inválida.');
    parts.push(await fs.readFile(file, 'utf8'));
  }
  return Buffer.from(parts.join(''), 'base64');
}

async function sendMenu(sock, ctx, text, {
  getMedia = () => require('../security/settings').get('menu-media',null),
  directory = path.join(__dirname,'../../data/menu'),
  defaultParts = DEFAULT_VIDEO_PARTS,
  defaultFile = path.join(__dirname,'../assets/src/menus/media.js'),
  useDefault = () => !require('../security/settings').get('menu-default-disabled',false)
} = {}) {
  const media = getMedia();
  if (media && /^[a-f0-9-]+\.(jpg|mp4)$/.test(media.file) && ['image','video'].includes(media.type)) {
    try {
      const file = path.join(directory,media.file);
      if ((await fs.lstat(file)).isSymbolicLink()) throw Error('Mídia inválida.');
      const buffer = await fs.readFile(file);
      return await sock.sendMessage(ctx.jid,media.type === 'video'
        ? {video:buffer,gifPlayback:true,caption:text,mimetype:'video/mp4'}
        : {image:buffer,caption:text,mimetype:'image/jpeg'},{quoted:ctx.msg});
    } catch { /* Falha de imagem ou compatibilidade não impede abrir o menu. */ }
  }
  if(!media && !ctx.args?.length && useDefault()) {
    if (Array.isArray(defaultParts) && defaultParts.length) {
      try {
        const video = await readSafeFiles(defaultParts);
        return await sock.sendMessage(ctx.jid,{video,gifPlayback:true,caption:text,mimetype:'video/mp4'},{quoted:ctx.msg});
      } catch { /* Falha da animação padrão usa a capa estática como fallback. */ }
    }
    try {
      if((await fs.lstat(defaultFile)).isSymbolicLink()) throw Error('Capa inválida.');
      return await sock.sendMessage(ctx.jid,{image:await fs.readFile(defaultFile),caption:text,mimetype:'image/jpeg'},{quoted:ctx.msg});
    } catch { /* A capa padrão ausente não impede abrir o menu. */ }
  }
  return sock.sendMessage(ctx.jid,{text},{quoted:ctx.msg});
}
module.exports = { sendMenu };
