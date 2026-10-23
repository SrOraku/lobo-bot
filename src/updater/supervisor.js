'use strict';
const { fork } = require('node:child_process');
const path = require('node:path');
function start({ spawn = fork, exit = code => process.exit(code), ask = question => require('../utils/terminal-input').localAsk(question) } = {}) {
  let child, stopping = false, restart = false, timer;
  function launch() {
    restart = false;
    child = spawn(path.join(__dirname, '../runtime.js'), [], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, LOBO_SUPERVISED: '1' },
    });
    child.on('message', message => {
      if (!stopping && message?.type === 'lobo:prompt' && typeof message.id === 'string' && typeof message.question === 'string') {
        const requester = child;
        Promise.resolve().then(() => ask(message.question)).then(answer => {
          if (requester.connected) requester.send({ type: 'lobo:prompt-answer', id: message.id, answer });
        }).catch(() => { process.stderr.write('Erro ao ler o console de pareamento.\n'); });
        return;
      }
      if (stopping || restart || message?.type !== 'lobo:restart') return;
      restart = true;
      child.kill('SIGTERM');
      timer = setTimeout(() => child.kill('SIGKILL'), 15000);
      timer.unref?.();
    });
    child.once('error', () => { stopping = true; exit(1); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (restart && !stopping) launch();
      else exit(Number.isInteger(code) ? code : 1);
    });
  }
  const stop = () => { stopping = true; child?.kill('SIGTERM'); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  launch();
  return { stop };
}
function canRestart() { return process.env.LOBO_SUPERVISED === '1' && process.connected && typeof process.send === 'function'; }
function requestRestart() {
  if (!canRestart()) return false;
  process.send({ type: 'lobo:restart' });
  return true;
}
module.exports = { start, canRestart, requestRestart };
