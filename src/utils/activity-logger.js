'use strict';
const pino = require('pino');
const { createConsoleStyle, colorEnabled } = require('../ui/console');
const clean = (value, size = 100) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, size);
function createActivityLogger({ stdout = process.stdout, stderr = process.stderr, file, errorFile,
  level = 'info', commands = () => true, prefix = () => '!', color = () => colorEnabled(process.env, stdout) } = {}) {
  // O desenho das linhas fica em src/ui/console.js; aqui só se decide o que aparece.
  const styles = { true: createConsoleStyle({ color: true }), false: createConsoleStyle({ color: false }) };
  const style = () => styles[(typeof color === 'function' ? color() : color) === true];
  const print = (stream, lines) => stream.write(lines.join('\n') + '\n');
  const consoleStream = { write(line) {
    for (const entry of String(line).trim().split('\n')) {
      let record; try { record = JSON.parse(entry); } catch { continue; }
      if (record.type === 'command' && commands()) print(stdout, style().commandLines(record));
      // Um aviso marcado como silencioso vai só para o arquivo (o console já mostrou o cabeçalho).
      else if (record.type === 'connection') { if (!record.silent) print(stdout, style().connectionLines(record)); }
      else if (record.level >= 50) print(stderr, style().errorLines(record));
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
    activity.info({ type: 'connection', code: data.code, attempt: data.attempt, ...(data.silent === true ? { silent: true } : {}) }, clean(message, 200));
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
