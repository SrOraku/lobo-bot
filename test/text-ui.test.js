'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../src/ui/text');

test('symmetric frames keep every title grapheme within 26 display columns', () => {
  for (const title of ['PAINEL DE ATIVAÇÕES', '👨‍👩‍👧‍👦 INTELIGÊNCIA E ESTRATÉGIA', '龙'.repeat(35), 'ÁRVORE'.repeat(8)]) {
    for (const kind of ['card', 'block']) {
      const lines = ui.titleRows(title, kind);
      for (const line of lines) assert.ok(ui.width(line) <= 26, line);
      const preserved = lines.flatMap(line => [...line.matchAll(/\*([^*]+)\*/gu)].map(match => match[1])).join('');
      assert.equal(preserved.replace(/\s/g, ''), title.replace(/\s/g, ''));
    }
  }
  for (const border of [ui.TOP, ui.HEAD_BOTTOM, ui.BOTTOM, ui.DIVIDER]) {
    assert.ok(ui.width(border) <= 26); assert.ok(border.includes('🌹') && border.includes('🐺'));
  }
});

test('numeric formatting preserves identity tokens, opaque ids, links and existing code', () => {
  const tokens = ['@5511999999999', '5511999999999@s.whatsapp.net', '123456@lid', '1200001@g.us',
    'https://example.org/123?a=45', 'job-123', 'lobo-2026-10-20.json', 'Lobo #01', '`25 WoK coin`', '```\n25 @5511\n```'];
  for (const token of tokens) assert.equal(ui.numericText(token), token);
  const source = 'Saldo: -25,50 • HP: 93.4/100 • 20% • @5511999999999';
  const value = ui.numericText(source);
  assert.equal(value.replace(/`/g, ''), source);
  assert.equal(ui.numericText(value), value);
  for (const token of ['`-25,50`', '`93.4/100`', '`20%`']) assert.ok(value.includes(token));
});

test('command formatting keeps arbitrary prefixes and full argument ids', () => {
  for (const prefix of ['!', '!!', '*?']) {
    assert.equal(ui.command(prefix + 'familia aceitar convite-lua-123'), '*' + prefix + 'familia* `aceitar convite-lua-123`');
  }
  assert.equal(ui.mono(ui.mono('123')), '`123`');
  assert.equal(ui.numericText('*!!2048* `1 2`'), '*!!2048* `1 2`');
});

test('HUD bars clamp presentation without modifying the numerical source', () => {
  for (const value of [-50, 0, 50, 100, 1000, NaN]) {
    const bar = ui.progress(value, 100);
    assert.equal([...bar].length, 8); assert.match(bar, /^[▰▱]+$/u);
  }
  assert.equal(ui.progress(50, 100), '▰'.repeat(4) + '▱'.repeat(4));
  const sections = ['HP: 93.4/100', ui.progress(93.4, 100), '> dica'];
  const before = structuredClone(sections), result = ui.card('BATALHA', sections);
  assert.deepEqual(sections, before);
  assert.ok(result.includes('`93.4/100`') && result.includes('`' + ui.progress(93.4, 100) + '`'));
  assert.ok(result.endsWith('> 🌹 dica'));
});

test('status brackets contain only their colored indicator', () => {
  assert.equal(ui.badge(true), '`〔 🟢 〕`'); assert.equal(ui.badge(false), '`〔 🔴 〕`');
  assert.doesNotMatch(ui.badge(true) + ui.badge(false), /ON|OFF|[0-9]/u);
});

test('greetings and time use the actual supplied instant in Sao Paulo', () => {
  for (const [hour, text] of [['03', 'madrugada'], ['12', 'Bom dia'], ['18', 'Boa tarde'], ['23', 'Boa noite']])
    assert.ok(ui.greeting(new Date(`2026-10-25T${hour}:00:00Z`)).includes(text));
  assert.equal(ui.clock(new Date('2026-10-25T12:00:00Z')), '09:00');
});

test('varied narrative never repeats consecutively and never consumes game Math.random', t => {
  t.mock.method(Math, 'random', () => { throw Error('game RNG must stay untouched'); });
  for (const outcome of ['win', 'loss']) {
    let prior;
    for (let index = 0; index < 12; index++) {
      const phrase = ui.flavor(outcome, () => 0); assert.notEqual(phrase, prior); prior = phrase;
    }
  }
  assert.ok(ui.flavor('win', () => { throw Error('decorative RNG unavailable'); }));
});

test('money is virtual by default while the formatter supports explicit symbols', () => {
  assert.equal(ui.money(1500), '`1.500 WoK coin`');
  assert.equal(ui.money(1500, 'R$'), '`R$ 1.500`');
});
