'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — MÍDIA & DOWNLOADS
// ============================================================

const { BOT_NAME, sleep } = require('../utils/helpers');
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

// ── YouTube busca ─────────────────────────────────────────────
async function play(sock, ctx) {
  const { jid, msg, args } = ctx;
  if (!args.length) return sock.sendMessage(jid, {
    text: `❌ Informe o nome da música!\n_Ex: !play Shape of You_`
  }, { quoted: msg });

  const query = args.join(' ');
  await sock.sendMessage(jid, {
    text: `🎵 *[ ${BOT_NAME} ]*\n\n🔍 Procurando: *${query}*\n_Aguarde..._`
  }, { quoted: msg });

  try {
    const yts     = require('yt-search');
    const results = await yts(query);
    const video   = results.videos?.[0];
    if (!video) return sock.sendMessage(jid, { text: `❌ Nenhum resultado para: ${query}` }, { quoted: msg });

    await sock.sendMessage(jid, {
      text: `🎵 *[ ${BOT_NAME} ]*\n\n✅ *Encontrado!*\n\n📌 *${video.title}*\n👤 ${video.author?.name}\n⏱️ ${video.timestamp}\n👁️ ${video.views?.toLocaleString() || '?'}\n\n🔗 ${video.url}\n\n_Use !ytmp3 ${query} para baixar!_`
    }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao buscar música!` }, { quoted: msg });
  }
}

// ── YouTube MP3 ───────────────────────────────────────────────
async function playMp3(sock, ctx) {
  const { jid, msg, args } = ctx;
  if (!args.length) return sock.sendMessage(jid, {
    text: `❌ Informe o nome ou URL!\n_Ex: !ytmp3 Bohemian Rhapsody_`
  }, { quoted: msg });

  const query = args.join(' ');
  await sock.sendMessage(jid, {
    text: `🎵 *[ ${BOT_NAME} ]*\n\n⏬ Baixando áudio: *${query}*\n_Aguarde..._`
  }, { quoted: msg });

  try {
    const yts  = require('yt-search');
    const ytdl = require('@distube/ytdl-core');
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffmpeg.setFfmpegPath(ffmpegPath);

    let url = query;
    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const res = await yts(query);
      const v   = res.videos?.[0];
      if (!v) return sock.sendMessage(jid, { text: `❌ Música não encontrada!` }, { quoted: msg });
      url = v.url;
    }

    const info     = await ytdl.getInfo(url);
    const title    = info.videoDetails.title;
    const duration = parseInt(info.videoDetails.lengthSeconds);

    if (duration > 600) return sock.sendMessage(jid, {
      text: `❌ Muito longo! Máximo: 10 minutos.`
    }, { quoted: msg });

    const tmpFile = path.join(os.tmpdir(), `lobo_audio_${Date.now()}.mp3`);

    await new Promise((resolve, reject) => {
      ffmpeg(ytdl(url, { quality: 'highestaudio', filter: 'audioonly' }))
        .audioBitrate(128)
        .toFormat('mp3')
        .save(tmpFile)
        .on('end', resolve)
        .on('error', reject);
    });

    await sock.sendMessage(jid, {
      audio: fs.readFileSync(tmpFile),
      mimetype: 'audio/mpeg',
      ptt: false,
    }, { quoted: msg });

    await sock.sendMessage(jid, {
      text: `✅ *[ ${BOT_NAME} ]*\n\n🎵 *${title}*\n\n_Aproveite a música, guerreiro! 🐺🎶_`
    }, { quoted: msg });

    fs.unlinkSync(tmpFile);
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao baixar áudio!\n_${err.message}_` }, { quoted: msg });
  }
}

// ── YouTube MP4 ───────────────────────────────────────────────
async function playMp4(sock, ctx) {
  const { jid, msg, args } = ctx;
  if (!args.length) return sock.sendMessage(jid, {
    text: `❌ Informe o nome ou URL!\n_Ex: !ytmp4 tutorial Node.js_`
  }, { quoted: msg });

  const query = args.join(' ');
  await sock.sendMessage(jid, {
    text: `🎬 *[ ${BOT_NAME} ]*\n\n⏬ Baixando vídeo: *${query}*\n_Aguarde..._`
  }, { quoted: msg });

  try {
    const yts  = require('yt-search');
    const ytdl = require('@distube/ytdl-core');

    let url = query;
    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const res = await yts(query);
      const v   = res.videos?.[0];
      if (!v) return sock.sendMessage(jid, { text: `❌ Vídeo não encontrado!` }, { quoted: msg });
      url = v.url;
    }

    const info     = await ytdl.getInfo(url);
    const title    = info.videoDetails.title;
    const duration = parseInt(info.videoDetails.lengthSeconds);

    if (duration > 300) return sock.sendMessage(jid, {
      text: `❌ Muito longo! Máximo: 5 minutos.`
    }, { quoted: msg });

    const tmpFile   = path.join(os.tmpdir(), `lobo_video_${Date.now()}.mp4`);
    const stream    = ytdl(url, { quality: '18' });
    const writeStream = fs.createWriteStream(tmpFile);
    stream.pipe(writeStream);

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    await sock.sendMessage(jid, {
      video: fs.readFileSync(tmpFile),
      caption: `🎬 *${title}*\n\n🌹 *[ ${BOT_NAME} ]*`,
      mimetype: 'video/mp4',
    }, { quoted: msg });

    fs.unlinkSync(tmpFile);
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao baixar vídeo!\n_${err.message}_` }, { quoted: msg });
  }
}

// ── TikTok ────────────────────────────────────────────────────
async function tiktok(sock, ctx) {
  const { jid, msg, args } = ctx;
  const url = args[0];
  if (!url || !url.includes('tiktok')) return sock.sendMessage(jid, {
    text: `❌ Informe um link do TikTok!\n_Ex: !tiktok https://vm.tiktok.com/..._`
  }, { quoted: msg });

  await sock.sendMessage(jid, {
    text: `📱 *[ ${BOT_NAME} ]*\n\n⏬ Baixando TikTok sem marca d'água...\n_Aguarde..._`
  }, { quoted: msg });

  try {
    const apiUrl  = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const res     = await axios.get(apiUrl, { timeout: 15000 });
    const data    = res.data?.data;

    if (!data?.play) return sock.sendMessage(jid, {
      text: `❌ Não foi possível baixar!\n_Link inválido ou privado._`
    }, { quoted: msg });

    const buf = await axios.get(data.play, { responseType: 'arraybuffer', timeout: 30000 });

    await sock.sendMessage(jid, {
      video: Buffer.from(buf.data),
      caption: `🎵 *${data.title || 'TikTok'}*\n👤 @${data.author?.unique_id || 'autor'}\n❤️ ${data.digg_count?.toLocaleString() || 0} curtidas\n\n🌹 *[ ${BOT_NAME} ]*`,
      mimetype: 'video/mp4',
    }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao baixar TikTok!\n_${err.message}_` }, { quoted: msg });
  }
}

// ── Instagram ─────────────────────────────────────────────────
async function instagram(sock, ctx) {
  const { jid, msg, args } = ctx;
  const url = args[0];
  if (!url || !url.includes('instagram')) return sock.sendMessage(jid, {
    text: `❌ Informe um link do Instagram!\n_Ex: !ig https://instagram.com/p/..._`
  }, { quoted: msg });

  await sock.sendMessage(jid, {
    text: `📸 *[ ${BOT_NAME} ]*\n\n⏬ Baixando do Instagram...\n_Aguarde..._`
  }, { quoted: msg });

  try {
    const apiUrl = `https://saveig.app/api?url=${encodeURIComponent(url)}`;
    const res    = await axios.get(apiUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const mediaUrl = res.data?.data?.[0]?.url;

    if (!mediaUrl) return sock.sendMessage(jid, {
      text: `❌ Não foi possível baixar!\n_Post pode ser privado._`
    }, { quoted: msg });

    const buf     = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const isVideo = mediaUrl.includes('.mp4') || res.data?.data?.[0]?.type === 'video';

    if (isVideo) {
      await sock.sendMessage(jid, {
        video: Buffer.from(buf.data),
        caption: `📹 *Instagram*\n\n🌹 *[ ${BOT_NAME} ]*`,
        mimetype: 'video/mp4',
      }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, {
        image: Buffer.from(buf.data),
        caption: `📸 *Instagram*\n\n🌹 *[ ${BOT_NAME} ]*`,
      }, { quoted: msg });
    }
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao baixar do Instagram!` }, { quoted: msg });
  }
}

// ── Spotify ───────────────────────────────────────────────────
async function spotify(sock, ctx) {
  const { jid, msg, args } = ctx;
  if (!args.length) return sock.sendMessage(jid, {
    text: `❌ Informe o nome!\n_Ex: !spotify Blinding Lights_`
  }, { quoted: msg });

  const query = args.join(' ');
  await sock.sendMessage(jid, {
    text: `🎧 *[ ${BOT_NAME} ]*\n\n🎵 *Busca Spotify:* ${query}\n\n🔗 https://open.spotify.com/search/${encodeURIComponent(query)}\n\n_Para download de áudio, use !ytmp3 ${query}_`
  }, { quoted: msg });
}

module.exports = { play, playMp3, playMp4, tiktok, instagram, spotify };
