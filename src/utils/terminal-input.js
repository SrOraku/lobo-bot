'use strict';
const { randomUUID } = require('node:crypto');
function localAsk(question, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve, reject) => {
    const closedError = () => Object.assign(new Error('O console foi fechado antes de receber uma resposta.'), { code: 'CONSOLE_CLOSED' });
    if (input.destroyed || input.readableEnded) {
      reject(closedError());
      return;
    }
    let rl, settled = false;
    function finish(error, answer) {
      if (settled) return;
      settled = true;
      input.removeListener('close', closed);
      output.removeListener('error', failed);
      if (rl) {
        rl.removeListener('close', closed);
        rl.removeListener('error', failed);
        rl.close();
      }
      if (error) reject(error);
      else resolve(answer.trim());
    }
    function closed() { finish(closedError()); }
    function failed(cause) {
      finish(Object.assign(new Error('Não foi possível ler a resposta do console.', { cause }), { code: 'CONSOLE_ERROR' }));
    }
    try {
      rl = require('node:readline').createInterface({ input, output });
      rl.once('close', closed);
      rl.once('error', failed);
      input.once('close', closed);
      output.once('error', failed);
      rl.question(question, answer => finish(null, answer));
    } catch (error) { failed(error); }
  });
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
