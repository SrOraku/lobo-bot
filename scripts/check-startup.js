'use strict';

// Verifica dependências reais sem abrir sessão ou conectar ao WhatsApp.
const { ensureDependencies } = require('../src/bootstrap');
if (!ensureDependencies()) process.exit(1);

const assert = require('node:assert/strict');
const fs = require('node:fs');
const manifest = require('../package.json');

async function checkStartup() {
  for (const name of Object.keys(manifest.dependencies)) await import(name);

  const baileys = await import('@whiskeysockets/baileys');
  for (const name of ['default', 'useMultiFileAuthState', 'fetchLatestBaileysVersion',
    'makeCacheableSignalKeyStore', 'downloadContentFromMessage']) {
    assert.equal(typeof baileys[name], 'function', `Export do Baileys ausente: ${name}`);
  }
  assert.equal(typeof baileys.Browsers.ubuntu, 'function');
  assert.equal(typeof baileys.DisconnectReason.loggedOut, 'number');

  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  try {
    require('../src/config/migrations').runMigrations(db);
    db.prepare('INSERT INTO users(jid,name) VALUES (?,?)').run('teste@s.whatsapp.net', 'Teste');
    assert.equal(db.prepare('SELECT name FROM users WHERE jid=?').get('teste@s.whatsapp.net').name, 'Teste');
  } finally {
    db.close();
  }

  const sharp = require('sharp');
  const image = await sharp({ create: { width: 1, height: 1, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  assert.ok(image.length > 0);
  fs.accessSync(require('@ffmpeg-installer/ffmpeg').path, fs.constants.X_OK);

  console.log(`✅ Dependências e APIs verificadas no Node ${process.versions.node}.`);
  console.log('✅ SQLite, imagens e FFmpeg disponíveis. Nenhuma sessão ou dado do bot foi alterado.');
}

checkStartup().catch(error => {
  console.error(`❌ A verificação de inicialização falhou: ${error.message}`);
  process.exitCode = 1;
});
