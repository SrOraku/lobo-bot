'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { command } = require('../ui/text');
const { inspect } = require('../activations/message-rules');
const { encodeStaticSticker, metadataFor, parseStickerArgs, withMetadata } = require('../media/sticker-tools');

let baileysModulePromise = null;
function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys');
  }
  return baileysModulePromise;
}

// Media keys need not be the first property, and WhatsApp may wrap messages.
function selectStickerMedia(msg) {
  const direct = inspect(msg.message).message;
  const context = Object.values(direct).find(value => value?.contextInfo?.quotedMessage)?.contextInfo;
  const quoted = inspect(context?.quotedMessage).message;
  for (const message of [quoted, direct]) {
    for (const type of ['imageMessage', 'videoMessage', 'stickerMessage']) {
      if (message[type]) return { node: message[type], type };
    }
  }
  return null;
}

async function downloadMedia(node, type) {
  if (Number(node.fileLength) > 16 * 1024 * 1024) throw Error('Limite de mídia: 16 MB.');
  const { downloadContentFromMessage } = await loadBaileys();
  const stream = await downloadContentFromMessage(node, type.replace('Message', ''));
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) throw Error('Limite de mídia: 16 MB.');
      chunks.push(chunk);
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks);
}

async function renderVideo(input, output, animated) {
  const ffmpeg = require('fluent-ffmpeg');
  ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);
  await new Promise((resolve, reject) => {
    const job = ffmpeg(input)
      .inputOptions([animated ? '-t 6' : '-t 3'])
      .outputOptions([
        '-vf', `${animated ? 'fps=15,' : ''}scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000`,
        '-loop', '0', '-preset', 'default', '-an', '-vsync', '0'
      ])
      .toFormat('webp');
    job.on('end', resolve).on('error', reject).save(output);
  });
}

function createStickerHandlers({ download = downloadMedia, temporaryRoot = os.tmpdir(), convertVideo = renderVideo } = {}) {
  function create(animated) {
    return async (sock, ctx) => {
      const { jid, msg, args = [] } = ctx;
      let directory;
      try {
        const media = selectStickerMedia(msg);
        if (!media || (animated && media.type !== 'videoMessage')) {
          return await sock.sendMessage(jid, {
            text: animated
              ? `❌ *Ação inválida!* _Envie ou responda um vídeo para criar uma figurinha animada._\n> 💡 *Use assim:* ${command('!stickeranim')}`
              : `❌ *Ação inválida!* _Envie ou responda uma imagem/vídeo._\n> 💡 *Use assim:* ${command('!sticker')} _ou_ ${command('!s')}`
          }, { quoted: msg });
        }
        await sock.sendMessage(jid, {
          text: animated
            ? `⏳ *Aguarde um instante!* _Criando sua figurinha animada…_`
            : `⏳ *Aguarde um instante!* _Criando sua figurinha…_`
        }, { quoted: msg });
        const buffer = await download(media.node, media.type);
        directory = fs.mkdtempSync(path.join(temporaryRoot, 'lobo-sticker-'));
        const input = path.join(directory, 'input');
        const output = path.join(directory, 'sticker.webp');
        if (media.type === 'stickerMessage' && media.node.isAnimated) {
          // An existing WhatsApp animation is already WebP; retain all its frames.
          fs.writeFileSync(output, buffer);
        } else if (media.type === 'videoMessage') {
          fs.writeFileSync(input, buffer);
          await convertVideo(input, output, animated);
        } else {
          // Existing PNG/WebP alpha is preserved; ordinary !s never removes backgrounds.
          const canvas = await require('sharp')(buffer, { limitInputPixels: 25000000 })
            .rotate()
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
          fs.writeFileSync(output, await encodeStaticSticker(canvas));
        }
        // O Baileys ignora `stickerMetadata`; pacote e autor vão no EXIF do
        // próprio WebP, inclusive nas animadas ("!s pacote | autor").
        const metadata = await metadataFor(sock, ctx, parseStickerArgs(args));
        await sock.sendMessage(jid, { sticker: withMetadata(fs.readFileSync(output), metadata) }, { quoted: msg });
      } catch (err) {
        await sock.sendMessage(jid, {
          text: `❌ *Ação inválida!* _Erro ao criar figurinha${animated ? ' animada' : ''}: ${err.message}_`
        }, { quoted: msg });
      } finally {
        if (directory) {
          for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
          fs.rmdirSync(directory);
        }
      }
    };
  }
  return { criarSticker: create(false), criarStickerAnimado: create(true) };
}
const { criarSticker, criarStickerAnimado } = createStickerHandlers();

// ============================
// STICKER PARA IMAGEM
// ============================
async function stickerParaImagem(sock, ctx) {
  const { jid, msg } = ctx;

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted?.stickerMessage) {
    return sock.sendMessage(jid, {
      text: `❌ *Ação inválida!* _Responda a uma figurinha._\n> 💡 *Use assim:* ${command('!toimg')}`
    }, { quoted: msg });
  }

  try {
    const { downloadContentFromMessage } = await loadBaileys();
    const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    await sock.sendMessage(jid, {
      image: buffer,
      caption: `✅ *Concluído!* _Figurinha convertida para imagem._`
    }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ *Ação inválida!* _Erro ao converter figurinha: ${err.message}_` }, { quoted: msg });
  }
}

module.exports = { criarSticker, criarStickerAnimado, stickerParaImagem, createStickerHandlers, selectStickerMedia };
