'use strict';
const config = require('../config');
const { version } = require('../../package.json');
const { clean, uptime, frameMenu } = require('../menus/render');
const { mono } = require('../ui/text');

function createPing({
  prefix = () => config.get('PREFIX'),
  catalog = () => require('./menu').getCatalog(),
  online = () => process.uptime(),
  now = () => performance.now(),
} = {}) {
  return async function ping(sock, ctx) {
    const start = now();
    const p = clean(prefix());
    const count = catalog().length;
    const elapsed = uptime(online());
    const latency = Math.max(0, now() - start).toFixed(1);
    return sock.sendMessage(ctx.jid, {
      text: frameMenu('PING DA MATILHA', [
        `🌹 *Prefixo:* ${mono(p)}\n⭐ *Versão:* ${mono(version)}\n⏱️ *Uptime:* ${mono(elapsed)}\n🏓 *Ping interno:* ${mono(latency + ' ms')}\n💚 *Status:* online\n📜 *Comandos:* ${mono(count)} (sem aliases)`,
      ], { identity: true }),
    }, { quoted: ctx.msg });
  };
}

module.exports = { createPing, ping: createPing() };
