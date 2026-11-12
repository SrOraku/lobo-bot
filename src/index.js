'use strict';

// Instale dependências antes de carregar dotenv, a licença e o supervisor.
const { ensureDependencies } = require('./bootstrap');
if (!ensureDependencies()) process.exit(1);

const http = require('node:http');

// Hosts that provide PORT (including Render) can use this lightweight
// HTTP endpoint for platform port detection and health checks.
// Hosts without PORT keep the original bot-only startup behavior.
const isRender = process.env.RENDER === 'true';
const configuredPort = process.env.PORT;

if (isRender || configuredPort) {
  const port = Number(configuredPort || 10000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('A variável PORT precisa conter uma porta válida.');
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  server.on('error', (error) => {
    console.error('[HTTP] Não foi possível abrir a porta:', error);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[HTTP] Servidor de saúde ativo na porta ${port}.`);
  });
}

// A validação da licença acontece no processo supervisor, antes de iniciar o runtime WhatsApp.
require('dotenv').config();
const licenseGuard = require('./licensing/licenseGuard');
(async () => {
  let phase = 'LICENÇA', supervisor = null, licenseStopped = false;
  const explain = error => {
    try { for (const line of require('./licensing/messages').failureLines(error)) console.error('[LICENÇA] ' + line); } catch { /* A explicação é opcional; o código do erro já foi mostrado. */ }
  };
  // Encerra o bot inteiro. Sair só do supervisor deixaria o processo do WhatsApp rodando sozinho.
  const stopBot = () => {
    licenseStopped = true;
    if (!supervisor?.stop) process.exit(1);
    supervisor.stop();
    setTimeout(() => process.exit(1), 20000).unref();
  };
  try {
    const license = await licenseGuard.authorizeStartup();
    if (license.enabled) {
      if (license.grace) console.warn('[LICENÇA] API indisponível; inicialização permitida dentro da tolerância local de 24h.');
      else console.log('[LICENÇA] Instalação autorizada pelo LOBO-BOT LICENSE.');
      licenseGuard.startHeartbeat({
        log: code => console.error('[LICENÇA] Verificação periódica falhou:', code),
        onDenied: (reason, error) => {
          console.error('[LICENÇA] Autorização negada. Encerrando o bot:', String(reason).slice(0, 80));
          explain(error);
          stopBot();
        },
      });
    } else if (license.notice) {
      // Sem chave: período de aviso. O bot inicia, avisa aqui e avisa o dono pelo WhatsApp.
      for (const line of require('./licensing/messages').noticeLines(license.notice.deadline)) console.warn('[LICENÇA] ' + line);
      process.env.LOBO_LICENSE_NOTICE = String(license.notice.deadline);
      licenseGuard.watchNotice({
        deadline: license.notice.deadline,
        onExpired: error => {
          console.error('[LICENÇA] O período de aviso terminou. Encerrando o bot.');
          explain(error);
          stopBot();
        },
      });
    }
    phase = 'CONFIG';
    await require('./config/owner-setup').ensureOwner();
    phase = 'INICIALIZAÇÃO';
    supervisor = require('./updater/supervisor').start({ exit: code => process.exit(licenseStopped ? 1 : code) });
  } catch (error) {
    console.error(`[${phase}] Inicialização bloqueada:`, error.code || 'STARTUP_FAILED');
    if (phase === 'CONFIG') console.error(error.message);
    if (phase === 'LICENÇA') explain(error);
    process.exit(1);
  }
})();
