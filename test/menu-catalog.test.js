'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { categoryOf, CATEGORIES, buildCatalog } = require('../src/menus/catalog');

test('categorias legadas dos comandos são direcionadas ao menu correto', () => {
  const cases = [
    ['lobo', 'alcateia'],
    ['gold', 'economia'],
    ['stats', 'rp'],
    ['mod', 'adm'],
    ['geral', 'info'],
  ];
  for (const [category, expected] of cases) {
    assert.equal(categoryOf({ name: 'comando_teste', category, minLevel: 0 }), expected);
    assert.ok(CATEGORIES[expected]);
  }
});

test('permissões e grupos explícitos continuam prevalecendo sobre a categoria', () => {
  assert.equal(categoryOf({ name: 'comando_teste', category: 'util', minLevel: 3 }), 'dono');
  assert.equal(categoryOf({ name: 'comando_teste', category: 'util', minLevel: 1 }), 'adm');
  assert.equal(categoryOf({ name: 'ban', category: 'mod', minLevel: 1 }), 'adm');
  assert.equal(categoryOf({ name: 'estrategia', category: 'lobo', minLevel: 0 }), 'alcateia');
});

test('comandos com categorias reconhecidas não caem em utilidades por engano', () => {
  const commands = [
    { name: 'pergunta', category: 'ia', minLevel: 0, aliases: [] },
    { name: 'conquistas', category: 'conquistas', minLevel: 0, aliases: [] },
    { name: 'musica', category: 'pesquisa', minLevel: 0, aliases: [] },
    { name: 'carreira', category: 'trabalho', minLevel: 0, aliases: [] },
  ];
  const catalog = buildCatalog(commands);
  assert.deepEqual(catalog.map(item => item.category), ['ia', 'conquistas', 'pesquisa', 'trabalho']);
});
