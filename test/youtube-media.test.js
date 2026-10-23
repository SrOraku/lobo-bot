'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createMediaHandler,
  resolveVideo,
  limiter,
  MAX_BYTES,
} = require('../src/commands/youtube-media');
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
function fixture(kind, overrides = {}) {
  const sent = [],
    targets = [];
  const ytdl = {
    validateURL: (u) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u),
    getInfo: async (url) => {
      targets.push(url);
      return { videoDetails: { title: 'Teste / mídia', lengthSeconds: 30 }, formats: [] };
    },
  };
  const handler = createMediaHandler(kind, {
    search: async () => ({ videos: [{ url: URL }] }),
    ytdl,
    download: async ({ destination }) => fs.writeFile(destination, Buffer.from('media')),
    ...overrides,
  });
  return {
    sent,
    targets,
    ytdl,
    async run(args = ['teste']) {
      await handler(
        { sendMessage: async (j, c) => sent.push(c) },
        { jid: 'x@s.whatsapp.net', msg: {}, args },
      );
      return sent;
    },
  };
}
for (const kind of ['audio', 'video']) {
  test(`${kind}: nome e URL enviam mídia com MIME, extensão e limpeza`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-test-'));
    try {
      for (const args of [['uma', 'música'], [URL]]) {
        const f = fixture(kind, { tempRoot: root });
        await f.run(args);
        assert.equal(f.targets[0], URL);
        const media = f.sent.find((c) => c[kind]);
        assert.ok(media);
        assert.equal(media.mimetype, kind === 'audio' ? 'audio/mpeg' : 'video/mp4');
        assert.ok(media.fileName.endsWith(kind === 'audio' ? '.mp3' : '.mp4'));
        assert.ok(!media.fileName.includes('/'));
        assert.deepEqual(await fs.readdir(root), []);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  test(`${kind}: falha de envio não deixa temporários ou detalhes internos`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-fail-'));
    const text = [];
    try {
      const handler = createMediaHandler(kind, {
        tempRoot: root,
        search: async () => ({ videos: [{ url: URL }] }),
        ytdl: fixture(kind).ytdl,
        download: async ({ destination }) => {
          await fs.writeFile(destination, 'partial');
          throw Error('/segredo/token');
        },
      });
      await handler(
        { sendMessage: async (j, c) => text.push(c.text) },
        { jid: 'x', args: ['teste'], msg: {} },
      );
      assert.deepEqual(await fs.readdir(root), []);
      assert.ok(!text.join('').includes('segredo'));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  test(`${kind}: valida argumentos, URL, busca vazia e duração`, async () => {
    let f = fixture(kind);
    await f.run([]);
    assert.equal(f.targets.length, 0);
    f = fixture(kind);
    await f.run(['https://youtube.com.evil.test/a']);
    assert.equal(f.targets.length, 0);
    f = fixture(kind, { search: async () => ({ videos: [] }) });
    await f.run();
    assert.match(f.sent.at(-1).text, /Nenhum resultado/);
    f = fixture(kind);
    f.ytdl.getInfo = async () => ({ videoDetails: { lengthSeconds: 9999 } });
    await f.run();
    assert.match(f.sent.at(-1).text, /Máximo/);
  });
}
test('timeout interrompe serviço externo e retorna mensagem limpa', async () => {
  const f = fixture('audio', { timeout: 10, search: () => new Promise(() => {}) });
  await f.run();
  assert.match(f.sent.at(-1).text, /demorou/);
});
test('limite de tamanho rejeita stream sem carregar tudo em memória', async () => {
  const { Readable, Writable } = require('node:stream');
  const { pipeline } = require('node:stream/promises');
  await assert.rejects(
    pipeline(
      Readable.from([Buffer.alloc(8), Buffer.alloc(8)]),
      limiter(10),
      new Writable({
        write(c, e, cb) {
          cb();
        },
      }),
    ),
    /SIZE_LIMIT/,
  );
  assert.equal(MAX_BYTES, 32 * 1024 * 1024);
});

test('pipeline real converte áudio com FFmpeg e rejeita stream quebrado', async () => {
  const { downloadMedia } = require('../src/commands/youtube-media');
  const { Readable } = require('node:stream');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-ffmpeg-'));
  // PCM WAV de um segundo: exercita o conversor real sem rede ou WhatsApp.
  const pcm = Buffer.alloc(16000),
    wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  try {
    const dest = path.join(dir, 'audio.mp3');
    await downloadMedia({
      url: URL,
      info: {},
      kind: 'audio',
      destination: dest,
      ytdl: { downloadFromInfo: () => Readable.from([wav]) },
      signal: new AbortController().signal,
    });
    assert.ok((await fs.stat(dest)).size > 0);
    await assert.rejects(
      downloadMedia({
        url: URL,
        info: { formats: [{ container: 'mp4', hasAudio: true, hasVideo: true, height: 360 }] },
        kind: 'video',
        destination: path.join(dir, 'video.mp4'),
        ytdl: {
          downloadFromInfo: () =>
            new Readable({
              read() {
                this.destroy(Error('stream falhou'));
              },
            }),
        },
        signal: new AbortController().signal,
      }),
      /stream falhou/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('play baixa MP3 por padrão e encaminha vídeo sem modificar os argumentos originais', async () => {
  const { createPlay } = require('../src/commands/media');
  const calls = [];
  const play = createPlay({
    audio: async (s, c) => calls.push(['audio', c.args]),
    video: async (s, c) => calls.push(['video', c.args]),
  });
  const args = ['video', 'nome', 'da', 'música'];
  await play({}, { args: ['nome', 'da', 'música'] });
  await play({}, { args });
  await play({}, { args: ['MP3', URL] });
  assert.deepEqual(calls, [
    ['audio', ['nome', 'da', 'música']],
    ['video', ['nome', 'da', 'música']],
    ['audio', [URL]],
  ]);
  assert.equal(args[0], 'video');
});
test('música de 14 minutos é aceita e falha de metadados usa outro cliente', async () => {
  const primary = {
    validateURL: () => true,
    getInfo: async () => {
      throw Error('DECIPHER_FAILED');
    },
  };
  const secondary = {
    getInfo: async () => ({ videoDetails: { title: 'Música', lengthSeconds: 852 } }),
  };
  const f = fixture('audio', { ytdl: primary, fallback: async () => secondary });
  await f.run([URL]);
  assert.ok(f.sent.some((c) => c.audio));
});
test('erro no stream principal tenta outro cliente e envia o arquivo', async () => {
  let attempts = 0;
  const f = fixture('video', {
    fallback: async () => ({
      getInfo: async () => ({ videoDetails: { title: 'Vídeo', lengthSeconds: 20 }, raw: {} }),
    }),
    download: async ({ destination }) => {
      attempts++;
      if (attempts === 1) throw Error('HTTP_403');
      await fs.writeFile(destination, 'video');
    },
  });
  await f.run();
  assert.equal(attempts, 2);
  assert.ok(f.sent.some((c) => c.video));
});
test('cliente alternativo entrega stream de mídia em vez de link', async () => {
  const { createYoutubeiAdapter } = require('../src/commands/youtube-provider');
  const { Readable } = require('node:stream');
  const adapter = await createYoutubeiAdapter({
    create: async () => ({
      getBasicInfo: async () => ({
        basic_info: { title: 'Teste', duration: 20 },
        download: async () => Readable.toWeb(Readable.from([Buffer.from('media-real')])),
      }),
    }),
  });
  const info = await adapter.getInfo(URL);
  const parts = [];
  for await (const chunk of adapter.downloadFromInfo(info, { filter: 'audioonly' }))
    parts.push(chunk);
  assert.equal(Buffer.concat(parts).toString(), 'media-real');
});

test('script de assinatura usa interpretador isolado e retorna o resultado', async () => {
  const { evaluatePlayer } = require('../src/commands/youtube-script');
  const result = await evaluatePlayer({ output: '({sig: "assinatura", n: "teste"})' });
  assert.deepEqual(result, { sig: 'assinatura', n: 'teste' });
  await assert.rejects(evaluatePlayer({ output: null }), /PLAYER_SCRIPT_INVALID/);
});
test('configured API is used before the legacy YouTube client for both media types',async()=>{
 for(const kind of ['audio','video']) {
  let calls=0;
  const handler=createMediaHandler(kind,{api:{configured:()=>true,download:async(type,sock,ctx)=>{calls++;assert.equal(type,kind);assert.deepEqual(ctx.args,['Música','Nome']);}},search:async()=>{throw Error('legacy must not run');}});
  await handler({sendMessage:async()=>{throw Error('unexpected reply');}},{jid:'123@g.us',args:['Música','Nome'],msg:{}});
  assert.equal(calls,1);
 }
});
test('missing API key gives actionable setup guidance when free downloader fails',async()=>{
 const sent=[];const handler=createMediaHandler('audio',{api:{configured:()=>false},search:async()=>{throw Error('legacy search failed');}});
 await handler({sendMessage:async(jid,data)=>sent.push(data.text)},{jid:'123@g.us',args:['Nome'],msg:{}});
 assert.ok(sent.at(-1).includes('apibronxys chave SUA_CHAVE'));assert.ok(sent.at(-1).includes('não está configurada'));
});
test('unreadable API configuration is handled without attempting free download',async()=>{
 const sent=[];const handler=createMediaHandler('audio',{api:{configured:()=>{throw Error('private-path');}},search:async()=>{throw Error('must not run');}});
 await handler({sendMessage:async(jid,data)=>sent.push(data.text)},{jid:'123@g.us',args:['Nome'],msg:{}});
 assert.ok(sent[0].includes('apibronxys status'));assert.equal(sent[0].includes('private-path'),false);
});
