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

// Licença, cadastro do dono e supervisor: a mesma sequência do atualizar.sh (src/startup.js).
require('dotenv').config();
require('./startup').launch();
