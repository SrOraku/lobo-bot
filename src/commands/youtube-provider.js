'use strict';
const { Readable } = require('node:stream');

// Cliente alternativo em JavaScript: não depende dos decifradores do ytdl-core.
async function createYoutubeiAdapter({ create, fetch: customFetch } = {}) {
  if (!create) {
    const { Innertube, Platform } = await import('youtubei.js');
    Platform.shim.eval = require('./youtube-script').evaluatePlayer;
    create = (options) => Innertube.create(options);
  }
  const fetch =
    customFetch ||
    (async (input, init = {}) => {
      // Axios respeita o proxy do servidor e mantém limites para cada resposta.
      const axios = require('axios');
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      const response = await axios.request({
        url,
        method: init.method || input?.method || 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        data: init.body,
        responseType: 'arraybuffer',
        timeout: 30000,
        signal: init.signal,
        maxContentLength: 32 * 1024 * 1024,
        maxBodyLength: 1024 * 1024,
        validateStatus: () => true,
      });
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (value != null && !['content-encoding', 'content-length'].includes(key))
          headers.set(key, String(value));
      }
      const result = new Response(
        [204, 205, 304].includes(response.status) ? null : response.data,
        { status: response.status, headers },
      );
      Object.defineProperty(result, 'url', { value: response.request?.res?.responseUrl || url });
      return result;
    });
  const youtube = await create({ generate_session_locally: true, fetch });
  const legacy = require('@distube/ytdl-core');
  return {
    validateURL: legacy.validateURL,
    async getInfo(url) {
      const id = legacy.getURLVideoID(url);
      const raw = await youtube.getBasicInfo(id, { client: 'ANDROID' });
      const details = raw.basic_info;
      if (!details?.duration) throw Error('VIDEO_UNAVAILABLE');
      return {
        videoDetails: { title: details.title, lengthSeconds: details.duration, description: details.short_description, author: {name: details.author}, publishDate: details.publish_date },
        formats: [{ hasAudio: true, hasVideo: true, container: 'mp4', height: 360 }],
        raw,
      };
    },
    downloadFromInfo(info, options) {
      const audio = options.filter === 'audioonly';
      return Readable.from(
        (async function* () {
          const stream = await info.raw.download({
            type: audio ? 'audio' : 'video+audio',
            format: audio ? 'any' : 'mp4',
            quality: audio ? 'best' : '360p',
          });
          for await (const chunk of Readable.fromWeb(stream)) yield chunk;
        })(),
      );
    },
  };
}
module.exports = { createYoutubeiAdapter };
