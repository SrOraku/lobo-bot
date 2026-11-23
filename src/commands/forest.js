'use strict';

const { frameMenu, frameNotice } = require('../menus/render');
const { mono, command, progress } = require('../ui/text');
const { createForest, DAILY_COIN_CAP } = require('../forest/service');
const model = require('../forest/model');

const ACTION_VIEW = Object.freeze({
  cacar: { emoji: '🏹', verb: 'caçar', title: '🏹 CAÇADA NA FLORESTA', next: 'Próxima caçada' },
  plantar: { emoji: '🌱', verb: 'plantar', title: '🌱 PLANTIO DA MATILHA', next: 'Próximo plantio' },
  patrulhar: { emoji: '🛡️', verb: 'patrulhar', title: '🛡️ PATRULHA DA FLORESTA', next: 'Próxima patrulha' },
});
const NEED_VIEW = Object.freeze({ cacar: '🏹 caçar', plantar: '🌱 plantar', patrulhar: '🛡️ patrulhar', descansar: '🌙 deixar as presas descansarem' });
const METERS = Object.freeze([['v', '🌿', 'Vegetação'], ['p', '🦌', 'Presas'], ['w', '🐺', 'Lobos selvagens'], ['h', '🪓', 'Caçadores']]);

const percent = value => Math.round(value * 100) + '%';
function duration(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000)), hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours}h${rest ? ' ' + rest + 'min' : ''}` : `${minutes}min`;
}
function when(at) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(at).replace(',', '');
}
function page(event, p) {
  const actor = event.actor ? `*${event.actor}*` : null;
  const season = model.SEASONS[event.detail];
  switch (event.kind) {
  case 'nascimento': return '🌱 A Floresta Viva despertou neste chat.';
  case 'estacao': return season ? `${season.emoji} ${season.name} chegou à floresta — o ritmo da vida mudou.` : '🍃 A estação mudou.';
  case 'fome': return actor ? `🍂 A caçada de ${actor} levou as presas ao limite — começou a fome.` : '🍂 As presas quase sumiram — a floresta entrou em fome.';
  case 'recuperacao': return actor ? `🌿 Com a ajuda de ${actor}, as presas voltaram às trilhas.` : '🌿 As presas voltaram a correr pelas trilhas — fim da fome.';
  case 'invasao': return '🪓 Caçadores invadiram a floresta! Patrulhas são urgentes.';
  case 'libertacao': return actor ? `🛡️ ${actor} expulsou os últimos caçadores — a floresta respira.` : '🛡️ Os caçadores recuaram.';
  case 'lenda': return `🦌✨ O Cervo Branco surgiu entre as árvores! Use ${command(p + 'avistar')}.`;
  case 'lenda_partiu': return '🌫️ O Cervo Branco partiu sem ser visto.';
  case 'avistamento': return `👁️ ${actor || 'Um lobo'} avistou o Cervo Branco — a lenda foi escrita.`;
  default: return '🍃 Algo mudou na floresta.';
  }
}
const fresh = (events, p) => events.length ? ['📜 *Novas páginas da crônica:*\n' + events.slice(-3).map(event => '↳ ' + page(event, p)).join('\n')] : [];

function createForestHandlers({ api, service, prefix = () => require('../config').get('PREFIX') } = {}) {
  const forest = () => service || createForest(api || require('../utils/database'));
  const send = (sock, ctx, text) => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
  async function safe(sock, ctx, title, run) {
    try { return await run(); }
    catch (error) {
      const p = prefix();
      if (error.code === 'FOREST_COOLDOWN') {
        const view = ACTION_VIEW[error.kind];
        return send(sock, ctx, frameNotice('⏳ PATAS CANSADAS', [`${view.emoji} ${view.next} em ${mono(duration(error.remaining))}.`, `🧭 Enquanto isso: ${command(p + 'floresta')} • ${command(p + 'rastrear')}`]));
      }
      const known = /^FOREST_/.test(error.code || '');
      return send(sock, ctx, frameNotice(title, [known ? error.message : 'A floresta não respondeu agora. Nada foi cobrado nem alterado.']));
    }
  }

  const panel = (sock, ctx) => safe(sock, ctx, '⚠️ FLORESTA VIVA', async () => {
    const p = prefix(), view = forest().snapshot(ctx.jid), s = view.state;
    const sections = [
      `${view.status.emoji} *Saúde:* ${mono(view.health + '/100')} — _${view.status.label}_\n${progress(view.health, 100, 10)}`,
      METERS.map(([key, emoji, label]) => `${emoji} *${label}* ${progress(s[key], 1, 8)} ${mono(percent(s[key]))}`).join('\n'),
      `${view.season.emoji} *Estação:* ${view.season.name} • ${view.moon.emoji} *Lua:* ${view.moon.name}\n💧 *Chuva:* ${mono(view.rain)} gotas _— as conversas do grupo regam a floresta_`,
      `🧭 *A floresta pede:* ${NEED_VIEW[view.need.action]}\n_${view.need.reason}._`,
    ];
    if (view.legend) sections.push(`🦌✨ *O CERVO BRANCO ESTÁ NA FLORESTA!*\n⏳ Some em ${mono(duration(view.legend.until - view.at))} • o primeiro a usar ${command(p + 'avistar')} ganha ${mono(model.SIGHTING_REWARD.coins)} WoK coin`);
    try {
      const own = forest().trails(ctx.jid, ctx.sender);
      sections.push('🐾 *Suas trilhas:* ' + Object.entries(ACTION_VIEW).map(([kind, item]) => `${item.emoji} ${own.remaining[kind] ? '⏳ ' + mono(duration(own.remaining[kind])) : '✅'}`).join(' • ') + `\n🏅 *Seu karma:* ${mono(own.karma)}`);
    } catch { /* Painel coletivo continua visível mesmo sem identidade confirmada. */ }
    sections.push(...fresh(view.events, p));
    sections.push(`> 🌲 _Ecossistema vivo: evolui a cada hora, mesmo sem ninguém jogar._\n> ⚡ ${command(p + 'cacar')} • ${command(p + 'plantar')} • ${command(p + 'patrulhar')} • ${command(p + 'rastrear')}`);
    return send(sock, ctx, frameMenu('🌲 FLORESTA VIVA', sections));
  });

  const action = kind => (sock, ctx) => safe(sock, ctx, ACTION_VIEW[kind].title, async () => {
    const p = prefix(), view = ACTION_VIEW[kind];
    const result = forest().act(ctx.jid, ctx.sender, ctx.pushName, kind, ctx.msg?.key?.id);
    const [key, emoji, label] = METERS.find(([meter]) => meter === { cacar: 'p', plantar: 'v', patrulhar: 'h' }[kind]);
    const sections = [];
    if (result.scarcity) sections.push('🍂 _As presas estão escassas — a caçada quase não rendeu e a floresta sentiu._');
    else sections.push({
      cacar: '🏹 _Você seguiu os rastros e voltou com alimento para a matilha._',
      plantar: '🌱 _Suas mudas firmaram raízes; a floresta agradece._',
      patrulhar: '🛡️ _Você percorreu as trilhas e afastou os caçadores._',
    }[kind]);
    sections.push(`💰 +${mono(result.coins)} WoK coin • ⭐ +${mono(result.xp)} XP • 🏅 Karma ${mono((result.karma > 0 ? '+' : '') + result.karma)}`);
    if (result.moonBonus) sections.push('🌕 _A Lua Cheia guiou seus passos — +20% na caçada._');
    if (result.capped) sections.push(`🧺 _Teto diário da floresta atingido (${DAILY_COIN_CAP} WoK coin); sua ajuda segue valendo karma._`);
    sections.push(`${emoji} *${label}:* ${mono(percent(result.before[key]))} → ${mono(percent(result.after[key]))}\n${result.status.emoji} *Saúde da floresta:* ${mono(result.health + '/100')}`);
    sections.push(...fresh(result.events, p));
    sections.push(`> ⏳ ${view.next} em ${mono(duration(result.cooldown))} • ${command(p + 'floresta')}`);
    return send(sock, ctx, frameMenu(view.title, sections));
  });

  const track = (sock, ctx) => safe(sock, ctx, '⚠️ RASTROS', async () => {
    const p = prefix(), view = forest().forecast(ctx.jid);
    const arrow = value => value >= 2 ? '↗️' : value <= -2 ? '↘️' : '➡️';
    return send(sock, ctx, frameMenu('🔭 RASTROS DO FUTURO', [
      `${view.status.emoji} *Agora:* ${mono(view.health + '/100')} — _${view.status.label}_`,
      view.future.map(item => `⏩ *+${item.hours}h:* ${mono(item.health + '/100')} ${arrow(item.health - view.health)}\n   🦌 ${mono(percent(item.state.p))} • 🌿 ${mono(percent(item.state.v))} • 🪓 ${mono(percent(item.state.h))}`).join('\n'),
      `🧭 *Para mudar o destino:* ${NEED_VIEW[view.need.action]}\n_${view.need.reason}._`,
      '> 🔮 _Previsão simulada se ninguém agir. Caçar, plantar, patrulhar e conversar reescrevem o futuro._',
      `> 🌲 ${command(p + 'floresta')} • ${command(p + 'cronica')}`,
    ]));
  });

  const sight = (sock, ctx) => safe(sock, ctx, '🌫️ CERVO AUSENTE', async () => {
    const p = prefix(), result = forest().sight(ctx.jid, ctx.sender, ctx.pushName, ctx.msg?.key?.id);
    return send(sock, ctx, frameMenu('🦌✨ AVISTAMENTO LENDÁRIO', [
      '👁️ _Entre a névoa, o Cervo Branco cruzou seu olhar e desapareceu._',
      `💰 +${mono(result.coins)} WoK coin • ⭐ +${mono(result.xp)} XP • 🏅 Karma ${mono('+' + result.karma)}`,
      '📜 _Seu nome foi gravado para sempre na crônica da floresta._',
      `> 🌲 ${command(p + 'cronica')} • ${command(p + 'guardioes')}`,
    ]));
  });

  const chronicle = (sock, ctx) => safe(sock, ctx, '⚠️ CRÔNICA', async () => {
    const p = prefix(), rows = forest().chronicle(ctx.jid, 10);
    return send(sock, ctx, frameMenu('📜 CRÔNICA DA FLORESTA', [
      rows.length ? rows.map(row => `🗓️ ${mono(when(row.at))}\n↳ ${page(row, p)}`).join('\n') : '_A crônica ainda está em branco._',
      `> 🪶 _A história deste chat é escrita pelo próprio ecossistema._ ${command(p + 'floresta')}`,
    ]));
  });

  const guardians = (sock, ctx) => safe(sock, ctx, '⚠️ GUARDIÕES', async () => {
    const p = prefix(), rows = forest().guardians(ctx.jid, 10);
    const medal = index => ['🥇', '🥈', '🥉'][index] || mono(index + 1 + '.');
    return send(sock, ctx, frameMenu('🏅 GUARDIÕES DA FLORESTA', [
      rows.length ? rows.map((row, index) => `${medal(index)} *${row.name}* — 🏅 ${mono(row.karma)} karma • ${mono(row.actions)} ações`).join('\n') : '_Nenhum guardião ainda. Seja o primeiro:_ ' + command(p + 'plantar'),
      '> 🌿 _Karma sobe quando você ajuda no que a floresta precisa e cai com caça predatória._',
    ]));
  });

  return { panel, action, track, sight, chronicle, guardians };
}

function register(r) {
  const handlers = createForestHandlers();
  const common = { category: 'floresta', concurrency: 'chat', cooldown: 2, rateLimit: { max: 10, window: 60000 } };
  for (const [name, aliases, handler, description] of [
    ['floresta', ['ecossistema'], handlers.panel, 'Ecossistema vivo do chat: saúde, presas, estação e lua'],
    ['cacar', ['caçar', 'caca', 'caça'], handlers.action('cacar'), 'Caçar presas; rende mais quando a floresta está farta'],
    ['plantar', ['semear'], handlers.action('plantar'), 'Plantar mudas e fortalecer a vegetação'],
    ['patrulhar', ['patrulha', 'ronda'], handlers.action('patrulhar'), 'Afastar caçadores que ameaçam a floresta'],
    ['rastrear', ['previsao', 'previsão', 'farejar'], handlers.track, 'Prever a saúde da floresta nas próximas horas e dias'],
    ['avistar', ['cervo'], handlers.sight, 'Avistar o Cervo Branco lendário quando ele surgir'],
    ['cronica', ['crônica', 'lendas'], handlers.chronicle, 'A história do ecossistema escrita sozinha'],
    ['guardioes', ['guardiões', 'rankfloresta'], handlers.guardians, 'Ranking de karma ecológico do chat'],
  ]) r({ ...common, name, aliases, handler, description, usage: '!' + name });
}

module.exports = { createForestHandlers, register, duration, page };
