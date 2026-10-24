'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
const LIMIT = 8 * 1024 * 1024;
const pending = new Map();
function invalid(code) { return Object.assign(new Error(code), { code }); }
function mp4(bytes) { return bytes.length >= 12 && bytes.subarray(4, 8).toString() === 'ftyp'; }
async function readFile(file) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw invalid('MENU_COVER_SYMLINK');
  if (info.size > LIMIT) throw invalid('MENU_COVER_TOO_LARGE');
  const data = await fs.readFile(file);
  if (!data.length || data.length > LIMIT) throw invalid('MENU_COVER_TOO_LARGE');
  return data;
}
async function cached(file) {
  try { const bytes = await readFile(file); return mp4(bytes) ? bytes : null; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function convert(bytes, extension, { cacheDirectory, run, ffmpeg }) {
  const key = createHash('sha256').update('lobo-menu-h264-12s-v1:').update(bytes).digest('hex');
  await fs.mkdir(cacheDirectory, { recursive: true });
  if ((await fs.lstat(cacheDirectory)).isSymbolicLink()) throw invalid('MENU_CACHE_SYMLINK');
  const destination = path.join(cacheDirectory, key + '.mp4');
  const existing = await cached(destination);
  if (existing) return existing;
  const jobKey = path.resolve(destination);
  if (pending.has(jobKey)) return pending.get(jobKey);
  const job = (async () => {
    const id = randomUUID();
    const input = path.join(cacheDirectory, id + extension);
    const output = path.join(cacheDirectory, id + '.tmp.mp4');
    try {
      await fs.writeFile(input, bytes, { flag: 'wx', mode: 0o600 });
      const command = ffmpeg || require('@ffmpeg-installer/ffmpeg').path;
      try { await run(command, ['-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-i', input,
        '-t', '12', '-an', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,fps=15,setsar=1', '-c:v', 'libx264',
        '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output],
      { timeout: 30000, maxBuffer: 1024 * 1024, shell: false }); }
      catch (error) { throw invalid(error.code === 'ENOENT' ? 'MENU_FFMPEG_UNAVAILABLE' : error.killed ? 'MENU_CONVERSION_TIMEOUT' : 'MENU_CONVERSION_FAILED'); }
      const result = await readFile(output);
      if (!mp4(result)) throw invalid('MENU_CONVERSION_INVALID');
      await fs.rename(output, destination);
      // Only cache entries produced by this module are eligible for cleanup.
      const files = await fs.readdir(cacheDirectory);
      for (const name of files) if (/^[a-f0-9]{64}\.mp4$/.test(name) && name !== path.basename(destination)) await fs.rm(path.join(cacheDirectory, name), { force: true });
      return result;
    } finally {
      await fs.rm(input, { force: true });
      await fs.rm(output, { force: true });
    }
  })();
  pending.set(jobKey, job);
  try { return await job; } finally { pending.delete(jobKey); }
}
async function loadFileCover({ directory = path.join(__dirname, '../assets'),
  cacheDirectory = path.join(__dirname, '../../data/menu/file-cache'), run = execute, ffmpeg,
  warn = (code, file) => require('../config/logger').logger.warn({ component: 'menu-cover', code, file }, 'Capa local inválida ou indisponível; usando a próxima capa.') } = {}) {
  for (const extension of ['.gif', '.mp4']) {
    const name = 'menu-principal' + extension;
    try {
      const bytes = await readFile(path.join(directory, name));
      if (extension === '.gif') {
        const signature = bytes.subarray(0, 6).toString();
        if (bytes.length < 10 || !['GIF87a', 'GIF89a'].includes(signature)) throw invalid('MENU_GIF_INVALID');
        const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8);
        if (!width || !height || width > 4096 || height > 4096) throw invalid('MENU_GIF_DIMENSIONS');
      } else if (!mp4(bytes)) throw invalid('MENU_MP4_INVALID');
      return await convert(bytes, extension, { cacheDirectory, run, ffmpeg });
    } catch (error) { if (error.code !== 'ENOENT') warn(error.code || 'MENU_CONVERSION_FAILED', name); }
  }
  return null;
}
module.exports = { loadFileCover };
