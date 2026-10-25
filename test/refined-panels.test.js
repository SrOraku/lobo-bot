'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { frameMenu, frameNotice, IDENTITY } = require('../src/menus/render');
const { width, plain, BOTTOM } = require('../src/ui/text');
test('menus mantêm conteúdo e cabeçalhos compactos na tema simétrico', () => {
  const text = frameMenu('MENU PRINCIPAL DA MATILHA', ['👤 *Usuário:* Lobo', '🌹 Conteúdo da matilha 🐺', '> Dica de navegação']);
  assert.ok(text.startsWith('╭'));
  assert.ok(plain(text).replace(/[│\n]+/g, ' ').replace(/\s+/g, ' ').includes('MENU PRINCIPAL DA MATILHA'));
  assert.ok(text.includes(BOTTOM));
  assert.ok(text.includes('🌹 Conteúdo da matilha 🐺'));
  assert.ok(text.endsWith('> 🌹 Dica de navegação'));
  for (const line of text.split('\n').filter(line => /^[╭╰├]/u.test(line))) {
    assert.ok(width(line) <= 26);
    assert.equal(line, line.trimStart());
  }
  for (const value of Object.values(IDENTITY)) assert.ok(!text.includes(value));
});
test('aviso mantém ação identificável e números sem alterar menções', () => {
  const text = frameNotice('👑 ATUALIZAÇÃO INICIADA', ['⚙️ Aguarde a verificação e instalação.', '🌹 Conteúdo da matilha 🐺', 'Prazo: 30s • @5511999999999']);
  assert.ok(plain(text).replace(/\s+/g, ' ').includes('ATUALIZAÇÃO INICIADA'));
  assert.ok(text.startsWith('╭') && text.endsWith(BOTTOM));
  assert.ok(text.includes('🌹 Conteúdo da matilha 🐺'));
  assert.ok(text.includes('`30s`'));
  assert.ok(text.includes('@5511999999999'));
  for (const line of text.split('\n').filter(line => /^[╭╰├]/u.test(line))) assert.ok(width(line) <= 26);
});
