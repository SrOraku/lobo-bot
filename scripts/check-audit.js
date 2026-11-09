'use strict';
// Auditoria de segurança das dependências de produção (npm run security).
//
// Mesmo critério de `npm audit --omit=dev --audit-level=high`: qualquer
// vulnerabilidade alta ou crítica reprova. A diferença é que as exceções
// aceitas ficam aqui, documentadas e à vista: cada uma vale para UM aviso,
// em UM pacote, em UM caminho de node_modules e em UMA versão exata, e é
// impressa em toda execução (no GitHub Actions, também como anotação).
// O mesmo aviso em outro pacote, caminho ou versão continua reprovando.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const BLOCKING = new Set(['high', 'critical']);

const EXCEPTIONS = Object.freeze([
  Object.freeze({
    advisory: 'GHSA-mrhx-c7xc-m3w5',
    package: 'zod',
    version: '3.25.76',
    node: 'node_modules/@imgly/background-removal-node/node_modules/zod',
    reason: 'A biblioteca do !sfundo só funciona com o zod 3 (usa z.function().args()) e não existe zod 3 corrigido. ' +
      'Ali o zod valida apenas a configuração fixa que o próprio bot passa, nunca dados enviados por usuários, ' +
      'então o esgotamento de memória descrito no aviso não é alcançável. O restante do projeto usa o zod 4 corrigido.',
    remove: 'Remover quando @imgly/background-removal-node aceitar o zod 4.',
  }),
]);

function lockedVersions(root = path.resolve(__dirname, '..')) {
  const packages = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages || {};
  return node => packages[node]?.version;
}

// Separa o relatório do npm em bloqueios, exceções aceitas e exceções sem uso.
// Qualquer coisa que não seja reconhecida com certeza é tratada como bloqueio.
function evaluate(report, { exceptions = EXCEPTIONS, installed = lockedVersions() } = {}) {
  const entries = report?.vulnerabilities;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw Error('Relatório do npm audit em formato inesperado.');
  const blocking = [], accepted = [], used = new Set();
  const blocks = severity => BLOCKING.has(severity) || !SEVERITIES.includes(severity);
  for (const [name, entry] of Object.entries(entries)) {
    const nodes = Array.isArray(entry?.nodes) ? entry.nodes : [];
    const via = Array.isArray(entry?.via) ? entry.via : [];
    if (!via.length && blocks(entry?.severity))
      blocking.push({ package: name, advisory: null, severity: entry?.severity, title: 'vulnerabilidade sem detalhes', nodes });
    for (const item of via) {
      if (typeof item === 'string') {
        // Entrada transitiva: o aviso real é avaliado na entrada do pacote citado.
        if (!Object.hasOwn(entries, item) && blocks(entry.severity))
          blocking.push({ package: name, advisory: null, severity: entry.severity, title: `depende de ${item}, que não está no relatório`, nodes });
        continue;
      }
      const advisory = /GHSA(?:-[a-z0-9]{4}){3}/i.exec(String(item?.url || ''))?.[0] || null;
      const severity = SEVERITIES.includes(item?.severity) ? item.severity : entry.severity;
      const finding = { package: name, advisory, severity, title: String(item?.title || 'sem título'), url: item?.url, nodes };
      const exception = advisory && exceptions.find(candidate =>
        candidate.advisory.toLowerCase() === advisory.toLowerCase() && candidate.package === name &&
        nodes.length > 0 && nodes.every(node => node === candidate.node && installed(node) === candidate.version));
      if (exception) { used.add(exception); accepted.push({ ...finding, reason: exception.reason, remove: exception.remove }); }
      else if (blocks(severity)) blocking.push(finding);
    }
  }
  return { blocking, accepted, unused: exceptions.filter(exception => !used.has(exception)) };
}

function runAudit(root = path.resolve(__dirname, '..')) {
  // Dentro de `npm run`, reutiliza o próprio npm em execução; fora dele, o npm do PATH.
  const cli = process.env.npm_execpath;
  const viaNode = cli && /npm-cli\.js$/.test(cli);
  const file = viaNode ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [...(viaNode ? [cli] : []), 'audit', '--omit=dev', '--json'];
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: root, maxBuffer: 32 * 1024 * 1024, shell: !viaNode && process.platform === 'win32' }, (error, stdout) => {
      // O npm sai com código 1 quando encontra vulnerabilidades; o relatório vem no stdout.
      let report;
      try { report = JSON.parse(stdout); } catch { return reject(Error('O npm audit não devolveu um relatório legível' + (error ? ` (${error.code || error.message})` : '') + '.')); }
      if (report.error) return reject(Error('O npm audit falhou: ' + (report.error.summary || report.error.code || 'erro desconhecido')));
      resolve(report);
    });
  });
}

function describe(finding) {
  return `${finding.package} — ${finding.advisory || 'sem identificador'} (${finding.severity || 'gravidade desconhecida'}): ${finding.title}`;
}

async function main({ audit = runAudit, log = console.log, annotate = process.env.GITHUB_ACTIONS === 'true' } = {}) {
  const report = await audit();
  const { blocking, accepted, unused } = evaluate(report);
  const counts = report.metadata?.vulnerabilities || {};
  log('🔎 Auditoria das dependências de produção — alta ou crítica reprova.');
  log(`   Relatório do npm: ${SEVERITIES.map(level => `${level} ${counts[level] ?? 0}`).join(' • ')}`);
  if (accepted.length) {
    log(`\n⚠️  Exceções aceitas e documentadas em scripts/check-audit.js (${accepted.length}):`);
    for (const finding of accepted) {
      log(`   • ${describe(finding)}`);
      log(`     Onde: ${finding.nodes.join(', ')}`);
      log(`     Motivo: ${finding.reason}`);
      log(`     ${finding.remove} ${finding.url || ''}`.trimEnd());
      if (annotate) log(`::warning title=Exceção de auditoria aceita::${finding.package} ${finding.advisory} (${finding.severity}) em ${finding.nodes.join(', ')} — veja scripts/check-audit.js`);
    }
  }
  for (const exception of unused) {
    log(`\nℹ️  Exceção sem uso: ${exception.package} ${exception.advisory} não aparece mais no relatório. Remova-a de scripts/check-audit.js.`);
    if (annotate) log(`::notice title=Exceção de auditoria sem uso::${exception.package} ${exception.advisory} pode ser removida de scripts/check-audit.js`);
  }
  if (blocking.length) {
    log(`\n❌ Vulnerabilidades altas ou críticas sem exceção (${blocking.length}):`);
    for (const finding of blocking) {
      log(`   • ${describe(finding)}`);
      if (finding.nodes.length) log(`     Onde: ${finding.nodes.join(', ')}`);
      if (finding.url) log(`     ${finding.url}`);
    }
    return false;
  }
  log('\n✅ Nenhuma outra vulnerabilidade alta ou crítica nas dependências de produção.');
  return true;
}

if (require.main === module) {
  main().then(ok => { process.exitCode = ok ? 0 : 1; }).catch(error => {
    console.error(`❌ Auditoria não concluída: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { EXCEPTIONS, evaluate, main, runAudit };
