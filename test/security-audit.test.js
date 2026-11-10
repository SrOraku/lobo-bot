'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EXCEPTIONS, evaluate, main } = require('../scripts/check-audit');

const NESTED = 'node_modules/@imgly/background-removal-node/node_modules/zod';
const installed = node => ({ [NESTED]: '3.25.76', 'node_modules/zod': '4.6.7' }[node]);
const advisory = (id, severity = 'high', title = 'Aviso de teste') => ({ source: 1, name: 'x', title, url: 'https://github.com/advisories/' + id, severity, range: '*' });

// Relatório como o npm devolve hoje: o aviso no zod aninhado e a entrada transitiva da biblioteca.
function report(extra = {}, zod = {}) {
  return { auditReportVersion: 2, vulnerabilities: {
    '@imgly/background-removal-node': { name: '@imgly/background-removal-node', severity: 'high', via: ['zod'], nodes: ['node_modules/@imgly/background-removal-node'] },
    zod: { name: 'zod', severity: 'high', via: [advisory('GHSA-mrhx-c7xc-m3w5')], nodes: [NESTED], ...zod },
    ...extra,
  }, metadata: { vulnerabilities: { high: 2 } } };
}

test('a única exceção é o zod 3 aninhado da biblioteca do !sfundo, com motivo e condição de remoção', () => {
  assert.equal(EXCEPTIONS.length, 1, 'novas exceções precisam ser decididas e testadas uma a uma');
  const [exception] = EXCEPTIONS;
  assert.equal(exception.advisory, 'GHSA-mrhx-c7xc-m3w5'); assert.equal(exception.package, 'zod');
  assert.equal(exception.version, '3.25.76'); assert.equal(exception.node, NESTED);
  assert.ok(exception.reason.length > 40); assert.ok(exception.remove.length > 10);
  assert.ok(Object.isFrozen(EXCEPTIONS) && Object.isFrozen(exception));
  // A exceção descreve exatamente o que o lockfile instala.
  const lock = require('../package-lock.json');
  assert.equal(lock.packages[NESTED].version, exception.version);
  assert.match(lock.packages['node_modules/zod'].version, /^4\./);
});

test('o aviso aceito passa, fica visível e não libera mais nada', () => {
  const result = evaluate(report(), { installed });
  assert.deepEqual(result.blocking, []); assert.deepEqual(result.unused, []);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].advisory, 'GHSA-mrhx-c7xc-m3w5'); assert.deepEqual(result.accepted[0].nodes, [NESTED]);
  assert.ok(result.accepted[0].reason);
  // Sem relatório de vulnerabilidade, a exceção aparece como sem uso.
  assert.deepEqual(evaluate({ vulnerabilities: {} }, { installed }).unused, [...EXCEPTIONS]);
});

test('o mesmo aviso em outro caminho, versão ou pacote continua reprovando', () => {
  const blocked = (data, options = { installed }) => evaluate(data, options).blocking;
  // zod vulnerável também no topo do projeto.
  assert.equal(blocked(report({}, { nodes: [NESTED, 'node_modules/zod'] })).length, 1);
  assert.equal(blocked(report({}, { nodes: ['node_modules/zod'] })).length, 1);
  assert.equal(blocked(report({}, { nodes: [] })).length, 1);
  // Mesmo caminho, mas o lockfile instalou outra versão.
  assert.equal(blocked(report(), { installed: () => '3.21.4' }).length, 1);
  assert.equal(blocked(report(), { installed: () => undefined }).length, 1);
  // Mesmo identificador em outro pacote.
  const other = blocked(report({ lodash: { name: 'lodash', severity: 'high', via: [advisory('GHSA-mrhx-c7xc-m3w5')], nodes: [NESTED] } }));
  assert.equal(other.length, 1); assert.equal(other[0].package, 'lodash');
});

test('qualquer outro aviso alto ou crítico reprova, inclusive no próprio zod aninhado', () => {
  const second = evaluate(report({}, { via: [advisory('GHSA-mrhx-c7xc-m3w5'), advisory('GHSA-aaaa-bbbb-cccc', 'critical', 'Outro aviso')] }), { installed });
  assert.equal(second.accepted.length, 1); assert.equal(second.blocking.length, 1);
  assert.equal(second.blocking[0].advisory, 'GHSA-aaaa-bbbb-cccc'); assert.equal(second.blocking[0].severity, 'critical');

  const extra = evaluate(report({ axios: { name: 'axios', severity: 'high', via: [advisory('GHSA-1111-2222-3333')], nodes: ['node_modules/axios'] } }), { installed });
  assert.deepEqual(extra.blocking.map(item => item.package), ['axios']);

  // Gravidades menores não reprovam, como em --audit-level=high.
  const moderate = evaluate(report({ semver: { name: 'semver', severity: 'moderate', via: [advisory('GHSA-4444-5555-6666', 'moderate')], nodes: ['node_modules/semver'] } }), { installed });
  assert.deepEqual(moderate.blocking, []);
});

test('relatórios estranhos falham fechados', () => {
  for (const bad of [null, {}, { vulnerabilities: [] }, { vulnerabilities: 'x' }]) assert.throws(() => evaluate(bad, { installed }), /formato inesperado/);
  const blocked = data => evaluate({ vulnerabilities: data }, { installed }).blocking.length;
  assert.equal(blocked({ mystery: { name: 'mystery', severity: 'high', via: [], nodes: [] } }), 1, 'alta sem detalhes');
  assert.equal(blocked({ mystery: { name: 'mystery', severity: 'high', via: ['ghost'], nodes: [] } }), 1, 'transitiva sem origem');
  assert.equal(blocked({ mystery: { name: 'mystery', via: [{ title: 'sem gravidade', url: 'https://example.com/x' }], nodes: ['node_modules/mystery'] } }), 1, 'gravidade desconhecida');
  assert.equal(blocked({ zod: { name: 'zod', severity: 'high', via: [{ title: 'sem identificador', severity: 'high' }], nodes: [NESTED] } }), 1, 'aviso sem GHSA');
});

test('a saída sempre mostra a exceção aceita e reprova quando há bloqueio', async () => {
  const lines = [];
  assert.equal(await main({ audit: async () => report(), log: line => lines.push(line), annotate: true }), true);
  const output = lines.join('\n');
  assert.match(output, /Exceções aceitas e documentadas/); assert.ok(output.includes('GHSA-mrhx-c7xc-m3w5')); assert.ok(output.includes(NESTED));
  assert.match(output, /Motivo: /); assert.match(output, /::warning title=Exceção de auditoria aceita::zod GHSA-mrhx-c7xc-m3w5/);
  assert.match(output, /✅ Nenhuma outra vulnerabilidade alta ou crítica/);

  lines.length = 0;
  const failing = report({ axios: { name: 'axios', severity: 'critical', via: [advisory('GHSA-1111-2222-3333', 'critical', 'Falha grave')], nodes: ['node_modules/axios'] } });
  assert.equal(await main({ audit: async () => failing, log: line => lines.push(line), annotate: false }), false);
  assert.match(lines.join('\n'), /❌ Vulnerabilidades altas ou críticas sem exceção \(1\)/); assert.ok(lines.join('\n').includes('GHSA-1111-2222-3333'));
  assert.ok(!lines.join('\n').includes('✅'));
  await assert.rejects(main({ audit: async () => { throw Error('rede indisponível'); }, log: () => {} }), /rede indisponível/);
});

test('o CI continua executando a auditoria pelo npm run security', () => {
  assert.equal(require('../package.json').scripts.security, 'node scripts/check-audit.js');
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /run: npm run security/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});
