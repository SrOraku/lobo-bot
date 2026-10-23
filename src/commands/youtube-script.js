'use strict';
const { Worker } = require('node:worker_threads');
// O script do player é interpretado fora da thread do bot, com prazo limitado.
function evaluatePlayer(data) {
  if (typeof data?.output !== 'string' || data.output.length > 4 * 1024 * 1024)
    return Promise.reject(Error('PLAYER_SCRIPT_INVALID'));
  return new Promise((resolve, reject) => {
    let finished = false;
    const worker = new Worker(
      `const {parentPort,workerData}=require('node:worker_threads');
      import('jintr').then(({Jinter})=>{const interpreter=new Jinter();parentPort.postMessage(interpreter.evaluate(workerData));}).catch(error=>{throw error;});`,
      { eval: true, workerData: data.output, resourceLimits: { maxOldGenerationSizeMb: 64 } },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error('PLAYER_SCRIPT_TIMEOUT'));
    }, 10000);
    worker.once('message', (value) => {
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(value);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (!finished) reject(Error('PLAYER_SCRIPT_FAILED'));
    });
  });
}
module.exports = { evaluatePlayer };
