'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SHOP_ITEMS, CATEGORIES, getShopItem, shopPage } = require('../src/economy/shop-catalog');

test('novos itens de batalha estão na loja (IDs 19–22)', () => {
  for (const id of [19, 20, 21, 22]) {
    const item = getShopItem(id);
    assert.ok(item, `item ${id} não encontrado`);
    assert.equal(item.category, 'batalha', `item ${id} deve ser categoria batalha`);
    assert.ok(item.price > 0, `item ${id} deve ter preço positivo`);
  }
});

test('soro dos lobos é heal-partial com amount 15', () => {
  const item = getShopItem(19);
  assert.equal(item.type, 'heal-partial');
  assert.equal(item.amount, 15);
});

test('cristal do poder é effect/battle_power com multiplier 1.25', () => {
  const item = getShopItem(20);
  assert.equal(item.type, 'effect');
  assert.equal(item.effect, 'battle_power');
  assert.equal(item.multiplier, 1.25);
  assert.ok(item.duration > 0);
  assert.ok(item.effectLabel, 'deve ter effectLabel');
});

test('escudo da batalha é effect/battle_armor com multiplier 0.7', () => {
  const item = getShopItem(21);
  assert.equal(item.type, 'effect');
  assert.equal(item.effect, 'battle_armor');
  assert.equal(item.multiplier, 0.7);
  assert.ok(item.duration > 0);
});

test('totem da ressurreição é effect/battle_totem com duração de 30 dias', () => {
  const item = getShopItem(22);
  assert.equal(item.type, 'effect');
  assert.equal(item.effect, 'battle_totem');
  const thirtyDays = 30 * 24 * 3600 * 1000;
  assert.equal(item.duration, thirtyDays);
});

test('título guerreiro lunar existe e é do tipo title', () => {
  const item = getShopItem(23);
  assert.ok(item, 'item 23 não encontrado');
  assert.equal(item.type, 'title');
  assert.equal(item.titleId, 'guerreiro-lunar');
});

test('categoria batalha está registrada em CATEGORIES', () => {
  assert.ok(Object.hasOwn(CATEGORIES, 'batalha'), 'categoria batalha não registrada');
});

test('shopPage com categoria batalha retorna apenas itens de batalha', () => {
  const page = shopPage(['batalha']);
  assert.ok(page.items.length > 0, 'nenhum item na categoria batalha');
  for (const item of page.items) {
    assert.equal(item.category, 'batalha');
  }
});

test('todos os itens têm id único, nome e descrição', () => {
  const ids = new Set();
  for (const item of SHOP_ITEMS) {
    assert.ok(!ids.has(item.id), `id duplicado: ${item.id}`);
    ids.add(item.id);
    assert.ok(typeof item.name === 'string' && item.name.length > 0, `item ${item.id} sem nome`);
    assert.ok(typeof item.description === 'string' && item.description.length > 0, `item ${item.id} sem descrição`);
  }
});

test('shopPage sem argumento retorna todos os itens com paginação', () => {
  const page = shopPage([]);
  assert.ok(page.total >= 23, `esperado ≥23 itens, encontrado ${page.total}`);
  assert.ok(page.pages >= 1);
  assert.equal(page.category, 'todos');
});
