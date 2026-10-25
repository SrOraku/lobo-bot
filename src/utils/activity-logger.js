'use strict';
const pino = require('pino');
const clean = (value, size = 100) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, size);
function createActivityLogger({ stdout = process.stdout, stderr = process.stderr, file, errorFile,
  level = 'info', commands = () => true, prefix = () => '!' } = {}) {
  const consoleStream = { write(line) {
    for (const entry of String(line).trim().split('\n')) {
      let record; try { record = JSON.parse(entry); } catch { continue; }
      const time = new Date(record.time).toLocaleTimeString('pt-BR', { hour12: false });
      if (record.type === 'command' && commands()) {
        stdout.write(`[${time}] 🐺 CMD ${clean(record.prefix, 8)}${clean(record.command, 50)} | ${record.group ? 'Grupo: ' + clean(record.groupName || record.group) : 'Privado'} | Usuário: ${clean(record.userName || record.sender)}\n`);
      } else if (record.type === 'connection') {
        stdout.write(`[${time}] 📡 ${clean(record.msg, 200)}\n`);
      } else if (record.level >= 50) {
        stderr.write(`[${time}] ❌ ${clean(record.msg, 200)}${record.code || record.error?.code || record.err?.code ? ' | Código: ' + clean(record.code || record.error?.code || record.err?.code, 50) : ''}\n`);
      }
    }
  } };
  const streams = [{ level: 'info', stream: consoleStream }];
  if (file) streams.push({ level: 'info', stream: file });
  if (errorFile) streams.push({ level: 'error', stream: errorFile });
  const logger = pino({ level: ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info',
    redact: ['creds', 'auth', 'session', 'key', 'privKey', 'rootKey', 'chainKey', 'privateKey', 'pairingCode', 'qr',
      '*.creds', '*.auth', '*.session', '*.privKey', '*.rootKey', '*.chainKey', '*.privateKey', '*.pairingCode', '*.qr'] }, pino.multistream(streams));
  // Operational summaries are independently enabled even if an old installation
  // has LOG_LEVEL=error. Generic library/debug info still stays off the console.
  const activity = logger.child({}, { level: 'info' });
  function logCommand(sender, command, group, { userName, groupName, prefix: customPrefix } = {}) {
    if (!commands()) return;
    activity.info({ type: 'command', sender, command, group: group || null, userName, groupName, prefix: customPrefix || prefix() }, 'Comando recebido');
  }
  function logConnection(message, data = {}) {
    activity.info({ type: 'connection', code: data.code, attempt: data.attempt }, clean(message, 200));
  }
  function baileysLogger() {
    return pino({ level: 'error' }, { write(line) {
      let value; try { value = JSON.parse(String(line)); } catch { return; }
      const code = value.fullErrorNode?.attrs?.code || value.err?.output?.statusCode || value.error?.output?.statusCode;
      if (String(code) === '515') return; // The lifecycle reports this expected restart.
      logger.error({ component: 'whatsapp', code: code || value.err?.code || 'WHATSAPP_TRANSPORT' }, 'Falha no transporte do WhatsApp.');
    } });
  }
  return { logger, logCommand, logConnection, baileysLogger };
}
module.exports = { createActivityLogger };
