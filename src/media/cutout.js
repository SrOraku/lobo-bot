'use strict';
// Modos do !sfundo e montagem dos envios a partir do recorte refinado.
//
// O WhatsApp converte mensagens de imagem em JPEG e pinta a transparência
// de preto; por isso o recorte transparente sai como figurinha (WebP com
// alpha) e como documento PNG, que chegam intactos. Os modos com fundo
// (desfoque ou cor) não têm transparência e podem ir como foto.
const { addOutline, measure } = require('./matting');
const { encodeStaticSticker, withMetadata } = require('./sticker-tools');

const STICKER_SIZE = 512;
const STICKER_MARGIN = 14;
const OUTLINE_MARGIN = 24;
const PNG_MARGIN = 0.04;
const MIN_COVERAGE = 0.0004;

const COLORS = Object.freeze({
  branco: '#ffffff',
  preto: '#000000',
  vermelho: '#e53935',
  verde: '#43a047',
  azul: '#1e88e5',
  amarelo: '#fdd835',
  rosa: '#ec407a',
  roxo: '#8e24aa',
  laranja: '#fb8c00',
  cinza: '#9e9e9e',
});
const ALIASES = Object.freeze({
  sticker: 'sticker', figurinha: 'sticker', fig: 'sticker', s: 'sticker',
  png: 'png', arquivo: 'png', documento: 'png', doc: 'png', hd: 'png',
  contorno: 'contorno', borda: 'contorno', outline: 'contorno',
  blur: 'blur', desfocar: 'blur', desfoque: 'blur', retrato: 'blur',
});

function usage(prefix = '!') {
  return `Use ${prefix}sfundo respondendo a uma foto (ou na legenda dela). Sem opção, envia figurinha + PNG transparente.\n` +
    `Opções: sticker (só figurinha), png (arquivo em alta), contorno (figurinha com borda branca), blur (fundo desfocado) ou uma cor: ${Object.keys(COLORS).join(', ')} ou #rrggbb.`;
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '');
}

function parseMode(args = [], prefix = '!') {
  const list = (Array.isArray(args) ? args : [args]).map(String).filter(value => value.trim());
  if (!list.length) return { mode: 'auto' };
  if (list.length > 1) throw Error(usage(prefix));
  const option = normalize(list[0]);
  if (ALIASES[option]) return { mode: ALIASES[option] };
  if (COLORS[option]) return { mode: 'cor', color: COLORS[option], name: option };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/u.exec(option);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map(digit => digit + digit).join('') : hex[1];
    return { mode: 'cor', color: '#' + digits, name: '#' + digits };
  }
  throw Error(usage(prefix));
}

function empty() {
  return Object.assign(Error('Nenhum assunto em destaque no recorte'), { code: 'BACKGROUND_EMPTY' });
}

function validBox(bbox, width, height) {
  return bbox && [bbox.left, bbox.top, bbox.width, bbox.height].every(Number.isInteger) &&
    bbox.left >= 0 && bbox.top >= 0 && bbox.width > 0 && bbox.height > 0 &&
    bbox.left + bbox.width <= width && bbox.top + bbox.height <= height;
}

const rawOptions = image => ({ raw: { width: image.width, height: image.height, channels: 4 } });

async function decode(buffer) {
  const sharp = require('sharp');
  const { data, info } = await sharp(buffer, { limitInputPixels: 25000000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Corta no assunto, cabe em 512 − 2×margem (lanczos3) e centraliza num
// quadro 512×512 transparente.
async function stickerCanvas(image, bbox, margin) {
  const sharp = require('sharp');
  const inner = STICKER_SIZE - margin * 2;
  const { data, info } = await sharp(image.data, rawOptions(image))
    .extract(bbox)
    .resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((STICKER_SIZE - info.width) / 2), top = Math.floor((STICKER_SIZE - info.height) / 2);
  const canvas = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extend({ left, top, right: STICKER_SIZE - info.width - left, bottom: STICKER_SIZE - info.height - top, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer();
  return { data: canvas, width: STICKER_SIZE, height: STICKER_SIZE };
}

async function sticker(image, bbox, metadata, { outline = false } = {}) {
  let canvas = await stickerCanvas(image, bbox, outline ? OUTLINE_MARGIN : STICKER_MARGIN);
  if (outline) canvas = addOutline(canvas, { radius: 10 });
  const webp = await encodeStaticSticker(canvas.data, rawOptions(canvas));
  return { sticker: withMetadata(webp, metadata || {}) };
}

// PNG recortado no assunto com 4% de margem transparente.
async function pngDocument(image, bbox, caption) {
  const sharp = require('sharp');
  const margin = Math.max(1, Math.round(Math.max(bbox.width, bbox.height) * PNG_MARGIN));
  const left = Math.max(0, bbox.left - margin), top = Math.max(0, bbox.top - margin);
  const right = Math.min(image.width, bbox.left + bbox.width + margin), bottom = Math.min(image.height, bbox.top + bbox.height + margin);
  const document = await sharp(image.data, rawOptions(image))
    .extract({ left, top, width: right - left, height: bottom - top })
    .extend({
      left: margin - (bbox.left - left), top: margin - (bbox.top - top),
      right: margin - (right - bbox.left - bbox.width), bottom: margin - (bottom - bbox.top - bbox.height),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return { document, mimetype: 'image/png', fileName: 'sem-fundo.png', ...(caption ? { caption } : {}) };
}

async function blurred(image, original, caption) {
  const sharp = require('sharp');
  const sigma = Math.max(6, Math.max(image.width, image.height) / 90);
  const backdrop = await sharp(original || image.data, original ? { limitInputPixels: 25000000 } : rawOptions(image))
    .resize(image.width, image.height, { fit: 'fill' })
    .removeAlpha()
    .blur(sigma)
    .modulate({ brightness: 0.92 })
    .png()
    .toBuffer();
  const photo = await sharp(backdrop)
    .composite([{ input: image.data, ...rawOptions(image) }])
    .flatten({ background: '#000000' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return { image: photo, mimetype: 'image/jpeg', caption };
}

async function colored(image, color, caption) {
  const sharp = require('sharp');
  const photo = await sharp(image.data, rawOptions(image)).flatten({ background: color }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return { image: photo, mimetype: 'image/jpeg', caption };
}

// Devolve a lista de mensagens a enviar, na ordem. Lança BACKGROUND_EMPTY
// quando o recorte não tem assunto (nada é enviado nesse caso).
async function cutoutPayloads({ cutout, original, mode = { mode: 'auto' }, metadata, bbox, coverage, prefix = '!' } = {}) {
  const image = Buffer.isBuffer(cutout) ? await decode(cutout) : cutout;
  if (!image?.data || !image.width || !image.height) throw Object.assign(Error('Recorte inválido'), { code: 'BACKGROUND_FAILED' });
  // Dados do worker (bbox válido ou null + cobertura) são usados como vieram;
  // sem eles, ou se forem incoerentes com a imagem, o recorte é medido aqui.
  const trusted = Number.isFinite(coverage) && (bbox === null || validBox(bbox, image.width, image.height));
  if (!trusted) ({ bbox, coverage } = measure(image.data, image.width, image.height));
  if (!bbox || coverage < MIN_COVERAGE) throw empty();
  const selected = typeof mode === 'string' ? parseMode([mode], prefix) : mode;
  switch (selected.mode) {
    case 'sticker':
      return [await sticker(image, bbox, metadata)];
    case 'contorno':
      return [await sticker(image, bbox, metadata, { outline: true })];
    case 'png':
      return [await pngDocument(image, bbox, '🖼️ *Fundo removido!* PNG transparente em arquivo, sem perda de qualidade.')];
    case 'blur':
      return [await blurred(image, original, '📸 *Modo retrato:* fundo desfocado.')];
    case 'cor':
      return [await colored(image, selected.color, `🎨 *Fundo trocado:* ${selected.name}.`)];
    default:
      return [
        await sticker(image, bbox, metadata),
        await pngDocument(image, bbox,
          '🖼️ *Fundo removido!* A figurinha e o PNG em arquivo mantêm a transparência.\n' +
          `> ✨ _Experimente_ *${prefix}sfundo contorno*, *${prefix}sfundo blur* _ou_ *${prefix}sfundo azul*.`),
      ];
  }
}

module.exports = { COLORS, parseMode, usage, cutoutPayloads, STICKER_SIZE, STICKER_MARGIN, OUTLINE_MARGIN, MIN_COVERAGE };
