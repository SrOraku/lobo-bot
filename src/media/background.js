'use strict';
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

const WORKER_CODES = new Set(require('./background-errors').BACKGROUND_ERROR_CODES);

// The worker's raw stderr may contain native diagnostics or file paths. Only
// allowlisted protocol fields cross into chat/logs, never its original output.
function workerFailure(error) {
  const stderr = String(error.stderr || '');
  const marker = /BACKGROUND_ERROR:(BACKGROUND_[A-Z_]+)\b/.exec(stderr)?.[1];
  const stages = [...stderr.matchAll(/BACKGROUND_STAGE:(DEPENDENCIES|INPUT|ASSETS|MODEL|INFERENCE|OUTPUT)\b/g)];
  let code = marker && WORKER_CODES.has(marker) ? marker : 'BACKGROUND_FAILED';
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') code = 'BACKGROUND_FAILED';
  else if (error.killed) code = 'BACKGROUND_TIMEOUT';
  else if (error.signal === 'SIGKILL') code = 'BACKGROUND_TERMINATED';
  else if (['SIGILL', 'SIGSEGV', 'SIGABRT'].includes(error.signal)) code = 'BACKGROUND_NATIVE_UNAVAILABLE';
  else if (error.code === 78) code = 'BACKGROUND_DEPENDENCY_MISSING';
  else if (error.code === 'ENOMEM') code = 'BACKGROUND_MEMORY';
  else if (['EACCES', 'EPERM'].includes(error.code)) code = 'BACKGROUND_PERMISSION';
  else if (error.code === 'ENOSPC') code = 'BACKGROUND_DISK_FULL';
  const failure = new Error(code);
  failure.code = code;
  failure.stage = stages.at(-1)?.[1] || 'WORKER';
  return failure;
}

function createBackgroundRemover({ run = execFile, timeout = 180000 } = {}) {
  return async (input, output) => {
    try {
      await run(process.execPath,
        [path.join(__dirname, 'remove-background-worker.js'), input, output],
        { timeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, encoding: 'utf8' });
    } catch (error) { throw workerFailure(error); }
  };
}

const BACKGROUND_MESSAGES = Object.freeze({
  BACKGROUND_DEPENDENCY_MISSING: 'A biblioteca de remoção não está instalada completamente. O responsável pela hospedagem deve executar npm ci.',
  BACKGROUND_ASSET_MISSING: 'Os arquivos do modelo de remoção estão ausentes ou incompletos. Reinstale as dependências com npm ci.',
  BACKGROUND_NATIVE_UNAVAILABLE: 'O motor de remoção não conseguiu executar nesta hospedagem. Confira a compatibilidade da imagem Linux e do processador.',
  BACKGROUND_MEMORY: 'O motor de remoção informou falta de memória. A hospedagem precisa de mais RAM disponível para processar a foto.',
  BACKGROUND_TERMINATED: 'A hospedagem encerrou o processo de remoção. Isso pode ocorrer por limite de recursos; confira o console para confirmar.',
  BACKGROUND_TIMEOUT: 'A remoção ultrapassou 3 minutos e foi interrompida. Confira os recursos da hospedagem antes de tentar novamente.',
  BACKGROUND_PERMISSION: 'A hospedagem negou acesso aos arquivos necessários para processar a foto.',
  BACKGROUND_DISK_FULL: 'Não há espaço livre para processar a foto. Libere espaço na hospedagem.',
  BACKGROUND_INVALID_IMAGE: 'Não consegui abrir essa imagem. Reenvie a foto e responda a ela com o comando.',
  BACKGROUND_MODEL_FAILED: 'Não foi possível carregar o modelo de remoção. Consulte o código no console da hospedagem.',
  BACKGROUND_INFERENCE_FAILED: 'O modelo carregou, mas falhou ao recortar a imagem. Tente outra foto e consulte o código no console.',
  BACKGROUND_FAILED: 'A remoção local falhou. Consulte o código e a etapa no console da hospedagem.',
});

function mediaFailure(error, stage) {
  let code = String(error.code || '');
  if (['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(code)) code = 'BACKGROUND_DEPENDENCY_MISSING';
  else if (['ERR_DLOPEN_FAILED'].includes(code)) code = 'BACKGROUND_NATIVE_UNAVAILABLE';
  else if (code === 'ENOMEM') code = 'BACKGROUND_MEMORY';
  else if (['EACCES', 'EPERM'].includes(code)) code = 'BACKGROUND_PERMISSION';
  else if (code === 'ENOSPC') code = 'BACKGROUND_DISK_FULL';
  if (Object.hasOwn(BACKGROUND_MESSAGES, code)) return { code, stage: error.stage || stage, message: BACKGROUND_MESSAGES[code] };
  if (stage === 'download') return { code: 'MEDIA_DOWNLOAD_FAILED', stage, message: 'Não consegui baixar a foto do WhatsApp. Reenvie a foto e responda à nova mensagem com o comando.' };
  if (stage === 'decode') return { code: 'MEDIA_INVALID_IMAGE', stage, message: 'Não consegui abrir essa imagem. Reenvie a foto em JPG ou PNG.' };
  if (stage === 'send') return { code: 'MEDIA_SEND_FAILED', stage, message: 'A mídia foi processada, mas o WhatsApp recusou o envio. Tente novamente em instantes.' };
  return { code: 'MEDIA_PROCESSING_FAILED', stage, message: 'Não foi possível processar esta mídia. Consulte o código no console da hospedagem.' };
}

module.exports = { createBackgroundRemover, workerFailure, mediaFailure };
