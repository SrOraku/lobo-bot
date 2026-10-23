import test from 'node:test';
import assert from 'node:assert/strict';
import { isRPCommand, rpMenu, handleRPResponse } from '../src/rp/commands.js';
import { DEV_SIGNATURE } from '../src/game/constants.js';

const NOW = Date.UTC(2026, 9, 20, 15, 0, 0);
const OWNER = '5543920030769@s.whatsapp.net';
const TARGET = '5511999999999@s.whatsapp.net';

function player(overrides = {}) {
  return { name: 'Lobo Alfa', jid: OWNER, number: '5543920030769', coins: 9_000, hp: 25,
    wolves: 20, attack: 10, defense: 8, counter: 2, ...overrides };
}

function rp(overrides = {}) {
  return { jobId: 'motorista', experience: 42, lastWork: null, lastAction: null,
    energy: 80, hunger: 70, health: 88, wanted: 2, jailedUntil: NOW + 600_000,
    reputation: 7, inventory: {}, home: null, vehicle: null, relationship: null,
    familyId: null, createdAt: NOW - 86_400_000, updatedAt: NOW, ...overrides };
}

function fixture(prefix = '!') {
  const replies = [];
  const ctx = { config: { prefix }, sender: OWNER, senderPhone: OWNER,
    async reply(text, extra = {}) { replies.push({ text, extra }); },
    sock: { async sendMessage() { throw new Error('O renderer não deve enviar mensagens diretas.'); } },
  };
  return { ctx, replies, text: () => replies.map(entry => entry.text).join('\n') };
}

async function render(result, prefix = '!') {
  const f = fixture(prefix);
  const before = structuredClone(result);
  assert.equal(await handleRPResponse(f.ctx, result, NOW), true);
  assert.deepEqual(result, before, 'o renderer deve preservar os dados recebidos');
  if (['rp-menu', 'rp-jobs', 'rp-shop'].includes(result.type)) {
    assert.ok(f.text().startsWith('🌹'));
    assert.ok(f.text().endsWith('🐺'));
    assert.match(f.text(), /🌹╔═/);
  } else assert.match(f.text(), /🌹═══\[/);
  assert.ok(!f.text().includes(DEV_SIGNATURE));
  assert.match(f.text(), /WOK Coin/);
  return f;
}

test('RP routing recognizes only its namespace and leaves existing game and group commands intact', () => {
  for (const command of ['rp', 'profissoes', 'profissao', 'trabalhar', 'acao', 'carteira', 'transferir', 'rploja', 'rpcomprar', 'usar', 'inventario', 'familia']) {
    assert.equal(isRPCommand(command, []), true, command);
  }
  for (const command of ['perfil', 'start', 'loja', 'comprar', 'ban', 'recusar', 'admin', 'menu', 'comandoinexistente']) {
    assert.equal(isRPCommand(command, []), false, command);
  }
});

test('RP menu follows the configured prefix and remains available in text', async () => {
  const text = rpMenu({ prefix: '!!' });
  for (const command of ['rp', 'profissoes', 'profissao', 'trabalhar', 'acao', 'carteira', 'transferir', 'rploja', 'rpcomprar', 'usar', 'inventario', 'familia']) {
    assert.ok(text.includes(`!!${command}`), command);
  }
  assert.ok(!text.includes(DEV_SIGNATURE));
  const f = await render({ type: 'rp-menu' }, '!!');
  assert.equal(f.text(), text);
});

test('RP registration displays the shared WOK Coin wallet without granting another reward', async () => {
  const p = player();
  const f = await render({ type: 'rp-registered', player: p, rp: rp() });
  assert.match(f.text(), /WOK Coin/);
  assert.match(f.text(), /9[.\s,]?000/);
  assert.equal(p.coins, 9_000);
  assert.equal(p.hp, 25);
});

test('RP profile separates roleplay health from wolf HP and includes social and progression data', async () => {
  const f = await render({ type: 'rp-profile', player: player(), rp: rp({
    home: { id: 'casa1', name: 'Casa da Lua' }, vehicle: { id: 'moto1', name: 'Moto Lunar' },
    relationship: { type: 'casado', jid: TARGET, name: 'Lua' }, familyId: 'familia-lua',
  }), job: { id: 'motorista', name: 'Motorista de app', category: 'legal' },
  family: { name: 'Família Lua Rosa', leader: OWNER, members: [{ jid: OWNER, role: 'lider' }], coins: 700 } });
  const text = f.text();
  for (const label of ['Lobo Alfa', 'Motorista de app', '42', '80', '70', '88', '25', '2', 'Família Lua Rosa', 'Casa da Lua', 'Moto Lunar']) assert.ok(text.includes(label), label);
  assert.match(text, /energia/i);
  assert.match(text, /fome|saciedade/i);
  assert.match(text, /saúde|saude/i);
  assert.match(text, /HP/i);
  assert.match(text, /pris|pres|cadeia/i);
  assert.match(text, /casad|cônjuge|conjuge|relacionamento/i);
  assert.match(text, /WOK Coin/);
});

test('professions pages show stable ids, descriptions and categories with at most ten jobs', async () => {
  const jobs = Array.from({ length: 12 }, (_, index) => ({
    id: `job-${index + 1}`, name: `Profissão ${String(index + 1).padStart(2, '0')}`,
    category: index % 2 ? 'illegal' : 'legal', description: `Descrição do trabalho ${index + 1}`,
    salary: 100 + index, cooldown: 60_000,
  }));
  const f = await render({ type: 'rp-jobs', jobs, page: 1, totalPages: 2 });
  assert.match(f.text(), /job-1/);
  assert.match(f.text(), /Profissão 01/);
  assert.match(f.text(), /Profissão 10/);
  assert.doesNotMatch(f.text(), /Profissão 11|Profissão 12/);
  assert.match(f.text(), /legal/i);
  assert.match(f.text(), /Descrição do trabalho/);
  assert.match(f.text(), /1\s*\/\s*2/);
});

test('selecting a profession shows the confirmed job and unchanged shared balance', async () => {
  const f = await render({ type: 'rp-job', player: player(), job: {
    id: 'medico', name: 'Médico', category: 'legal', description: 'Atende cidadãos.', salary: 200,
  } });
  assert.match(f.text(), /Médico/);
  assert.match(f.text(), /WOK Coin/);
});

test('work rewards, fines and imprisonment are reported without hiding the result', async () => {
  const f = await render({ type: 'rp-work', player: player({ coins: 8_700 }),
    job: { id: 'ladrao', name: 'Ladrão', category: 'illegal' },
    reward: { amount: -300, xp: 7, description: 'A polícia interrompeu a ação.', illegal: true,
      fine: 300, jailedUntil: NOW + 600_000 } });
  assert.match(f.text(), /Ladrão/);
  assert.match(f.text(), /300/);
  assert.match(f.text(), /7/);
  assert.match(f.text(), /polícia/);
  assert.match(f.text(), /multa/i);
  assert.match(f.text(), /pris|pres|cadeia/i);
  assert.match(f.text(), /WOK Coin/);
});

test('job action result text and money delta use the WOK Coin denomination', async () => {
  const f = await render({ type: 'rp-action', player: player(), job: { name: 'Detetive' },
    result: { message: 'Você resolveu o caso da lua.', amount: 120 } });
  assert.match(f.text(), /resolveu o caso da lua/);
  assert.match(f.text(), /120/);
  assert.match(f.text(), /WOK Coin/);
});

test('wallet and transfers display shared amounts without interpreting LID digits as telephone numbers', async () => {
  const wallet = await render({ type: 'rp-wallet', player: player({ jid: '700000@lid', number: null }) });
  assert.match(wallet.text(), /WOK Coin/);
  assert.match(wallet.text(), /9[.\s,]?000/);
  assert.doesNotMatch(wallet.text(), /\+700000/);
  const transfer = await render({ type: 'rp-transfer', player: player({ coins: 8_500 }),
    target: player({ name: 'Lobo Lua', number: null, jid: '700000@lid' }), amount: 500 });
  assert.match(transfer.text(), /500/);
  assert.match(transfer.text(), /WOK Coin/);
  assert.doesNotMatch(transfer.text(), /\+700000/);
});

test('RP shop pages display prices and item descriptions while bounding the visible catalogue', async () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: `item-${index + 1}`,
    name: `Item ${String(index + 1).padStart(2, '0')}`, price: 100 + index,
    description: `Descrição do item ${index + 1}`, type: 'consumable' }));
  const f = await render({ type: 'rp-shop', items, page: 2, totalPages: 4 });
  assert.match(f.text(), /item-1/);
  assert.match(f.text(), /Item 10/);
  assert.doesNotMatch(f.text(), /Item 11|Item 12/);
  assert.match(f.text(), /Descrição do item/);
  assert.match(f.text(), /WOK Coin/);
  assert.match(f.text(), /2\s*\/\s*4/);
});

test('purchase, item use and inventory render the service result without applying effects again', async () => {
  const item = { id: 'pao', name: 'Pão Lunar', price: 30, description: 'Recupera fome.', type: 'food' };
  const purchase = await render({ type: 'rp-purchase', player: player({ coins: 8_940 }),
    result: { item, quantity: 2, totalCost: 60 } });
  assert.match(purchase.text(), /Pão Lunar/);
  assert.match(purchase.text(), /2/);
  assert.match(purchase.text(), /60/);
  assert.match(purchase.text(), /WOK Coin/);
  const used = await render({ type: 'rp-use', player: player(), result: { item, message: 'Fome recuperada em 20.' } });
  assert.match(used.text(), /Fome recuperada em 20/);
  const inventory = await render({ type: 'rp-inventory', player: player(), rp: rp({ inventory: { pao: 2, agua: 1 } }) });
  assert.match(inventory.text(), /pao/i);
  assert.match(inventory.text(), /2/);
  assert.match(inventory.text(), /agua/i);
});

test('family profile is compact, shows member roles and does not enumerate beyond ten members', async () => {
  const members = Array.from({ length: 12 }, (_, index) => ({
    jid: `55119${90_000_000 + index}@s.whatsapp.net`, role: index ? 'membro' : 'lider',
  }));
  const f = await render({ type: 'rp-family', family: {
    name: 'Família Rosa', leader: members[0].jid, members, coins: 1_234,
  } });
  assert.match(f.text(), /Família Rosa/);
  assert.match(f.text(), /12/);
  assert.match(f.text(), /lider|líder/i);
  assert.match(f.text(), /membro/i);
  assert.match(f.text(), /WOK Coin/);
  assert.doesNotMatch(f.text(), new RegExp(members[11].jid.split('@')[0]));
});

test('family invitations identify their id, expiry and text acceptance commands with the configured prefix', async () => {
  const f = await render({ type: 'rp-invite', player: player(), target: player({ name: 'Lua', jid: TARGET, number: '5511999999999' }),
    invite: { id: 'convite-lua-123', type: 'family', from: OWNER, to: TARGET, relation: 'filho', expiresAt: NOW + 120_000 } }, '!!');
  assert.match(f.text(), /convite-lua-123/);
  assert.match(f.text(), /!!familia aceitar/);
  assert.match(f.text(), /!!familia recusar/);
  assert.match(f.text(), /expira|validade|2min|120s/i);
});

test('family answers, leaving and bank operations report the confirmed outcome', async () => {
  const family = { name: 'Rosas', leader: OWNER, members: [{ jid: OWNER, role: 'lider' }], coins: 400 };
  const accepted = await render({ type: 'rp-family-response', accepted: true, family });
  assert.match(accepted.text(), /aceit|entrou|família/i);
  const refused = await render({ type: 'rp-family-response', accepted: false });
  assert.match(refused.text(), /recus|rejeit/i);
  const left = await render({ type: 'rp-family-left', family });
  assert.match(left.text(), /sai|deix|família/i);
  const bank = await render({ type: 'rp-family-bank', player: player(), family, action: 'depositar', amount: 100 });
  assert.match(bank.text(), /100/);
  assert.match(bank.text(), /400/);
  assert.match(bank.text(), /WOK Coin/);
});

test('unrelated and unknown response types are not consumed and never send anything', async () => {
  for (const result of [{ type: 'profile' }, { type: 'rp-unknown' }, { type: 123 }, null, {}]) {
    const f = fixture();
    assert.equal(await handleRPResponse(f.ctx, result, NOW), false);
    assert.deepEqual(f.replies, []);
  }
});

test('actual RP domain fields render cooldowns, coin changes, item effects and spouse identities', async () => {
  const job = { id: 'medico', name: 'Médico', category: 'Saúde', salary: 90, cooldownMs: 3_600_000,
    experienceRequired: 100, roleActionName: 'tratar', description: 'Atendimento de personagem.' };
  const catalogue = await render({ type: 'rp-jobs', jobs: [job], page: 1, totalPages: 1 });
  assert.match(catalogue.text(), /1h/);
  assert.match(catalogue.text(), /XP mínimo: 100/);
  const work = await render({ type: 'rp-work', player: player(), job,
    reward: { salary: 0, coinChange: -20, experienceGain: 10, event: 'fine', jailedUntil: NOW + 600_000 } });
  assert.match(work.text(), /-20 WOK Coin/);
  assert.match(work.text(), /XP: \+10/);
  assert.match(work.text(), /multa/);
  const action = await render({ type: 'rp-action', player: player(), job,
    result: { message: 'Tratamento concluído.', coinChange: -20, experienceGain: 5, healthGain: 7 } });
  assert.match(action.text(), /-20 WOK Coin/);
  assert.match(action.text(), /recuperada: \+7/);
  const item = { id: 'remedio', name: 'Remédio de RP', type: 'medicine', price: 30, effects: { health: 25 } };
  const shop = await render({ type: 'rp-shop', items: [item], page: 1, totalPages: 1 });
  assert.match(shop.text(), /\+25 saúde RP/);
  const used = await render({ type: 'rp-use', player: player(), result: { item, effects: { health: 3 }, remaining: 2 } });
  assert.match(used.text(), /\+3 saúde RP/);
  assert.match(used.text(), /Restam: 2/);
  const profile = await render({ type: 'rp-profile', player: player(), rp: rp({ relationship: { spouse: TARGET, since: NOW } }) });
  assert.match(profile.text(), /Cônjuge:.*9999/);
  assert.doesNotMatch(profile.text(), /5511999999999|@s\.whatsapp\.net/);
  const marriage = await render({ type: 'rp-invite', player: player(), target: player({ name: 'Lua' }),
    invite: { id: 'casamento-123', kind: 'marriage', from: OWNER, to: TARGET, relation: 'conjuge', expiresAt: NOW + 600_000 } });
  assert.match(marriage.text(), /PEDIDO DE CASAMENTO RP/);
});
