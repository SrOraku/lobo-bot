import path from 'node:path';
import { BOT_NAME, BOT_DESCRIPTION, OWNER_NUMBER } from './game/constants.js';

export { BOT_NAME, BOT_DESCRIPTION };

export function loadConfig(env = process.env) {
  const ownerNumber = (env.OWNER_NUMBER || OWNER_NUMBER).replace(/\D/g, '');
  const pairingNumber = (env.PAIRING_NUMBER || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(ownerNumber)) throw new Error('OWNER_NUMBER inválido: use DDI + DDD + número.');
  if (pairingNumber && !/^\d{8,15}$/.test(pairingNumber)) throw new Error('PAIRING_NUMBER inválido.');
  const prefix = env.PREFIX || '!';
  if (!/^\S{1,3}$/u.test(prefix)) throw new Error('PREFIX precisa ter de 1 a 3 caracteres sem espaços.');
  return {
    ownerNumber, ownerJid: `${ownerNumber}@s.whatsapp.net`, pairingNumber,
    botName: env.BOT_NAME || BOT_NAME, prefix,
    botDescription: env.BOT_DESCRIPTION || BOT_DESCRIPTION,
    authDir: path.resolve(env.AUTH_DIR || './auth'),
    dataFile: path.resolve(env.DATA_FILE || './data/database.json'),
    backupDir: path.resolve(env.BACKUP_DIR || './backups'),
    logLevel: env.LOG_LEVEL || 'warn',
  };
}
