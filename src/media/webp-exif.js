'use strict';
// Nome do pacote e autor das figurinhas do WhatsApp.
//
// O WhatsApp lê esses dados de um chunk EXIF dentro do próprio WebP: um
// cabeçalho TIFF little-endian com uma única entrada (tag 0x5741, tipo
// UNDEFINED) que aponta para um JSON. O Baileys ignora o campo
// `stickerMetadata` da mensagem, então o pacote precisa ser gravado aqui.
// Só os chunks de metadados mudam: os quadros (VP8/VP8L/ALPH/ANMF) são
// copiados byte a byte, inclusive em figurinhas animadas.
const crypto = require('node:crypto');

const EXIF_TAG = 0x5741;
const FLAG_ANIMATION = 0x02;
const FLAG_EXIF = 0x08;
const FLAG_ALPHA = 0x10;
const TEXT_LIMIT = 128;

function invalid(reason) {
  return Object.assign(Error('WebP inválido: ' + reason), { code: 'STICKER_INVALID_WEBP' });
}

function cleanText(value) {
  // Caracteres de controle quebram a exibição no WhatsApp; corta por ponto de código.
  return Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()).slice(0, TEXT_LIMIT).join('');
}

function listChunks(webp) {
  if (!Buffer.isBuffer(webp) && !(webp instanceof Uint8Array)) throw invalid('entrada não é um buffer');
  const buffer = Buffer.from(webp.buffer, webp.byteOffset, webp.byteLength);
  if (buffer.length < 20 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP')
    throw invalid('cabeçalho RIFF/WEBP ausente');
  // Alguns codificadores gravam o tamanho do RIFF errado; o fim real do arquivo prevalece.
  const declared = 8 + buffer.readUInt32LE(4);
  const end = declared >= 20 && declared <= buffer.length ? declared : buffer.length;
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= end) {
    const type = buffer.toString('latin1', offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (!/^[\x20-\x7e]{4}$/.test(type)) throw invalid('chunk corrompido');
    if (start + size > buffer.length) throw invalid('chunk ' + type.trim() + ' truncado');
    chunks.push({ type, data: buffer.subarray(start, start + size) });
    offset = start + size + (size & 1);
  }
  if (!chunks.some(chunk => ['VP8 ', 'VP8L', 'VP8X'].includes(chunk.type))) throw invalid('sem dados de imagem');
  return chunks;
}

function frameSize(chunks) {
  const vp8x = chunks.find(chunk => chunk.type === 'VP8X');
  if (vp8x && vp8x.data.length >= 10)
    return { width: vp8x.data.readUIntLE(4, 3) + 1, height: vp8x.data.readUIntLE(7, 3) + 1, alpha: !!(vp8x.data[0] & FLAG_ALPHA) };
  const lossless = chunks.find(chunk => chunk.type === 'VP8L');
  if (lossless) {
    if (lossless.data.length < 5 || lossless.data[0] !== 0x2f) throw invalid('VP8L sem assinatura');
    const bits = lossless.data.readUInt32LE(1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: !!((bits >>> 28) & 1) };
  }
  const lossy = chunks.find(chunk => chunk.type === 'VP8 ');
  if (lossy) {
    const data = lossy.data;
    if (data.length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) throw invalid('VP8 sem código de início');
    return { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff, alpha: false };
  }
  throw invalid('dimensões ausentes');
}

function chunkBytes(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'latin1');
  header.writeUInt32LE(data.length, 4);
  return data.length & 1 ? [header, data, Buffer.alloc(1)] : [header, data];
}

function exifPayload(json) {
  const body = Buffer.from(JSON.stringify(json), 'utf8');
  // TIFF "II*\0", IFD no byte 8 com uma entrada: tag 0x5741, tipo 7 (UNDEFINED),
  // quantidade = tamanho do JSON e deslocamento 22, onde o JSON começa.
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  header.writeUInt32LE(body.length, 14);
  return Buffer.concat([header, body]);
}

function setStickerMetadata(webp, { packname = '', author = '', emojis = [], packId } = {}) {
  const chunks = listChunks(webp).filter(chunk => chunk.type !== 'EXIF');
  const name = cleanText(packname), publisher = cleanText(author);
  const json = {
    'sticker-pack-id': cleanText(packId) || 'lobo-' + crypto.createHash('sha256').update(name + '\u0000' + publisher).digest('hex').slice(0, 24),
    'sticker-pack-name': name,
    'sticker-pack-publisher': publisher,
    emojis: (Array.isArray(emojis) ? emojis : [emojis]).map(cleanText).filter(Boolean).slice(0, 3),
  };
  let vp8x = chunks.find(chunk => chunk.type === 'VP8X');
  if (vp8x) {
    if (vp8x.data.length < 10) throw invalid('VP8X curto');
    const data = Buffer.from(vp8x.data);
    data[0] |= FLAG_EXIF;
    vp8x.data = data;
  } else {
    const { width, height, alpha } = frameSize(chunks);
    if (!width || !height) throw invalid('dimensões ausentes');
    const data = Buffer.alloc(10);
    data[0] = FLAG_EXIF | (alpha ? FLAG_ALPHA : 0);
    data.writeUIntLE(width - 1, 4, 3);
    data.writeUIntLE(height - 1, 7, 3);
    vp8x = { type: 'VP8X', data };
    chunks.unshift(vp8x);
  }
  const exif = { type: 'EXIF', data: exifPayload(json) };
  const xmp = chunks.findIndex(chunk => chunk.type === 'XMP ');
  chunks.splice(xmp < 0 ? chunks.length : xmp, 0, exif);
  // VP8X precisa ser o primeiro chunk do arquivo estendido.
  const ordered = [vp8x, ...chunks.filter(chunk => chunk !== vp8x)];
  const body = ordered.flatMap(chunk => chunkBytes(chunk.type, chunk.data));
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 4, 'latin1');
  riff.writeUInt32LE(4 + body.reduce((total, part) => total + part.length, 0), 4);
  riff.write('WEBP', 8, 4, 'latin1');
  return Buffer.concat([riff, ...body]);
}

function parseExif(data) {
  if (data.length < 8) return null;
  const little = data.toString('latin1', 0, 2) === 'II';
  if (!little && data.toString('latin1', 0, 2) !== 'MM') return null;
  const u16 = offset => (little ? data.readUInt16LE(offset) : data.readUInt16BE(offset));
  const u32 = offset => (little ? data.readUInt32LE(offset) : data.readUInt32BE(offset));
  const ifd = u32(4);
  if (ifd + 2 > data.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > data.length) return null;
    if (u16(entry) !== EXIF_TAG) continue;
    const length = u32(entry + 4), offset = length <= 4 ? entry + 8 : u32(entry + 8);
    if (offset + length > data.length) return null;
    try { return JSON.parse(data.toString('utf8', offset, offset + length)); } catch { return null; }
  }
  return null;
}

function readStickerMetadata(webp) {
  const chunks = listChunks(webp);
  const { width, height } = frameSize(chunks);
  const vp8x = chunks.find(chunk => chunk.type === 'VP8X');
  const frames = chunks.filter(chunk => chunk.type === 'ANMF').length;
  const exif = chunks.find(chunk => chunk.type === 'EXIF');
  const json = exif ? parseExif(exif.data) : null;
  return {
    packname: typeof json?.['sticker-pack-name'] === 'string' ? json['sticker-pack-name'] : null,
    author: typeof json?.['sticker-pack-publisher'] === 'string' ? json['sticker-pack-publisher'] : null,
    packId: typeof json?.['sticker-pack-id'] === 'string' ? json['sticker-pack-id'] : null,
    emojis: Array.isArray(json?.emojis) ? json.emojis.filter(item => typeof item === 'string') : [],
    animated: !!(vp8x && vp8x.data[0] & FLAG_ANIMATION) || chunks.some(chunk => chunk.type === 'ANIM'),
    frames: frames || 1,
    width,
    height,
  };
}

module.exports = { setStickerMetadata, readStickerMetadata, listChunks, cleanText };
