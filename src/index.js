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
  try {
    const license = await licenseGuard.authorizeStartup();
    if (license.enabled) {
      if (license.grace) console.warn('[LICENÇA] API indisponível; inicialização permitida dentro da tolerância local de 24h.');
      else console.log('[LICENÇA] Instalação autorizada pelo LOBO-BOT LICENSE.');
      licenseGuard.startHeartbeat({
        log: code => console.error('[LICENÇA] Verificação periódica falhou:', code),
        onDenied: reason => {
          console.error('[LICENÇA] Autorização negada. Encerrando o bot:', String(reason).slice(0, 80));
          process.exit(1);
        },
      });
    }
    require('./updater/supervisor').start();
  } catch (error) {
    console.error('[LICENÇA] Inicialização bloqueada:', error.code || 'LICENSE_START_FAILED');
    process.exit(1);
  }
})();
