'use strict';

const { frameMenu, frameNotice } = require('../menus/render');
const { mono, command, progress } = require('../ui/text');
const { createLineage, DEN_LIMIT } = require('../lineage/service');
const { HOUR, DAY } = require('../lineage/genetics');

const percent = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value * 100) + '%';
const mentioned = ctx => ctx.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
const at = jid => '@' + String(jid).split('@')[0];
const badge = wolf => `${wolf.traits.coat.emoji} *${wolf.name}*`;
function age(ms) {
  const days = Math.floor(ms / DAY), hours = Math.floor((ms % DAY) / HOUR), minutes = Math.max(1, Math.ceil((ms % HOUR) / 60_000));
  return days ? `${days}d${hours ? ' ' + hours + 'h' : ''}` : hours ? `${hours}h` : `${minutes}min`;
}
const distribution = items => items.map(item => `${item.emoji ? item.emoji + ' ' : ''}${item.name} ${mono(percent(item.p))}`).join(' • ');

function profile(wolf) {
  const traits = wolf.traits, state = wolf.condition, life = state.stage;
  return [
    `${badge(wolf)} • 🧬 Geração ${mono(wolf.generation)}`,
    `${life.emoji} *${life.name}* • 🕰️ ${mono(age(life.age))}${life.next ? ` — _${life.next.name.toLowerCase()} em_ ${mono(age(life.nextIn))}` : ''}`,
    `${traits.coat.emoji} *Pelagem:* ${traits.coat.name} • ${traits.eyes.emoji} *Olhos:* ${traits.eyes.name}\n📏 *Porte:* ${traits.size.name} • 💫 *Alma:* ${traits.soul.name}`,
    ...(traits.mark ? [`✨ *Traço raro:* ${traits.mark.emoji} ${traits.mark.name}`] : []),
    `🍖 *Fome* ${progress(state.hunger, 100, 8)} ${mono(state.hunger + '%')}\n🎾 *Alegria* ${progress(state.joy, 100, 8)} ${mono(state.joy + '%')}\n💞 *Vínculo* ${progress(state.bond, 100, 8)} ${mono(state.bond + '/100')} — ${state.mood}`,
    `🎯 *Talento:* ${traits.talent.label} +${Math.round(traits.talent.bonus * 100)}% na Floresta Viva — ${state.talentActive ? '✅ ativo' : '⏸️ ' + state.talentBlocked}`,
  ];
}

function createLineageHandlers({ api, service, prefix = () => require('../config').get('PREFIX') } = {}) {
  const lineage = () => service || createLineage(api || require('../utils/database'));
  const send = (sock, ctx, text, mentions) => sock.sendMessage(ctx.jid, mentions?.length ? { text, mentions } : { text }, { quoted: ctx.msg });
  async function safe(sock, ctx, title, run) {
    try { return await run(); }
    catch (error) {
      const known = /^LINEAGE_/.test(error.code || '');
      const wait = known && error.remaining ? [`⏳ Tente de novo em ${mono(age(error.remaining))}.`] : [];
      return send(sock, ctx, frameNotice(title, [known ? error.message : 'A toca não respondeu agora. Nada foi alterado.', ...wait]));
    }
  }
  const p = () => prefix();

  const adopt = (sock, ctx) => safe(sock, ctx, '🐾 ADOÇÃO', async () => {
    const wolf = lineage().adopt(ctx.jid, ctx.sender, (ctx.args || []).join(' '), ctx.msg?.key?.id);
    return send(sock, ctx, frameMenu('🐾 FILHOTE ADOTADO', [
      '🌲 _Entre as raízes da floresta, um filhote te farejou e decidiu ficar._',
      ...profile(wolf),
      ...(wolf.traits.mark ? ['✨ _Raridade! Poucos lobos selvagens nascem com esse traço._'] : []),
      `> 🧬 _Ele carrega um DNA único, herdado de lobos selvagens._\n> ⚡ ${command(p() + 'alimentar')} • ${command(p() + 'brincar')} • ${command(p() + 'genes')}`,
    ]));
  });

  const companion = (sock, ctx) => safe(sock, ctx, '🐺 COMPANHEIRO', async () => {
    const wolf = lineage().companion(ctx.jid, ctx.sender, ctx.args?.[0]);
    const [a, b] = wolf.parents;
    return send(sock, ctx, frameMenu('🐺 ' + wolf.name.toUpperCase(), [
      ...profile(wolf),
      a || b ? `👪 *Pais:* ${a ? badge(a) : '_?_'} × ${b ? badge(b) : '_?_'}` : '🌲 _Nascido na floresta selvagem._',
      ...(wolf.children ? [`🍼 *Filhotes:* ${mono(wolf.children)}`] : []),
      `> ⚡ ${command(p() + 'alimentar')} • ${command(p() + 'brincar')} • ${command(p() + 'toca')} • ${command(p() + 'linhagem')}`,
    ]));
  });

  const den = (sock, ctx) => safe(sock, ctx, '🏕️ TOCA', async () => {
    const [action, index, ...rest] = ctx.args || [];
    const verb = String(action || '').toLowerCase();
    if (verb === 'usar') {
      const wolf = lineage().use(ctx.jid, ctx.sender, index);
      return send(sock, ctx, frameMenu('⭐ NOVO COMPANHEIRO', [`${badge(wolf)} agora caminha ao seu lado.`, `🎯 _Talento: ${wolf.traits.talent.label} +${Math.round(wolf.traits.talent.bonus * 100)}% na Floresta Viva._`]));
    }
    if (verb === 'nome') {
      const result = lineage().rename(ctx.jid, ctx.sender, index, rest.join(' '));
      return send(sock, ctx, frameMenu('✏️ NOVO NOME', [`*${result.previous}* agora atende por ${badge(result.wolf)}.`]));
    }
    if (verb === 'soltar') {
      const result = lineage().release(ctx.jid, ctx.sender, index, ctx.msg?.key?.id);
      return send(sock, ctx, frameMenu('🌲 DE VOLTA À FLORESTA', [
        `${badge(result.wolf)} _correu entre as árvores e uivou uma última vez para você._`,
        ...(result.joinedForest ? ['🐺 _Os lobos selvagens da Floresta Viva ganharam força._'] : []),
        ...(result.promoted ? [`⭐ ${badge(result.promoted)} assume como companheiro.`] : []),
        '> 📜 _A linhagem dele continua registrada para sempre._',
      ]));
    }
    if (action) throw Object.assign(Error(`Use ${p()}toca, ${p()}toca usar N, ${p()}toca nome N Nome ou ${p()}toca soltar N.`), { code: 'LINEAGE_USAGE' });
    const view = lineage().listDen(ctx.jid, ctx.sender);
    return send(sock, ctx, frameMenu('🏕️ SUA TOCA', [
      view.wolves.length ? view.wolves.map((wolf, index) => `${mono(index + 1 + '.')} ${wolf.active ? '⭐ ' : ''}${badge(wolf)} • ${wolf.condition.stage.name} • 💞 ${mono(wolf.condition.bond)}`).join('\n') : `_Sua toca está vazia._ ${command(p() + 'adotar')}`,
      `🏠 *Vagas:* ${mono(view.wolves.length + '/' + DEN_LIMIT)} • ⭐ = companheiro`,
      `> ⚡ ${command(p() + 'toca usar N')} • ${command(p() + 'toca nome N Nome')} • ${command(p() + 'toca soltar N')}`,
    ]));
  });

  const care = kind => (sock, ctx) => safe(sock, ctx, kind === 'alimentar' ? '🍖 ALIMENTAR' : '🎾 BRINCAR', async () => {
    const result = lineage().care(ctx.jid, ctx.sender, kind, ctx.msg?.key?.id);
    const wolf = result.wolf;
    return send(sock, ctx, frameMenu(kind === 'alimentar' ? '🍖 BANQUETE NA TOCA' : '🎾 HORA DE BRINCAR', [
      kind === 'alimentar' ? `${badge(wolf)} _devorou a refeição e lambeu o focinho._` : `${badge(wolf)} _correu atrás do galho até cair de cansaço._`,
      `💞 *Vínculo:* ${mono(result.before.bond)} → ${mono(wolf.condition.bond)} ${mono('+' + result.gain)}${wolf.traits.soul.id === 'leal' ? ' _(alma leal: +50%)_' : ''}\n⭐ +${mono(result.xp)} XP`,
      `🍖 ${mono(wolf.condition.hunger + '%')} • 🎾 ${mono(wolf.condition.joy + '%')} • ${wolf.condition.mood}`,
      `> ⏳ Próximo ${kind === 'alimentar' ? 'banquete' : 'passeio'} em ${mono(kind === 'alimentar' ? '3h' : '2h')} • ${command(p() + 'companheiro')}`,
    ]));
  });

  const breed = (sock, ctx) => safe(sock, ctx, '💞 CRUZAMENTO', async () => {
    const answer = String(ctx.args?.[0] || '').toLowerCase();
    if (answer === 'aceitar' || answer === 'recusar') {
      const result = lineage().respond(ctx.jid, ctx.sender, answer === 'aceitar', ctx.msg?.key?.id);
      if (!result.accepted) return send(sock, ctx, frameMenu('💔 PEDIDO RECUSADO', [`${at(result.from)}, _o cruzamento foi recusado com respeito._`]), [result.from]);
      const [father, mother] = result.parents;
      const owners = [result.from, ctx.sender];
      return send(sock, ctx, frameMenu('🍼 NASCERAM FILHOTES!', [
        `${badge(father)} × ${badge(mother)}`,
        result.cubs.map((cub, index) => `↳ ${badge(cub)} — ${cub.traits.coat.name}, olhos ${cub.traits.eyes.name.toLowerCase()}, porte ${cub.traits.size.name.toLowerCase()} • para ${at(owners[index])}${cub.traits.mark ? `\n   ✨ *MUTAÇÃO RARA:* ${cub.traits.mark.emoji} ${cub.traits.mark.name}!` : ''}`).join('\n'),
        `🧬 _Geração ${result.cubs[0].generation}: cada filhote herdou um gene de cada pai, sorteado como na natureza._`,
        `> 🏕️ ${command(p() + 'toca')} • ${command(p() + 'genes')} • ${command(p() + 'linhagem')}`,
      ]), owners);
    }
    const target = mentioned(ctx);
    if (!target) throw Object.assign(Error(`Use ${p()}cruzar @pessoa, ${p()}cruzar aceitar ou ${p()}cruzar recusar.`), { code: 'LINEAGE_USAGE' });
    const result = lineage().propose(ctx.jid, ctx.sender, target, ctx.msg?.key?.id);
    return send(sock, ctx, frameMenu('💞 PEDIDO DE CRUZAMENTO', [
      `${badge(result.mine)} × ${badge(result.theirs)}`,
      `🎨 *Pelagem possível:* ${distribution(result.prediction.coat)}`,
      `${at(target)}, aceite com ${command(p() + 'cruzar aceitar')} ou recuse com ${command(p() + 'cruzar recusar')}.`,
      `> ⏳ _O pedido vale 10 minutos. Cada dono recebe um filhote._`,
    ]), [target]);
  });

  const dna = (sock, ctx) => safe(sock, ctx, '🧬 GENES', async () => {
    const target = mentioned(ctx);
    if (target) {
      const view = lineage().predictWith(ctx.jid, ctx.sender, target), chance = view.prediction;
      return send(sock, ctx, frameMenu('🧪 PREVISÃO GENÉTICA', [
        `${badge(view.mine)} × ${badge(view.theirs)}`,
        `🎨 *Pelagem:* ${distribution(chance.coat)}\n👁️ *Olhos:* ${distribution(chance.eyes)}\n📏 *Porte:* ${distribution(chance.size)}\n💫 *Alma:* ${distribution(chance.soul)}`,
        `✨ *Traço raro:* ${mono(percent(chance.mark))} de chance`,
        ...(view.kin ? ['⚠️ _São parentes próximos: esse cruzamento não é permitido._'] : []),
        '> 🧮 _Cálculo exato pelo quadrado de Punnett dos dois genomas._',
      ]), [target]);
    }
    const wolf = lineage().genes(ctx.jid, ctx.sender, ctx.args?.[0]), g = wolf.genome, t = wolf.traits;
    const pair = gene => mono(g[gene].join(''));
    return send(sock, ctx, frameMenu('🧬 DNA DE ' + wolf.name.toUpperCase(), [
      `🎨 *Pelagem:* ${pair('K')} + ${pair('A')} → ${t.coat.emoji} ${t.coat.name}\n_O gene K (negro) domina tudo; branco ártico só nasce com kk e aa._`,
      `👁️ *Olhos:* ${pair('D')} → ${t.eyes.emoji} ${t.eyes.name}\n_D (âmbar) domina d (azul)._`,
      `📏 *Porte:* ${pair('G')} → ${t.size.name}\n_Dominância incompleta: GG grande, Gg médio, gg ágil._`,
      `💫 *Alma:* ${pair('L')} → ${t.soul.name}\n_LL leal, Ls equilibrado, ss selvagem._`,
      ...(t.mark ? [`✨ *Traço raro:* ${t.mark.emoji} ${t.mark.name} — _pode passar para os filhotes._`] : []),
      `> 🧪 _Maiúsculas são dominantes; minúsculas só aparecem em dupla._ ${command(p() + 'genes @pessoa')} _prevê filhotes._`,
    ]));
  });

  const family = (sock, ctx) => safe(sock, ctx, '🌳 LINHAGEM', async () => {
    const view = lineage().tree(ctx.jid, ctx.sender, ctx.args?.[0]);
    const couple = parents => parents && (parents[0] || parents[1]) ? parents.map(item => item ? badge(item) : '_?_').join(' × ') : '_selvagens_';
    const lines = [`${badge(view.wolf)} • 🧬 Geração ${mono(view.wolf.generation)}`];
    if (view.parents[0] || view.parents[1]) {
      lines.push(`👪 *Pais:* ${couple(view.parents)}`);
      view.parents.forEach((parent, index) => { if (parent) lines.push(`↳ *Avós por ${parent.name}:* ${couple(view.grandparents[index])}`); });
    } else lines.push('🌲 _Fundador da linhagem: nasceu na floresta selvagem._');
    lines.push(view.children.length ? `🍼 *Filhotes:* ${view.children.map(badge).join(', ')}` : '🍼 _Ainda sem filhotes._');
    lines.push(`> 🌳 _Cada nascimento fica registrado para sempre neste chat._ ${command(p() + 'cruzar @pessoa')}`);
    return send(sock, ctx, frameMenu('🌳 LINHAGEM DE ' + view.wolf.name.toUpperCase(), lines));
  });

  return { adopt, companion, den, care, breed, dna, family };
}

function register(r) {
  const handlers = createLineageHandlers();
  const common = { category: 'linhagem', concurrency: 'chat', cooldown: 2, rateLimit: { max: 10, window: 60000 } };
  for (const [name, aliases, handler, description, usage] of [
    ['adotar', ['adocao', 'adoção'], handlers.adopt, 'Adotar um filhote selvagem com DNA único', '[nome]'],
    ['companheiro', ['meulobo', 'filhote'], handlers.companion, 'Perfil, fome, vínculo e talento do seu lobo', '[N]'],
    ['toca', ['covil'], handlers.den, 'Seus lobos: escolher, renomear ou soltar', '[usar N|nome N Nome|soltar N]'],
    ['alimentar', ['comida'], handlers.care('alimentar'), 'Alimentar o companheiro e fortalecer o vínculo', ''],
    ['brincar', ['brincadeira'], handlers.care('brincar'), 'Brincar com o companheiro e deixá-lo feliz', ''],
    ['cruzar', ['cruzamento'], handlers.breed, 'Cruzar lobos com outra pessoa; cada um ganha um filhote', '@pessoa | aceitar | recusar'],
    ['genes', ['dna', 'genetica', 'genética'], handlers.dna, 'Ver o DNA do lobo ou prever filhotes com @pessoa', '[N|@pessoa]'],
    ['linhagem', ['arvore', 'árvore', 'genealogia'], handlers.family, 'Árvore genealógica com pais, avós e filhotes', '[N]'],
  ]) r({ ...common, name, aliases, handler, description, usage: '!' + name + (usage ? ' ' + usage : '') });
}

module.exports = { createLineageHandlers, register, age };
