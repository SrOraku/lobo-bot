'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — MÍDIA & DOWNLOADS
// ============================================================

const { BOT_NAME, PREFIX } = require('../utils/helpers');
const axios = require('axios');
const {card,mono,command}=require('../ui/text');

// !play baixa MP3 por padrão. !play video baixa MP4.
function createPlay({ audio, video }) {
  return (sock, ctx) => {
    const args = [...(ctx.args || [])];
    const mode = args[0]?.toLowerCase();
    const isVideo = ['video', 'vídeo', 'mp4'].includes(mode);
    if (isVideo || ['audio', 'áudio', 'mp3'].includes(mode)) args.shift();
    return (isVideo ? video : audio)(sock, { ...ctx, args });
  };
}

// Downloads compartilhados pelos nomes antigos e play_audio/play_video.
const { createMediaHandler } = require('./youtube-media');
const playMp3 = createMediaHandler('audio');
const playMp4 = createMediaHandler('video');
const play = createPlay({ audio: playMp3, video: playMp4 });

// ── TikTok ────────────────────────────────────────────────────
async function tiktok(sock, ctx) {
  if(require('../integrations/bronxys/key').getKey()) {
    const {definitions,queuedHandler}=require('../integrations/bronxys/handler');
    return queuedHandler(definitions.find(def=>def.name==='tiktok_video'))(sock,ctx);
  }
  const { jid, msg, args } = ctx;
  const url = args[0];
  if (!url || !url.includes('tiktok'))
    return sock.sendMessage(
      jid,
      {
        text: `❌ *Ação inválida!* _Informe um link do TikTok._\n> 💡 *Use assim:* ${command(`${PREFIX}tiktok https://vm.tiktok.com/...`)}`,
      },
      { quoted: msg },
    );

  await sock.sendMessage(
    jid,
    {
      text: `⏳ *Aguarde um instante!* _Baixando TikTok sem marca d'água…_`,
    },
    { quoted: msg },
  );

  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const data = res.data?.data;

    if (!data?.play)
      return sock.sendMessage(
        jid,
        {
          text: `❌ *Ação inválida!* _Não foi possível baixar: link inválido ou privado._`,
        },
        { quoted: msg },
      );

    const buf = await axios.get(data.play, { responseType: 'arraybuffer', timeout: 30000 });

    await sock.sendMessage(
      jid,
      {
        video: Buffer.from(buf.data),
        caption: card('TIKTOK',[`🎵 *Título:* ${data.title || 'TikTok'}`,`👤 *Autor:* @${data.author?.unique_id || 'autor'}`,`❤️ *Curtidas:* ${mono(data.digg_count?.toLocaleString() || 0)}`],{formatNumbers:false}),
        mimetype: 'video/mp4',
      },
      { quoted: msg },
    );
  } catch (err) {
    await sock.sendMessage(
      jid,
      { text: `❌ *Ação inválida!* _Erro ao baixar TikTok: ${err.message}_` },
      { quoted: msg },
    );
  }
}

// ── Instagram ─────────────────────────────────────────────────
async function instagram(sock, ctx) {
  if(require('../integrations/bronxys/key').getKey()) {
    const {definitions,queuedHandler}=require('../integrations/bronxys/handler');
    return queuedHandler(definitions.find(def=>def.name==='instagram'))(sock,ctx);
  }
  const { jid, msg, args } = ctx;
  const url = args[0];
  if (!url || !url.includes('instagram'))
    return sock.sendMessage(
      jid,
      {
        text: `❌ *Ação inválida!* _Informe um link do Instagram._\n> 💡 *Use assim:* ${command(`${PREFIX}ig https://instagram.com/p/...`)}`,
      },
      { quoted: msg },
    );

  await sock.sendMessage(
    jid,
    {
      text: `⏳ *Aguarde um instante!* _Baixando do Instagram…_`,
    },
    { quoted: msg },
  );

  try {
    const apiUrl = `https://saveig.app/api?url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const mediaUrl = res.data?.data?.[0]?.url;

    if (!mediaUrl)
      return sock.sendMessage(
        jid,
        {
          text: `❌ *Ação inválida!* _Não foi possível baixar: o post pode ser privado._`,
        },
        { quoted: msg },
      );

    const buf = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const isVideo = mediaUrl.includes('.mp4') || res.data?.data?.[0]?.type === 'video';

    if (isVideo) {
      await sock.sendMessage(
        jid,
        {
          video: Buffer.from(buf.data),
          caption: `✅ *Concluído!* _Vídeo do Instagram entregue._`,
          mimetype: 'video/mp4',
        },
        { quoted: msg },
      );
    } else {
      await sock.sendMessage(
        jid,
        {
          image: Buffer.from(buf.data),
          caption: `✅ *Concluído!* _Imagem do Instagram entregue._`,
        },
        { quoted: msg },
      );
    }
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ *Ação inválida!* _Erro ao baixar do Instagram._` }, { quoted: msg });
  }
}

// ── Spotify ───────────────────────────────────────────────────
async function spotify(sock, ctx) {
  if(require('../integrations/bronxys/key').getKey() && /^https?:\/\//i.test((ctx.args||[]).join(' '))) {
    const {definitions,queuedHandler}=require('../integrations/bronxys/handler');
    return queuedHandler(definitions.find(def=>def.name==='spotify'))(sock,ctx);
  }
  const { jid, msg, args } = ctx;
  if (!args.length)
    return sock.sendMessage(
      jid,
      {
        text: `❌ *Ação inválida!* _Informe o nome da música._\n> 💡 *Use assim:* ${command(`${PREFIX}spotify Blinding Lights`)}`,
      },
      { quoted: msg },
    );

  const query = args.join(' ');
  await sock.sendMessage(
    jid,
    {
      text: card('BUSCA SPOTIFY',[`🎵 *Pesquisa:* ${query}`,`🔗 https://open.spotify.com/search/${encodeURIComponent(query)}`],{tip:`_Para baixar o áudio, use_ ${command(`${PREFIX}ytmp3 ${query}`)}`,formatNumbers:false}),
    },
    { quoted: msg },
  );
}

module.exports = { createPlay, play, playMp3, playMp4, tiktok, instagram, spotify };
