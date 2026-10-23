'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
async function sendMenu(sock, ctx, text, { getMedia = () => require('../security/settings').get('menu-media',null), directory = path.join(__dirname,'../../data/menu'), defaultFile = path.join(__dirname,'../assets/menu-principal.jpg'), useDefault = () => !require('../security/settings').get('menu-default-disabled',false) } = {}) {
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
    try {
      if((await fs.lstat(defaultFile)).isSymbolicLink()) throw Error('Capa inválida.');
      return await sock.sendMessage(ctx.jid,{image:await fs.readFile(defaultFile),caption:text,mimetype:'image/jpeg'},{quoted:ctx.msg});
    } catch { /* A capa padrão ausente não impede abrir o menu. */ }
  }
  return sock.sendMessage(ctx.jid,{text},{quoted:ctx.msg});
}
module.exports = { sendMenu };
