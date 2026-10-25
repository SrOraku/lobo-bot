import test from 'node:test';
import assert from 'node:assert/strict';
import { displayWidth, panelHeader, sectionHeading, numericText, progress, panel, commandLine, contentLine } from '../src/presentation.js';

const plain = value => value.replace(/[*_`]/g, '');

test('long headings preserve every grapheme while all structural rows fit 26 display columns', () => {
  for (const title of ['BATALHA DA ALCATEIA', '👨‍👩‍👧‍👦 PROFISSÕES E INFLUÊNCIA DA ALCATEIA', 'PALAVRAMUITOLONGASEMESPACOSMAISDELIMITES', '龍龍龍龍龍龍龍龍龍龍龍龍龍龍龍龍龍龍']) {
    for (const header of [panelHeader(title), sectionHeading(title)]) {
      for (const row of header.split('\n')) assert.ok(displayWidth(row) <= 26, row);
      const content = [...header.matchAll(/\*([^*]+)\*/gu)].map(match => match[1]).join(' ');
      assert.equal(content.replace(/\s/g, ''), title.replace(/\s/g, ''));
    }
  }
});

test('numeric typography preserves links, real identities, ids, signed decimals and existing code', () => {
  const text = 'Saldo: -25,50 • HP: 93.4/100 • 20% • job-123 • lobo-2026-10-20.json • Lobo #01 • `convite-123`';
  const protectedValues = ['https://example.com/videos/123?id=45', 'http://localhost:8080/videos/123', '@5511999999999', '5511999999999@s.whatsapp.net', '887766@lid', '120363000123@g.us', '`25 WoK coin`', '```\n25 @5511999999999\n```'];
  const formatted = numericText(text);
  assert.equal(formatted.replace(/`/g, ''), text.replace(/`/g, ''));
  for (const token of ['`-25,50`', '`93.4/100`', '`20%`', 'job-123', 'lobo-2026-10-20.json', 'Lobo #01', '`convite-123`']) assert.ok(formatted.includes(token), token);
  assert.equal(numericText(formatted), formatted);
  assert.equal(contentLine('Saldo: 25 • https://example.com/123'), '  *Saldo:* `25` • https://example.com/123');
  assert.equal(contentLine('`Convite: 123`'), '  `Convite: 123`');
  for (const value of protectedValues) {
    assert.equal(numericText(value), value, value);
    assert.ok(contentLine(value).includes(value), value);
    assert.ok(contentLine(`Link: ${value}`).includes(value), value);
    const mixed = numericText(`Saldo: 25 • ${value} • XP: 50`);
    assert.ok(mixed.includes(value), value);
    assert.ok(mixed.includes('`25`') && mixed.includes('`50`'));
  }
});

test('HUD bars are bounded and report the actual unmodified numerical values beside them', () => {
  assert.equal(progress(0), '▱'.repeat(8));
  assert.equal(progress(100), '▰'.repeat(8));
  assert.equal(progress(-5), '▱'.repeat(8));
  assert.equal(progress(1000), '▰'.repeat(8));
  const values = ['HP: 93.4/100', 'Saldo: 150 WoK coin', '> ⏳ _Volte amanhã._'];
  const before = structuredClone(values), output = panel('BATALHA DA ALCATEIA', values);
  assert.deepEqual(values, before);
  assert.match(output, /`93\.4\/100`/);
  assert.match(output, /`150` WoK coin/);
  assert.equal(output.split('\n').at(-1), values.at(-1).replace(/^> /u, '> 🌹 '));
});

test('command render preserves unusual prefixes and opaque argument ids without interpreting either', () => {
  const result = commandLine('🐺 *?familia aceitar convite-lua-123 — aceitar o convite', '*?').join('\n');
  assert.ok(result.includes('*?familia'));
  assert.ok(result.includes('`aceitar convite-lua-123`'));
  assert.ok(result.includes('_aceitar o convite_'));
  assert.match(result, /^     ▸ /);
});
