'use strict';
const { randomUUID } = require('node:crypto');
function localAsk(question) {
  const rl = require('node:readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}
function askConsole(question, { channel = process, supervised = process.env.LOBO_SUPERVISED === '1', ask = localAsk } = {}) {
  if (!supervised || !channel.connected || typeof channel.send !== 'function') return ask(question);
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    function cleanup() { channel.removeListener('message', receive); channel.removeListener('disconnect', disconnected); }
    function disconnected() { cleanup(); reject(Error('O console foi desconectado antes de receber o número.')); }
    function receive(message) {
      if (message?.type !== 'lobo:prompt-answer' || message.id !== id) return;
      cleanup(); resolve(String(message.answer || '').trim());
    }
    channel.on('message', receive);
    channel.once('disconnect', disconnected);
    try { channel.send({ type: 'lobo:prompt', id, question }); }
    catch (error) { cleanup(); reject(error); }
  });
}
module.exports = { askConsole, localAsk };
