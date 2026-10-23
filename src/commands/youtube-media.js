'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const config = require('../config');
const MAX_BYTES = 32 * 1024 * 1024;
function filename(title, ext) {
  return (
    String(title || 'Lobo')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .slice(0, 90)
      .trim() +
    '.' +
    ext
  );
}
function bounded(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
function limiter(max = MAX_BYTES) {
  let bytes = 0;
  return new Transform({
    transform(chunk, encoding, cb) {
      bytes += chunk.length;
      cb(bytes > max ? new Error('SIZE_LIMIT') : null, chunk);
    },
  });
}
function validateQuery(query, ytdl) {
  if (query.length > 500) throw new Error('QUERY_LIMIT');
  if (/^(?:https?:\/\/|www\.)/i.test(query)) {
    const url = new URL(query.startsWith('www.') ? 'https://' + query : query);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      ![
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'youtu.be',
      ].includes(url.hostname) ||
      url.username ||
      url.password ||
      !ytdl.validateURL(url.href)
    )
      throw new Error('URL_INVALID');
    return url.href;
  }
  if (/^[a-z]+:\/\//i.test(query)) throw new Error('URL_INVALID');
  return null;
}
async function resolveVideo(query, { ytdl, search }) {
  const direct = validateQuery(query, ytdl);
  if (direct) return direct;
  const result = await search(query);
  const found = (result.videos || []).find((v) => v.url && ytdl.validateURL(v.url));
  if (!found) throw new Error('NOT_FOUND');
  return found.url;
}
async function downloadMedia({ url, info, kind, destination, ytdl, signal }) {
  if (kind === 'video') {
    const formats = info.formats
      .filter(
        (f) => f.hasVideo && f.hasAudio && f.container === 'mp4' && (!f.height || f.height <= 720),
      )
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    const format = formats.find((f) => !f.contentLength || Number(f.contentLength) <= MAX_BYTES);
    if (!format) throw new Error('FORMAT_UNAVAILABLE');
    const stream = ytdl.downloadFromInfo(info, { format, requestOptions: { timeout: 30000 } });
    const { createWriteStream } = require('node:fs');
    await pipeline(stream, limiter(), createWriteStream(destination), { signal });
  } else {
    const input = ytdl.downloadFromInfo(info, {
      quality: 'highestaudio',
      filter: 'audioonly',
      requestOptions: { timeout: 30000 },
    });
    const child = spawn(
      require('@ffmpeg-installer/ffmpeg').path,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vn',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-f',
        'mp3',
        '-y',
        destination,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'], shell: false },
    );
    child.stderr.resume();
    const abort = () => {
      input.destroy();
      child.kill('SIGKILL');
    };
    signal.addEventListener('abort', abort, { once: true });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('CONVERSION_FAILED')),
      );
    });
    try {
      await Promise.all([pipeline(input, limiter(), child.stdin, { signal }), exited]);
    } finally {
      signal.removeEventListener('abort', abort);
      input.destroy();
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
}
function createMediaHandler(
  kind,
  {
    search,
    ytdl,
    download = downloadMedia,
    fallback,
    timeout = 180000,
    tempRoot = os.tmpdir(),
  } = {},
) {
  return async (sock, ctx) => {
    const p = config.get('PREFIX'),
      command = kind === 'audio' ? 'play_audio' : 'play_video';
    const reply = (text) => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
    const query = (ctx.args || []).join(' ').trim();
    if (!query) return reply(`🌹 Informe nome ou link: ${p}${command} nome ou link 🐺`);
    if (!ytdl && require('../integrations/bronxys/key').getKey()) {
      const {definitions,queuedHandler}=require('../integrations/bronxys/handler');
      return queuedHandler(definitions.find(def=>def.name===(kind==='audio'?'play':'play_video')))(sock,ctx);
    }
    let directory;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const deps = {
        search: search || require('yt-search'),
        ytdl: ytdl || require('@distube/ytdl-core'),
      };
      const url = await bounded(resolveVideo(query, deps), Math.min(timeout, 30000));
      let info;
      const alternative =
        fallback || (!ytdl ? require('./youtube-provider').createYoutubeiAdapter : null);
      try {
        info = await bounded(deps.ytdl.getInfo(url), Math.min(timeout, 30000));
      } catch (error) {
        if (!alternative || controller.signal.aborted) throw error;
        deps.ytdl = await bounded(alternative(), 30000);
        info = await bounded(deps.ytdl.getInfo(url), 30000);
      }
      const duration = Number(info.videoDetails?.lengthSeconds),
        max = kind === 'audio' ? 1800 : 600;
      if (!Number.isFinite(duration) || duration <= 0 || duration > max)
        throw new Error('DURATION_LIMIT');
      if (controller.signal.aborted) throw new Error('TIMEOUT');
      await reply(`🌹 ${kind === 'audio' ? '🎵 Preparando áudio' : '🎬 Preparando vídeo'}… 🐺`);
      directory = await fs.mkdtemp(path.join(tempRoot, 'lobo-media-'));
      const ext = kind === 'audio' ? 'mp3' : 'mp4',
        file = path.join(directory, 'media.' + ext);
      const transfer = () =>
        bounded(
          download({
            url,
            info,
            kind,
            destination: file,
            ytdl: deps.ytdl,
            signal: controller.signal,
          }),
          timeout,
        );
      try {
        await transfer();
      } catch (error) {
        if (
          !alternative ||
          controller.signal.aborted ||
          ['SIZE_LIMIT', 'DURATION_LIMIT'].includes(error.message) ||
          info.raw
        )
          throw error;
        await fs.rm(file, { force: true });
        deps.ytdl = await bounded(alternative(), 30000);
        info = await bounded(deps.ytdl.getInfo(url), 30000);
        const seconds = Number(info.videoDetails?.lengthSeconds);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > max)
          throw Error('DURATION_LIMIT');
        await transfer();
      }
      const stat = await fs.stat(file);
      if (!stat.size || stat.size > MAX_BYTES) throw new Error('SIZE_LIMIT');
      const buffer = await fs.readFile(file);
      const content =
        kind === 'audio'
          ? {
              audio: buffer,
              mimetype: 'audio/mpeg',
              ptt: false,
              fileName: filename(info.videoDetails.title, ext),
            }
          : {
              video: buffer,
              mimetype: 'video/mp4',
              fileName: filename(info.videoDetails.title, ext),
              caption: `🎬 ${info.videoDetails.title}\n🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑`,
            };
      await bounded(sock.sendMessage(ctx.jid, content, { quoted: ctx.msg }), 30000);
    } catch (error) {
      controller.abort();
      const messages = {
        URL_INVALID: 'Use um link válido do YouTube ou o nome da mídia.',
        QUERY_LIMIT: 'Pesquisa muito longa.',
        NOT_FOUND: 'Nenhum resultado encontrado.',
        DURATION_LIMIT: `Máximo: ${kind === 'audio' ? '30' : '10'} minutos.`,
        SIZE_LIMIT: 'A mídia excede o limite de 32 MB.',
        FORMAT_UNAVAILABLE:
          'Não há MP4 com áudio disponível neste vídeo. Tente outro vídeo ou o áudio.',
        TIMEOUT: 'O serviço demorou demais. Tente novamente.',
      };
      await reply(
        `🌹 ⚠️ ${messages[error.message] || 'Não foi possível obter a mídia. O serviço pode estar indisponível; tente outro vídeo ou tente novamente mais tarde.'} 🐺`,
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (directory) await fs.rm(directory, { recursive: true, force: true });
    }
  };
}
module.exports = { createMediaHandler, resolveVideo, downloadMedia, limiter, MAX_BYTES, filename };
