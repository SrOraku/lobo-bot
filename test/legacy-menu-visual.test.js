'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BOT_NAME = '🌹 Lobo da Matilha 🐺';
const BOT_DESCRIPTION = '🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺';
const PREFIX = '!!';
const source = fs.readFileSync(path.join(__dirname, '../src/commands/menu.js'), 'utf8');

function fixture() {
  const loaded = { exports: {} };
  vm.runInNewContext(source, {
    module: loaded,
    exports: loaded.exports,
    require(id) {
      assert.equal(id, '../utils/helpers', 'o menu deve depender apenas dos dados de apresentação');
      return { BOT_NAME, BOT_DESCRIPTION, PREFIX };
    },
  }, { filename: 'src/commands/menu.js' });
  const sent = [];
  return {
    async render(args = []) {
      sent.length = 0;
      const msg = { key: { id: 'menu-visual-fixture' } };
      const jid = 'visual-fixture@g.us';
      const sock = {
        async sendMessage(target, content, options) {
          sent.push({ target, content, options });
        },
      };
      await loaded.exports.menu(sock, { jid, msg, args });
      assert.equal(sent.length, 1, 'cada menu continua sendo enviado em uma única mensagem');
      assert.equal(sent[0].target, jid);
      assert.equal(sent[0].options.quoted, msg);
      return sent[0].content.text;
    },
  };
}

const cases = [
  {
    name: 'principal', args: [],
    categories: ['MECÂNICAS 100 LOBISOMENS', 'PROTEÇÃO DA MATILHA', 'DIVERSÃO & INTERAÇÃO', 'MÍDIA & DOWNLOADS', 'FIGURINHAS MÍSTICAS', 'ESTATÍSTICAS & GOLD', 'Comandos Principais da Matilha:'],
    commands: ['mudar estrategia ataque:X defesa:Y contra:Z', 'atacar @numero', 'menu gold', 'menu mod', 'menu midia', 'menu diversao', 'mudar estrategia ataque:X defesa:Y contra:Z', 'atacar @membro', 'gold', 'level', 'play', 'tiktok', 'sticker', 'ban', 'atualizar status', 'atualizar bot', 'atualizar baileys'],
    details: ['Cada membro possui exatamente *100 Lobisomens*', 'Ataque • Defesa • Contra-ataque', 'Anti Link • Anti Fake • Anti Contato • Anti Marcação • Anti Inatividade', 'Mensagens programadas'],
  },
  {
    name: 'gold', args: ['gold'],
    categories: ['MENU GOLD & LOBISOMENS', '100 LOBISOMENS', 'SISTEMA GOLD', 'LEVEL & PERFIL'],
    commands: ['mudar estrategia ataque:X defesa:Y contra:Z', 'atacar @usuário', 'lobos', 'estrategia [@usuário]', 'curarlobos', 'ranklobos', 'infolobos', 'gold', 'daily', 'enviargold @user valor', 'loja', 'comprar [ID]', 'rankgold', 'premiun', 'level [@usuário]', 'perfil [@usuário]', 'ranking', 'stats'],
    details: ['Distribuir seus 100 lobos (soma = 100)', 'Recompensa diária (200~500💰)', 'Ficha completa'],
  },
  {
    name: 'moderação', args: ['mod'],
    categories: ['PROTEÇÃO DA MATILHA', 'GESTÃO DE MEMBROS', 'CONTROLE DO GRUPO', 'PROTEÇÕES ATIVAS'],
    commands: ['ban @usuário', 'unban @usuário', 'mute @usuário', 'unmute @usuário', 'kick @usuário', 'add [número]', 'promover @usuário', 'rebaixar @usuário', 'marcartodos [msg]', 'abrirgrupo', 'fechargrupo', 'antilink [delete|warn|kick]', 'antifake', 'anticontato', 'antimarcacao', 'antiinatividade [dias]', 'limparinatividade', 'stats'],
    details: ['Banir do bot', 'Remover do grupo', 'Anti-compartilhar contato', 'Requer admin do grupo'],
  },
  {
    name: 'mídia', args: ['midia'],
    categories: ['MÍDIA & DOWNLOADS', 'YOUTUBE', 'OUTRAS PLATAFORMAS', 'FIGURINHAS MÍSTICAS'],
    commands: ['play [nome/url]', 'ytmp3 [nome/url]', 'ytmp4 [nome/url]', 'tiktok [url]', 'ig [url]', 'spotify [nome]', 'sticker', 's', 'stickeranim', 'sanim', 'toimg'],
    details: ['Baixar áudio MP3 (max 10min)', 'Baixar vídeo MP4 (max 5min)', "TikTok sem marca d'água", 'Converter sticker → imagem'],
  },
  {
    name: 'diversão', args: ['diversao'],
    categories: ['DIVERSÃO & INTERAÇÃO', 'JOGOS DA MATILHA', 'ENTRETENIMENTO', 'BOT INFO'],
    commands: ['dado [faces]', 'moeda', '8ball [pergunta]', 'sorteio [min] [max]', 'azar', 'escolher [op1, op2, op3]', 'ship @p1 @p2', 'akinator', 'piada', 'fato', 'ping', 'uptime', 'stats'],
    details: ['Akinator dos lobos!', 'Compatibilidade amorosa', 'Curiosidade sobre lobos', 'Latência do bot'],
  },
];

for (const menuCase of cases) {
  test(`menu ${menuCase.name} recebe moldura de rosa e lobo sem perder comandos ou conteúdo`, async () => {
    const text = await fixture().render(menuCase.args);
    assert.equal(text, text.trim(), 'não deve haver espaços ou quebras de linha externos');
    assert.ok(text.startsWith('🌹'));
    assert.ok(text.endsWith('🐺'));
    assert.ok(text.includes(BOT_NAME));
    assert.ok(text.includes(BOT_DESCRIPTION));
    assert.match(text, /╔.*❖.*♆/u);
    assert.match(text, /╚.*🌹/u);
    for (const category of menuCase.categories) assert.ok(text.includes(category), category);
    for (const detail of menuCase.details) assert.ok(text.includes(detail), detail);
    const commands = [...text.matchAll(/\*!!([^*]+)\*/g)].map(match => match[1]);
    assert.deepEqual(commands, menuCase.commands, 'o prefixo customizado e cada comando devem continuar utilizáveis');
    assert.ok(!text.includes('${PREFIX}'));
    assert.ok(text.includes('🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺'));
    assert.ok(text.includes('+5543920030769'));
    assert.ok(text.length < 4_500, 'a moldura não deve transformar o menu em várias mensagens de decoração');
  });
}

test('os aliases de categorias e o fallback do menu principal conservam as mesmas rotas', async () => {
  const f = fixture();
  for (const aliases of [['gold', 'lobos', 'lobo', 'GOLD'], ['mod', 'moderacao'], ['midia', 'media'], ['diversao', 'fun']]) {
    const expected = await f.render([aliases[0]]);
    for (const alias of aliases.slice(1)) assert.equal(await f.render([alias]), expected, alias);
  }
  assert.equal(await f.render(['categoria-desconhecida']), await f.render());
});
