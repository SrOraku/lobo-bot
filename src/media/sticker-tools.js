'use strict';
// Utilidades compartilhadas por !s e !sfundo: codificação dentro do limite
// do WhatsApp e pacote/autor gravados no EXIF da figurinha.
const config = require('../config');
const { setStickerMetadata } = require('./webp-exif');

const DEFAULT_PACK = '{bot}';
const DEFAULT_AUTHOR = 'Pedido por {nome}';
const QUALITY_STEPS = Object.freeze([92, 86, 80, 72, 64, 56, 48, 40]);
const MAX_STICKER_BYTES = 100 * 1024;
const PLACEHOLDER = /\{(nome|grupo|bot|dono|data)\}/giu;

function today(now = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
}

function fillTemplate(template, values) {
  return String(template ?? '').replace(PLACEHOLDER, (_, key) => String(values[key.toLowerCase()] ?? '')).replace(/\s+/gu, ' ').trim();
}

// Monta pacote e autor a partir de STICKER_PACK/STICKER_AUTHOR (ou dos
// textos passados em `overrides`). O nome do grupo só é consultado quando
// algum modelo usa {grupo}, para não gastar uma chamada ao WhatsApp à toa.
async function metadataFor(sock, ctx = {}, overrides = {}) {
  const pack = overrides.packname || config.get('STICKER_PACK') || DEFAULT_PACK;
  const author = overrides.author || config.get('STICKER_AUTHOR') || DEFAULT_AUTHOR;
  const values = {
    nome: ctx.pushName || ctx.user?.name || 'Lobo',
    bot: config.get('BOT_NAME'),
    dono: config.get('DEVELOPER_NAME') || config.get('BOT_NAME'),
    data: today(overrides.now),
    grupo: '',
  };
  if (/\{grupo\}/iu.test(pack + '\n' + author)) {
    values.grupo = 'Chat privado';
    if (String(ctx.jid || '').endsWith('@g.us')) {
      try { values.grupo = (await sock.groupMetadata(ctx.jid))?.subject || 'Grupo'; } catch { values.grupo = 'Grupo'; }
    }
  }
  return { packname: fillTemplate(pack, values) || values.bot, author: fillTemplate(author, values), emojis: overrides.emojis || [] };
}

// "!s pacote | autor" — texto livre; marcadores também valem aqui.
function parseStickerArgs(args = []) {
  const text = args.join(' ').trim();
  if (!text) return {};
  const [packname, ...rest] = text.split('|');
  const author = rest.join('|').trim();
  return { packname: packname.trim() || undefined, author: author || undefined };
}

// Figurinhas estáticas acima de ~100 KB são recusadas ou recomprimidas pelo
// WhatsApp; a qualidade cai em degraus até caber, preservando o alpha.
async function encodeStaticSticker(input, { raw, maxBytes = MAX_STICKER_BYTES } = {}) {
  const sharp = require('sharp');
  let last;
  for (const quality of QUALITY_STEPS) {
    last = await sharp(input, raw ? { raw } : { limitInputPixels: 25000000 })
      .webp({ quality, alphaQuality: quality >= 72 ? 100 : 90, effort: 4, smartSubsample: true })
      .toBuffer();
    if (last.length <= maxBytes) return last;
  }
  return last;
}

// Metadados nunca podem impedir o envio: se o WebP for incomum, a
// figurinha segue sem pacote em vez de falhar.
function withMetadata(webp, metadata) {
  try {
    return setStickerMetadata(webp, metadata);
  } catch {
    return webp;
  }
}

module.exports = { DEFAULT_PACK, DEFAULT_AUTHOR, QUALITY_STEPS, MAX_STICKER_BYTES, fillTemplate, metadataFor, parseStickerArgs, encodeStaticSticker, withMetadata, today };
