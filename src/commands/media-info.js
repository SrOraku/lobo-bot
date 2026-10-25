'use strict';

function duration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  return [Math.floor(n / 60), String(Math.floor(n % 60)).padStart(2, '0')].join(':');
}
function renderMediaInfo(info = {}) {
  const rows = [
    '╔═══❖♆❖═══╗',
    '*🐺 MÍDIA DA MATILHA*',
    '',
    `🎵 Título: ${info.title || 'Não informado pela fonte'}`,
    `⏱️ Duração: ${info.timestamp || duration(info.lengthSeconds) || 'Não informada pela fonte'}`,
    `📅 Publicação: ${info.ago || info.publishDate || 'Não informada pela fonte'}`,
    `📺 Canal: ${info.author?.name || info.ownerChannelName || 'Não informado pela fonte'}`,
    '',
    '📝 *Descrição original:*',
    info.description || 'Não disponibilizada pela fonte.',
    '',
    '╚═══❖♆❖═══╝',
  ];
  return rows.join('\n');
}
async function sendMediaInfo(reply, info) {
  // Preserve the source text, including line breaks, across WhatsApp-sized messages.
  const text = renderMediaInfo(info);
  for (let index = 0; index < text.length; index += 3500) await reply(text.slice(index, index + 3500));
}
async function lookupMedia(query, search = require('yt-search')) {
  let timer;
  const lookup = async () => {
    let id;
    if (/^https?:\/\//i.test(query)) {
      const url = new URL(query);
      if (!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname)) return null;
      id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.split('/')[2];
      if (!/^[\w-]{11}$/.test(id || '')) return null;
    } else {
      const found = (await search(query)).videos?.[0];
      if (!found) return null;
      id = found.videoId;
    }
    if (!/^[\w-]{11}$/.test(id || '')) return null;
    const video = await search({ videoId: id });
    return { ...video, url: `https://www.youtube.com/watch?v=${id}` };
  };
  try {
    return await Promise.race([lookup(), new Promise(resolve => { timer = setTimeout(() => resolve(null), 10000); })]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
module.exports = { renderMediaInfo, sendMediaInfo, lookupMedia };
