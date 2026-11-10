'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { refineCutout, distanceTransform, addOutline } = require('../src/media/matting');
const { parseMode, cutoutPayloads, COLORS } = require('../src/media/cutout');
const { setStickerMetadata, readStickerMetadata, listChunks } = require('../src/media/webp-exif');
const { fillTemplate, metadataFor, parseStickerArgs, encodeStaticSticker, withMetadata, QUALITY_STEPS } = require('../src/media/sticker-tools');

const RED = [200, 40, 40], GREEN = [40, 220, 40];

// RGBA "como o modelo devolve": RGB original da foto e alpha da máscara.
function canvas(width, height, paint) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a] = paint(x, y), i = (y * width + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return { data, width, height };
}
const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];
const inside = (x, y, left, top, size) => x >= left && x < left + size && y >= top && y < top + size;
const png = image => sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();

function subjectWithDefects() {
  // Quadrado vermelho 80×80 em (60,60) sobre fundo verde, com furo pequeno (2×2,
  // abaixo de 0,15% da área do assunto), furo grande (20×20) e uma mancha solta 3×3.
  return canvas(200, 200, (x, y) => {
    const smallHole = inside(x, y, 80, 80, 2), bigHole = inside(x, y, 100, 100, 20);
    if (inside(x, y, 60, 60, 80) && !smallHole && !bigHole) return [...RED, 255];
    if (inside(x, y, 10, 10, 3)) return [...RED, 255];
    return [...GREEN, 0];
  });
}

test('refinement removes loose specks, closes small holes and reports the subject box', () => {
  const result = refineCutout(subjectWithDefects());
  assert.equal(result.width, 200); assert.equal(result.height, 200);
  assert.deepEqual(result.bbox, { left: 60, top: 60, width: 80, height: 80 });
  assert.equal(alphaAt(result, 11, 11), 0, 'loose speck must disappear');
  assert.equal(alphaAt(result, 81, 81), 255, 'small internal hole must be filled');
  assert.equal(alphaAt(result, 110, 110), 0, 'large openings are part of the subject and stay transparent');
  assert.equal(alphaAt(result, 100 - 30, 100 - 30), 255);
  assert.equal(alphaAt(result, 0, 0), 0);
  const expected = (80 * 80 - 400) / (200 * 200);
  // Um furo de 3×3 já passa do limite de 0,15% (≈ 9 px aqui) e continua aberto.
  const bigger = subjectWithDefects();
  for (let y = 80; y < 83; y++) for (let x = 80; x < 83; x++) bigger.data[(y * 200 + x) * 4 + 3] = 0;
  assert.equal(alphaAt(refineCutout(bigger), 81, 81), 0);
  assert.ok(Math.abs(result.coverage - expected) < 0.01, `coverage ${result.coverage} ≈ ${expected}`);
});

test('refinement keeps a soft strand attached to the subject but drops detached haze', () => {
  // Fio semitransparente (alpha 0.35) saindo do assunto e névoa solta do mesmo tom longe dele.
  const image = canvas(240, 160, (x, y) => {
    if (inside(x, y, 20, 40, 80)) return [...RED, 255];
    if (y >= 78 && y < 81 && x >= 100 && x < 170) return [...RED, 90];
    if (inside(x, y, 200, 10, 12)) return [...RED, 90];
    return [...GREEN, 0];
  });
  const result = refineCutout(image);
  assert.ok(alphaAt(result, 160, 79) > 40, 'attached strand survives far from the solid region');
  assert.equal(alphaAt(result, 205, 15), 0, 'detached haze is removed');
});

test('refinement on large photos runs on a reduced copy and returns full resolution', () => {
  const image = canvas(1500, 1000, (x, y) => (inside(x, y, 500, 300, 400) ? [...RED, 255] : [...GREEN, 0]));
  const result = refineCutout(image);
  assert.equal(result.data.length, 1500 * 1000 * 4);
  for (const [key, value] of Object.entries({ left: 500, top: 300, width: 400, height: 400 })) assert.ok(Math.abs(result.bbox[key] - value) <= 3, `${key} ${result.bbox[key]}`);
  assert.equal(alphaAt(result, 700, 500), 255); assert.equal(alphaAt(result, 100, 100), 0);
});

test('edge decontamination removes the background colour from soft borders', () => {
  // Borda com transição de 8 px já misturada como numa foto: I = a·F + (1 − a)·B.
  const image = canvas(600, 360, x => {
    const a = Math.min(1, Math.max(0, (x - 240) / 8));
    return [0, 1, 2].map(c => Math.round(a * RED[c] + (1 - a) * GREEN[c])).concat(Math.round(a * 255));
  });
  const greenness = picture => {
    let sum = 0, count = 0;
    for (let y = 20; y < 340; y++) for (let x = 0; x < picture.width; x++) {
      const i = (y * picture.width + x) * 4, a = picture.data[i + 3];
      if (a > 25 && a < 230) { sum += picture.data[i + 1] - picture.data[i]; count++; }
    }
    return { mean: sum / count, count };
  };
  const before = greenness(image), after = greenness(refineCutout(image));
  assert.ok(before.count > 0 && after.count > 0);
  assert.ok(before.mean > 0, 'the raw border carries the green background');
  // Vermelho puro dá −160; a borda refinada precisa ficar perto disso, sem franja verde.
  assert.ok(after.mean < -90, `decontaminated border takes the subject colour (${after.mean})`);
});

test('exact Euclidean distance transform and outline with soft shadow', () => {
  const mask = new Uint8Array(21 * 21); mask[10 * 21 + 10] = 1;
  const distance = distanceTransform(mask, 21, 21);
  assert.equal(distance[10 * 21 + 10], 0);
  assert.equal(distance[(10 + 4) * 21 + 10 + 3], 5);
  assert.equal(distance[10 * 21 + 20], 10);
  assert.ok(Math.abs(distance[0] - Math.hypot(10, 10)) < 1e-6);

  const subject = canvas(80, 80, (x, y) => (inside(x, y, 30, 30, 20) ? [...RED, 255] : [0, 0, 0, 0]));
  const outlined = addOutline(subject, { radius: 6 });
  const at = (x, y) => [...outlined.data.subarray((y * 80 + x) * 4, (y * 80 + x) * 4 + 4)];
  assert.deepEqual(at(40, 40), [...RED, 255], 'subject stays on top');
  assert.deepEqual(at(26, 40), [255, 255, 255, 255], 'white outline around the subject');
  assert.equal(at(5, 5)[3], 0, 'far pixels stay transparent');
  const below = at(40, 30 + 20 + 7), above = at(40, 30 - 7 - 1);
  assert.ok(below[3] > 0 && below[3] < 128 && below[0] < 40, 'soft dark shadow just outside the outline');
  assert.ok(below[3] > above[3], 'the shadow falls below the subject');
});

test('parseMode accepts every option without case or accents and rejects the rest with usage', () => {
  assert.deepEqual(parseMode([]), { mode: 'auto' });
  for (const option of ['sticker', 'figurinha', 'FIG', 's']) assert.equal(parseMode([option]).mode, 'sticker');
  for (const option of ['png', 'Arquivo', 'documento', 'doc', 'HD']) assert.equal(parseMode([option]).mode, 'png');
  for (const option of ['contorno', 'borda', 'outline']) assert.equal(parseMode([option]).mode, 'contorno');
  for (const option of ['blur', 'desfocar', 'DESFÓQUE', 'Retrato']) assert.equal(parseMode([option]).mode, 'blur');
  assert.deepEqual(Object.keys(COLORS), ['branco', 'preto', 'vermelho', 'verde', 'azul', 'amarelo', 'rosa', 'roxo', 'laranja', 'cinza']);
  assert.deepEqual(parseMode(['Azul']), { mode: 'cor', color: '#1e88e5', name: 'azul' });
  assert.deepEqual(parseMode(['vermelho']), { mode: 'cor', color: '#e53935', name: 'vermelho' });
  assert.deepEqual(parseMode(['#ABC']), { mode: 'cor', color: '#aabbcc', name: '#aabbcc' });
  assert.deepEqual(parseMode(['#12aB9f']), { mode: 'cor', color: '#12ab9f', name: '#12ab9f' });
  for (const args of [['arco-iris'], ['#12345'], ['png', 'azul'], ['sticker', 'extra']])
    assert.throws(() => parseMode(args), error => /^Use !sfundo/.test(error.message) && error.message.includes('contorno'));
  assert.throws(() => parseMode(['?'], '/'), error => error.message.startsWith('Use /sfundo'));
});

async function cutoutFixture() {
  const image = canvas(300, 200, (x, y) => (inside(x, y, 100, 50, 100) ? [...RED, 255] : [...GREEN, 0]));
  return { image, cutout: await png(refineCutout(image)), original: await png(canvas(300, 200, (x, y) => (inside(x, y, 100, 50, 100) ? [...RED, 255] : [...GREEN, 255]))) };
}

test('default !sfundo sends a 512×512 sticker under 100 KB with pack and a cropped transparent PNG', async () => {
  const f = await cutoutFixture();
  const payloads = await cutoutPayloads({ cutout: f.cutout, original: f.original, mode: parseMode([]), metadata: { packname: 'Matilha', author: 'Pedido por Luna' } });
  assert.equal(payloads.length, 2);
  const [sticker, document] = payloads;
  const meta = await sharp(sticker.sticker).metadata();
  assert.equal(meta.format, 'webp'); assert.equal(meta.width, 512); assert.equal(meta.height, 512); assert.equal(meta.hasAlpha, true);
  assert.ok(sticker.sticker.length <= 100 * 1024);
  const pack = readStickerMetadata(sticker.sticker);
  assert.equal(pack.packname, 'Matilha'); assert.equal(pack.author, 'Pedido por Luna');
  const { data } = await sharp(sticker.sticker).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0, 'sticker corner is transparent');
  assert.ok(data[(256 * 512 + 256) * 4 + 3] > 250, 'subject fills the centre');
  assert.equal(data[(256 * 512 + 14 + 2) * 4 + 3] > 200, true, 'subject is scaled to the 14 px margin');
  assert.equal(data[(256 * 512 + 10) * 4 + 3], 0);

  assert.equal(document.mimetype, 'image/png'); assert.equal(document.fileName, 'sem-fundo.png');
  assert.match(document.caption, /!sfundo contorno/); assert.match(document.caption, /!sfundo blur/); assert.match(document.caption, /!sfundo azul/);
  const file = await sharp(document.document).metadata();
  assert.equal(file.format, 'png'); assert.equal(file.hasAlpha, true);
  assert.equal(file.width, 108); assert.equal(file.height, 108, 'cropped to the subject with 4% margin');
});

test('sticker, png, contorno, cor and blur modes', async () => {
  const f = await cutoutFixture(), metadata = { packname: 'P', author: 'A' };
  const only = await cutoutPayloads({ cutout: f.cutout, original: f.original, mode: parseMode(['sticker']), metadata });
  assert.equal(only.length, 1); assert.ok(only[0].sticker);
  const file = await cutoutPayloads({ cutout: f.cutout, original: f.original, mode: parseMode(['png']), metadata });
  assert.equal(file.length, 1); assert.equal(file[0].mimetype, 'image/png'); assert.ok(file[0].document);

  const [outlined] = await cutoutPayloads({ cutout: f.cutout, original: f.original, mode: parseMode(['contorno']), metadata });
  assert.equal(readStickerMetadata(outlined.sticker).packname, 'P');
  const rgba = await sharp(outlined.sticker).ensureAlpha().raw().toBuffer();
  // Assunto ocupa 512 − 2×24 = 464 px; logo fora dele há contorno branco.
  const edge = (256 * 512 + 24 - 4) * 4;
  assert.ok(rgba[edge + 3] > 200 && rgba[edge] > 200 && rgba[edge + 1] > 200 && rgba[edge + 2] > 200, 'white outline');
  assert.equal(rgba[3], 0, 'outline sticker corner stays transparent');

  const [blue] = await cutoutPayloads({ cutout: f.cutout, original: f.original, mode: parseMode(['azul']), metadata });
  assert.equal(blue.mimetype, 'image/jpeg'); assert.match(blue.caption, /azul/);
  const solid = await sharp(blue.image).raw().toBuffer({ resolveWithObject: true });
  const corner = [...solid.data.subarray(0, 3)], centre = (100 * 300 + 150) * solid.info.channels;
  assert.ok(Math.abs(corner[0] - 0x1e) < 12 && Math.abs(corner[1] - 0x88) < 12 && Math.abs(corner[2] - 0xe5) < 12, `blue background ${corner}`);
  assert.ok(solid.data[centre] > 150 && solid.data[centre + 1] < 90, 'subject kept over the colour');

  const [portrait] = await cutoutPayloads({ cutout: f.cutout, original: f.original, mode: parseMode(['blur']), metadata });
  assert.equal(portrait.mimetype, 'image/jpeg');
  const blurred = await sharp(portrait.image).raw().toBuffer({ resolveWithObject: true });
  assert.equal(blurred.info.width, 300); assert.equal(blurred.info.height, 200);
  const far = [...blurred.data.subarray(0, 3)], subject = (100 * 300 + 150) * blurred.info.channels;
  assert.ok(far[1] > far[0] && far[1] < 220, `original background, blurred and slightly darker ${far}`);
  assert.ok(blurred.data[subject] > 150 && blurred.data[subject + 1] < 90, 'sharp subject on top');
});

test('empty cutouts raise BACKGROUND_EMPTY and the command sends nothing', async () => {
  const transparent = await png(canvas(64, 64, () => [0, 0, 0, 0]));
  await assert.rejects(cutoutPayloads({ cutout: transparent }), error => error.code === 'BACKGROUND_EMPTY');
  // Um pontinho de 1 px fica abaixo da cobertura mínima de 0,04%.
  const dot = await png(canvas(200, 200, (x, y) => (x === 5 && y === 5 ? [255, 0, 0, 255] : [0, 0, 0, 0])));
  await assert.rejects(cutoutPayloads({ cutout: dot }), error => error.code === 'BACKGROUND_EMPTY');
  await assert.rejects(cutoutPayloads({ cutout: (await cutoutFixture()).cutout, bbox: null, coverage: 0.0001 }), error => error.code === 'BACKGROUND_EMPTY');

  const { createLocalMedia } = require('../src/commands/local-media');
  const photo = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'red' } }).png().toBuffer();
  const sent = [];
  const result = await createLocalMedia({ read: async () => photo, remove: async (_, output) => fs.writeFileSync(output, transparent), log: () => {} })('sfundo')(
    { sendMessage: async (_, value) => sent.push(value) }, { jid: '120000@g.us', args: [], msg: { key: { id: 'empty' }, message: { imageMessage: { caption: '!sfundo' } } } });
  assert.equal(result.ok, false);
  assert.ok(!sent.some(value => value.sticker || value.document || value.image));
  assert.ok(sent.some(value => value.text?.includes('Não encontrei uma pessoa ou objeto em destaque nessa foto.')));
});

async function animatedWebP(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-exif-animation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'animated.webp');
  await require('node:util').promisify(require('node:child_process').execFile)(require('@ffmpeg-installer/ffmpeg').path,
    ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=0.3:size=32x32:rate=10', '-loop', '0', file]);
  return fs.readFileSync(file);
}

function assertContainer(webp) {
  const chunks = listChunks(webp);
  assert.equal(chunks.filter(chunk => chunk.type === 'EXIF').length, 1, 'exactly one EXIF chunk');
  assert.equal(chunks[0].type, 'VP8X', 'VP8X comes first');
  assert.ok(chunks[0].data[0] & 0x08, 'EXIF flag set');
  assert.equal(webp.readUInt32LE(4), webp.length - 8, 'RIFF size matches the file');
  let offset = 12;
  for (const chunk of chunks) offset += 8 + chunk.data.length + (chunk.data.length & 1);
  assert.equal(offset, webp.length, 'odd chunks are padded');
  return chunks;
}

test('sticker metadata is written to lossy, lossless, opaque and animated WebP without touching frames', async t => {
  const rgba = { create: { width: 40, height: 30, channels: 4, background: { r: 10, g: 200, b: 90, alpha: 0.5 } } };
  const samples = {
    lossy: await sharp(rgba).webp({ quality: 80 }).toBuffer(),
    lossless: await sharp(rgba).webp({ lossless: true }).toBuffer(),
    opaque: await sharp({ create: { width: 33, height: 17, channels: 3, background: '#336699' } }).webp({ quality: 70 }).toBuffer(),
    animated: await animatedWebP(t),
  };
  for (const [name, input] of Object.entries(samples)) {
    const once = setStickerMetadata(input, { packname: 'Pacote ' + name, author: 'Autor', emojis: ['🐺'] });
    const output = setStickerMetadata(once, { packname: 'Pacote ' + name, author: 'Autor', emojis: ['🐺'] });
    const chunks = assertContainer(output);
    const frames = webp => listChunks(webp).filter(chunk => !['EXIF', 'VP8X'].includes(chunk.type)).map(chunk => chunk.type + chunk.data.toString('hex'));
    assert.deepEqual(frames(output), frames(input), `${name}: image data unchanged`);
    const meta = readStickerMetadata(output);
    assert.equal(meta.packname, 'Pacote ' + name); assert.equal(meta.author, 'Autor'); assert.deepEqual(meta.emojis, ['🐺']); assert.ok(meta.packId);
    const decoded = await sharp(output, { animated: true }).metadata();
    const original = await sharp(input, { animated: true }).metadata();
    assert.equal(decoded.width, original.width); assert.equal(decoded.height, original.height); assert.equal(decoded.pages || 1, original.pages || 1);
    assert.equal(meta.width, original.width); assert.equal(meta.height, original.pageHeight || original.height);
    await sharp(output, { animated: true }).raw().toBuffer();
    if (name === 'lossless') assert.ok(chunks[0].data[0] & 0x10, 'alpha flag derived from VP8L');
    if (name === 'opaque') assert.equal(chunks[0].data[0] & 0x10, 0);
    if (name === 'animated') { assert.equal(meta.animated, true); assert.ok(meta.frames > 1); assert.equal(meta.frames, original.pages); }
    else assert.equal(meta.animated, false);
  }
});

test('sticker metadata sanitizes text and rejects invalid WebP', async () => {
  const webp = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#00000000' } }).webp().toBuffer();
  const meta = readStickerMetadata(setStickerMetadata(webp, { packname: 'Lobo\u0000\u0007 bot\n', author: 'x'.repeat(300) }));
  assert.equal(meta.packname, 'Lobo bot'); assert.equal(meta.author.length, 128);
  for (const input of [Buffer.from('nope'), Buffer.from('RIFF\u0010\u0000\u0000\u0000WEBPJUNKÿÿÿÿ', 'latin1'), 'text'])
    assert.throws(() => setStickerMetadata(input, { packname: 'x' }), error => error.code === 'STICKER_INVALID_WEBP');
  assert.equal(withMetadata(Buffer.from('nope'), { packname: 'x' }).toString(), 'nope', 'metadata never blocks sending');
});

test('pack placeholders, args and the size ladder', async () => {
  const values = { nome: 'Luna', grupo: 'Alcateia', bot: 'Lobo', dono: 'Oraku', data: '01/02/2026' };
  assert.equal(fillTemplate('{bot} • {GRUPO}', values), 'Lobo • Alcateia');
  assert.equal(fillTemplate('Pedido por {nome} em {data} ({dono}) {desconhecido}', values), 'Pedido por Luna em 01/02/2026 (Oraku) {desconhecido}');
  assert.deepEqual(parseStickerArgs(['Meu', 'pacote', '|', 'Eu']), { packname: 'Meu pacote', author: 'Eu' });
  assert.deepEqual(parseStickerArgs(['Só', 'pacote']), { packname: 'Só pacote', author: undefined });
  assert.deepEqual(parseStickerArgs([]), {});

  const saved = { pack: process.env.STICKER_PACK, author: process.env.STICKER_AUTHOR };
  try {
    delete process.env.STICKER_PACK; delete process.env.STICKER_AUTHOR;
    let calls = 0;
    const sock = { groupMetadata: async () => { calls++; return { subject: 'Alcateia' }; } };
    const ctx = { jid: '120000@g.us', pushName: 'Luna' };
    const defaults = await metadataFor(sock, ctx);
    assert.equal(defaults.packname, require('../src/config').get('BOT_NAME')); assert.equal(defaults.author, 'Pedido por Luna');
    assert.equal(calls, 0, 'group name is only fetched when {grupo} is used');
    process.env.STICKER_PACK = '{grupo}'; process.env.STICKER_AUTHOR = '{nome} • {data}';
    const custom = await metadataFor(sock, ctx, { now: new Date('2026-01-01T02:00:00Z') });
    assert.equal(calls, 1); assert.equal(custom.packname, 'Alcateia'); assert.equal(custom.author, 'Luna • 31/12/2025');
    assert.equal((await metadataFor(sock, { ...ctx, jid: '5511@s.whatsapp.net' })).packname, 'Chat privado');
  } finally {
    for (const [key, value] of [['STICKER_PACK', saved.pack], ['STICKER_AUTHOR', saved.author]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }

  assert.deepEqual(QUALITY_STEPS, [92, 86, 80, 72, 64, 56, 48, 40]);
  // A qualidade cai em degraus e para no primeiro que cabe no limite.
  const noise = canvas(512, 512, (x, y) => [(x * 7 + y * 13) % 256, (x * y) % 256, (x ^ y) % 256, 255]);
  const raw = { width: 512, height: 512, channels: 4 };
  const sizes = [];
  for (const quality of QUALITY_STEPS)
    sizes.push((await sharp(noise.data, { raw }).webp({ quality, alphaQuality: quality >= 72 ? 100 : 90, effort: 4, smartSubsample: true }).toBuffer()).length);
  assert.equal((await encodeStaticSticker(noise.data, { raw, maxBytes: Infinity })).length, sizes[0]);
  assert.equal((await encodeStaticSticker(noise.data, { raw, maxBytes: sizes[3] })).length, sizes[3]);
  assert.equal((await encodeStaticSticker(noise.data, { raw, maxBytes: 1 })).length, sizes.at(-1), 'never fails: the last step is used');
  assert.ok(sizes.at(-1) < sizes[0]);
  const photo = canvas(512, 512, (x, y) => [x / 2, y / 2, 128, 255]);
  assert.ok((await encodeStaticSticker(photo.data, { raw })).length <= 100 * 1024);
});
