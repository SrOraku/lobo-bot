'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

async function sendMenu(sock, ctx, text, {
  getMedia = () => require('../security/settings').get('menu-media', null),
  directory = path.join(__dirname, '../../data/menu'),
  defaultFile = path.join(__dirname, '../assets/Menu.gif'),
  defaultParts = [],
  useDefault = () => !require('../security/settings').get('menu-default-disabled', false)
} = {}) {
  const media = getMedia();

  if (media && /^[a-f0-9-]+\.(jpg|mp4|gif)$/i.test(media.file)) {
    try {
      const file = path.join(directory, media.file);
      if ((await fs.lstat(file)).isSymbolicLink()) {
        throw new Error('Mídia inválida.');
      }

      const buffer = await fs.readFile(file);

      if (media.file.endsWith('.gif')) {
        return await sock.sendMessage(ctx.jid, {
          document: buffer,
          mimetype: 'image/gif',
          fileName: media.file,
          caption: text
        }, { quoted: ctx.msg });
      }

      return await sock.sendMessage(ctx.jid,
        media.type === 'video'
          ? { video: buffer, gifPlayback: true, caption: text, mimetype: 'video/mp4' }
          : { image: buffer, caption: text, mimetype: 'image/jpeg' },
        { quoted: ctx.msg }
      );
    } catch (_) {}
  }

  if (!media && !ctx.args?.length && useDefault()) {
    try {
      let gif;
      if (Array.isArray(defaultParts) && defaultParts.length) {
        const chunks = [];
        for (const part of defaultParts) {
          const stat = await fs.lstat(part);
          if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Parte de GIF inválida.');
          const encoded = (await fs.readFile(part, 'utf8')).trim();
          if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Parte de GIF inválida.');
          const decoded = Buffer.from(encoded, 'base64');
          if (decoded.toString('base64') !== encoded) throw new Error('Parte de GIF inválida.');
          chunks.push(decoded);
        }
        gif = Buffer.concat(chunks);
      } else {
        const stat = await fs.lstat(defaultFile);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('GIF inválido.');
        gif = await fs.readFile(defaultFile);
      }
      return await sock.sendMessage(ctx.jid, {
        document: gif,
        mimetype: 'image/gif',
        fileName: 'Menu.gif',
        caption: text
      }, { quoted: ctx.msg });
    } catch (_) {
      // Usa a mensagem em texto como alternativa.
    }
  }

  return sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
}

module.exports = { sendMenu };
