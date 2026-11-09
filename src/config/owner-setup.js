'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const validOwner = value => /^\d{10,15}$/.test(value);
const failure = (code, message) => Object.assign(new Error(message), { code });

async function ensureOwner({
  root = path.resolve(__dirname, '../..'),
  env = process.env,
  ask = question => require('../utils/terminal-input').localAsk(question),
  log = console,
} = {}) {
  const configured = String(env.BOT_OWNER || '').trim();
  if (configured) {
    if (!validOwner(configured)) {
      throw failure('OWNER_INVALID', 'Corrija BOT_OWNER: use de 10 a 15 dígitos, com DDI, sem + ou espaços.');
    }
    env.BOT_OWNER = configured;
    return configured;
  }

  const directory = path.join(root, 'data');
  const file = path.join(directory, 'bot-owner.json');
  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw failure('OWNER_CONFIG_INVALID', 'Não foi possível ler data/bot-owner.json. Verifique o arquivo ou configure BOT_OWNER no painel/.env.');
    }
  }
  if (stored !== undefined) {
    if (!stored || typeof stored.owner !== 'string' || !validOwner(stored.owner)) {
      throw failure('OWNER_CONFIG_INVALID', 'O dono salvo em data/bot-owner.json é inválido. Verifique o arquivo ou configure BOT_OWNER no painel/.env.');
    }
    env.BOT_OWNER = stored.owner;
    return stored.owner;
  }

  log.log('[CONFIG] Primeiro início: cadastre o número que terá permissão de dono nesta instalação.');
  log.log('[CONFIG] O número de conexão do WhatsApp será solicitado separadamente no pareamento.');
  while (true) {
    let answer;
    try {
      answer = String(await ask('Número do dono (DDI + DDD + número, somente dígitos): ')).trim();
    } catch {
      throw failure('OWNER_INPUT_CLOSED', 'O console foi fechado antes do cadastro. Configure BOT_OWNER no painel/.env ou reinicie e informe o número pelo console.');
    }
    if (!validOwner(answer)) {
      log.log('[CONFIG] Número inválido. Informe de 10 a 15 dígitos, com DDI, sem + ou espaços.');
      continue;
    }

    const temporary = path.join(directory, `.bot-owner-${randomUUID()}.tmp`);
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      fs.writeFileSync(temporary, JSON.stringify({ owner: answer }) + '\n', { mode: 0o600, flag: 'wx' });
      // Publicação atômica, sem substituir um dono salvo por outro processo.
      fs.linkSync(temporary, file);
    } catch {
      throw failure('OWNER_SAVE_FAILED', 'Não foi possível salvar data/bot-owner.json. Verifique a permissão de escrita ou configure BOT_OWNER no painel/.env.');
    } finally {
      try { fs.unlinkSync(temporary); } catch {}
    }
    env.BOT_OWNER = answer;
    log.log('[CONFIG] Dono salvo em data/bot-owner.json. O cadastro será reutilizado nos próximos inícios.');
    return answer;
  }
}

module.exports = { ensureOwner };
