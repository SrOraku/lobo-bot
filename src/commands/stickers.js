'use strict';
const { BOT_NAME } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

let baileysModulePromise = null;
function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys');
  }
  return baileysModulePromise;
}

async function getQuotedMedia(sock, msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return null;

  const msgType = Object.keys(quoted)[0];
  if (!['imageMessage', 'videoMessage', 'stickerMessage'].includes(msgType)) return null;

  try {
    const { downloadContentFromMessage } = await loadBaileys();
    const stream = await downloadContentFromMessage(quoted[msgType], msgType.replace('Message', ''));
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), type: msgType };
  } catch { return null; }
}

async function getDirectMedia(sock, msg) {
  const msgType = Object.keys(msg.message)[0];
  if (!['imageMessage', 'videoMessage'].includes(msgType)) return null;

  try {
    const { downloadContentFromMessage } = await loadBaileys();
    const stream = await downloadContentFromMessage(msg.message[msgType], msgType.replace('Message', ''));
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), type: msgType };
  } catch { return null; }
}

// ============================
// CRIAR STICKER NORMAL
// ============================
async function criarSticker(sock, ctx) {
  const { jid, msg, args } = ctx;

  const media = await getQuotedMedia(sock, msg) || await getDirectMedia(sock, msg);
  if (!media) {
    return sock.sendMessage(jid, {
      text: `🎭 *[ ${BOT_NAME} ]*\n\nEnvie ou responda uma imagem/vídeo com *!sticker*!\n\n_Opções:_\n• !sticker - Criar figurinha normal\n• !s - Atalho`
    }, { quoted: msg });
  }

  await sock.sendMessage(jid, {
    text: `⏳ *[ ${BOT_NAME} ]*\n\n🎭 Criando figurinha...\n_Aguarde!_`
  }, { quoted: msg });

  try {
    const sharp = require('sharp');
    const tmpInput = path.join(os.tmpdir(), `lobo_input_${Date.now()}`);
    const tmpOutput = path.join(os.tmpdir(), `lobo_sticker_${Date.now()}.webp`);

    fs.writeFileSync(tmpInput, media.buffer);

    if (media.type === 'imageMessage') {
      await sharp(media.buffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toFile(tmpOutput);
    } else {
      // Para vídeo, usar ffmpeg
      const ffmpeg = require('fluent-ffmpeg');
      const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
      ffmpeg.setFfmpegPath(ffmpegPath);

      await new Promise((resolve, reject) => {
        ffmpeg(tmpInput)
          .inputOptions(['-t 3'])
          .outputOptions(['-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000', '-loop', '0', '-preset', 'default', '-an', '-vsync', '0'])
          .toFormat('webp')
          .save(tmpOutput)
          .on('end', resolve)
          .on('error', reject);
      });
    }

    const packname = args.join(' ') || BOT_NAME;

    await sock.sendMessage(jid, {
      sticker: fs.readFileSync(tmpOutput),
      ...(args.length ? { stickerMetadata: { packname, author: BOT_NAME } } : {})
    }, { quoted: msg });

    fs.unlinkSync(tmpInput);
    fs.unlinkSync(tmpOutput);

  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao criar figurinha!\n_${err.message}_` }, { quoted: msg });
  }
}

// ============================
// CRIAR STICKER ANIMADO
// ============================
async function criarStickerAnimado(sock, ctx) {
  const { jid, msg } = ctx;

  const media = await getQuotedMedia(sock, msg) || await getDirectMedia(sock, msg);
  if (!media || media.type !== 'videoMessage') {
    return sock.sendMessage(jid, {
      text: `🎭 *[ ${BOT_NAME} ]*\n\nEnvie ou responda um *vídeo* com *!stickeranim* para criar um sticker animado!`
    }, { quoted: msg });
  }

  await sock.sendMessage(jid, {
    text: `⏳ *[ ${BOT_NAME} ]*\n\n🎭 Criando sticker animado...\n_Pode demorar um pouco!_`
  }, { quoted: msg });

  try {
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffmpeg.setFfmpegPath(ffmpegPath);

    const tmpInput = path.join(os.tmpdir(), `lobo_vid_${Date.now()}.mp4`);
    const tmpOutput = path.join(os.tmpdir(), `lobo_anim_${Date.now()}.webp`);

    fs.writeFileSync(tmpInput, media.buffer);

    await new Promise((resolve, reject) => {
      ffmpeg(tmpInput)
        .inputOptions(['-t 6'])
        .outputOptions([
          '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000',
          '-loop', '0',
          '-preset', 'default',
          '-an', '-vsync', '0'
        ])
        .toFormat('webp')
        .save(tmpOutput)
        .on('end', resolve)
        .on('error', reject);
    });

    await sock.sendMessage(jid, {
      sticker: fs.readFileSync(tmpOutput)
    }, { quoted: msg });

    fs.unlinkSync(tmpInput);
    fs.unlinkSync(tmpOutput);

  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao criar sticker animado!\n_${err.message}_` }, { quoted: msg });
  }
}

// ============================
// STICKER PARA IMAGEM
// ============================
async function stickerParaImagem(sock, ctx) {
  const { jid, msg } = ctx;

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted?.stickerMessage) {
    return sock.sendMessage(jid, {
      text: `❌ Responda a um *sticker* com *!toimg*!`
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
      caption: `🖼️ *[ ${BOT_NAME} ]*\n\n_Sticker convertido para imagem!_`
    }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao converter sticker!\n_${err.message}_` }, { quoted: msg });
  }
}

module.exports = { criarSticker, criarStickerAnimado, stickerParaImagem };
