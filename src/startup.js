'use strict';
// Sequência de inicialização compartilhada por `npm start` (src/index.js) e
// `bash atualizar.sh` (scripts/update-and-start.js): licença, cadastro do dono e só
// então o supervisor do runtime WhatsApp. Antes o atualizar.sh chamava o supervisor
// direto, sem ler data/bot-owner.json, e o runtime parava com
// "Variável obrigatória ausente: BOT_OWNER" mesmo com o dono já cadastrado.
async function launch({
  licenseGuard = require('./licensing/licenseGuard'),
  ensureOwner = () => require('./config/owner-setup').ensureOwner(),
  startSupervisor = () => require('./updater/supervisor').start(),
  log = console,
  exit = code => process.exit(code),
} = {}) {
  let phase = 'LICENÇA';
  try {
    const license = await licenseGuard.authorizeStartup();
    if (license.enabled) {
      if (license.grace) log.warn('[LICENÇA] API indisponível; inicialização permitida dentro da tolerância local de 24h.');
      else log.log('[LICENÇA] Instalação autorizada pelo LOBO-BOT LICENSE.');
      licenseGuard.startHeartbeat({
        log: code => log.error('[LICENÇA] Verificação periódica falhou:', code),
        onDenied: reason => {
          log.error('[LICENÇA] Autorização negada. Encerrando o bot:', String(reason).slice(0, 80));
          exit(1);
        },
      });
    }
    phase = 'CONFIG';
    await ensureOwner();
    phase = 'INICIALIZAÇÃO';
    return startSupervisor();
  } catch (error) {
    log.error(`[${phase}] Inicialização bloqueada:`, error.code || 'STARTUP_FAILED');
    if (phase === 'CONFIG') log.error(error.message);
    exit(1);
    return null;
  }
}

module.exports = { launch };
