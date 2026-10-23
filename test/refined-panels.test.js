'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { frameMenu, frameNotice, IDENTITY } = require('../src/menus/render');
test('menus mantêm título recuado e bordas na margem esquerda', () => {
  const text = frameMenu('MENU PRINCIPAL DA MATILHA', ['👤 *Usuário:* Lobo']);
  assert.ok(text.startsWith('🌹╔═══❖♆❖═══🐾═══❖♆❖═══╗'));
  assert.ok(text.includes('\n   *MENU PRINCIPAL DA MATILHA*\n'));
  assert.ok(text.endsWith('╚═══❖🌹❖═══♆═══❖🐾❖═══╝🐺'));
  for (const line of text.split('\n'))
    if (line.trim().startsWith('╚') || line.trim().startsWith('╭') || line.trim().startsWith('╰'))
      assert.equal(line, line.trimStart());
  for (const value of Object.values(IDENTITY)) assert.ok(text.includes(value));
});
test('aviso usa dois divisores, título em negrito e ícone fora do negrito', () => {
  const text = frameNotice('👑 ATUALIZAÇÃO INICIADA', ['⚙️ Aguarde a verificação e instalação.']);
  const divider = '┈┈ ❀ 🌹 ❀ ┈┈ ⚜️ 🐺 ⚜️ ┈┈';
  assert.equal(text.split(divider).length - 1, 2);
  assert.ok(text.includes('\n👑 *ATUALIZAÇÃO INICIADA*\n'));
  assert.ok(text.startsWith('🌹╔═══❖♆❖═══╗\n*' + IDENTITY.name + '*'));
  assert.ok(text.endsWith('╚═══❖♆❖═══╝🐺'));
});
