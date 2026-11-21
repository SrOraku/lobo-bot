'use strict';
const crypto = require('node:crypto');
const { mono, command: commandText, card } = require('../ui/text');
const { clean } = require('../menus/render');

// The original eight words remain in their original order for saved rounds.
const CATEGORIES = Object.freeze({
  geral: ['floresta', 'coruja', 'montanha', 'castelo', 'bicicleta', 'girassol', 'cachoeira', 'borboleta'],
  animais: ['lobo', 'raposa', 'tartaruga', 'elefante', 'pinguim', 'girafa', 'golfinho', 'abelha', 'polvo', 'cavalo', 'coelho', 'jacare'],
  natureza: ['vulcao', 'arcoiris', 'nuvem', 'cacto', 'palmeira', 'caverna', 'neve', 'oceano', 'ilha', 'tempestade', 'cogumelo', 'cometa'],
  objetos: ['guarda-chuva', 'violao', 'relogio', 'mochila', 'chave', 'binoculo', 'bussola', 'lanterna', 'tesoura', 'escada', 'martelo', 'telescopio'],
  fantasia: ['dragao', 'fada', 'feiticeiro', 'unicornio', 'portal', 'tesouro', 'coroa', 'escudo', 'espada', 'castelo', 'grifo', 'pocao'],
});
const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
function seasonKey(timestamp) {
  const date = new Date(timestamp - 3 * 3600000); // Brasília, UTC−3.
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
function progressiveHint(state, timestamp) {
  const word = state.word, elapsed = timestamp - (state.startedAt ?? state.ends - 120000);
  if (elapsed < 40000) return `${word.replace(/[^-]/g, '＿')} • ${word.replace(/-/g, '').length} letras. Mais pistas após 40 segundos.`;
  const indexes = new Set([0]);
  if (word.length > 3) indexes.add(word.length - 1);
  if (elapsed >= 80000) {
    const limit = Math.floor(word.replace(/-/g, '').length / 2);
    for (let i = 2; i < word.length - 1 && indexes.size < limit; i += 3) indexes.add(i);
  }
  return [...word].map((letter, index) => letter === '-' || indexes.has(index) ? letter : '＿').join(' ');
}

function createGartic(api, { now = Date.now, pick = crypto.randomInt, schedule = setTimeout, cancel = clearTimeout,
  groupEnabled = () => true } = {}) {
  const db = api.db, timers = new Map();
  const queue = new (require('../core/keyed-queue').KeyedQueue)({ maxKeys: 500, maxPending: 10 });
  const read = chat => {
    const row = db.prepare("SELECT state FROM expansion_rounds WHERE chat_jid=? AND kind='gartic'").get(chat);
    return row ? JSON.parse(row.state) : null;
  };
  const save = (chat, state) => db.prepare("INSERT INTO expansion_rounds VALUES(?,'gartic',?) ON CONFLICT(chat_jid,kind) DO UPDATE SET state=excluded.state").run(chat, JSON.stringify(state));
  const seen = (chat, event) => event && !!db.prepare('SELECT 1 FROM phase1_gartic_actions WHERE chat_jid=? AND event_id=?').get(chat, event);
  const actionEvent = (chat, user, action, event, roundId) => !event || !!db.prepare('INSERT OR IGNORE INTO phase1_gartic_actions VALUES(?,?,?,?,?,?)').run(chat, event, user, action, roundId, now()).changes;
  function identity(chat, original) {
    const user = require('../progression/service').createProgression(api).identity(chat, original);
    if (!/^\d{8,15}@s\.whatsapp\.net$/.test(user || '')) throw Error('Não consegui confirmar seu número. Aguarde a sincronização do WhatsApp antes de jogar.');
    return user;
  }
  function arm(sock, chat, state) {
    if (timers.has(chat)) cancel(timers.get(chat));
    const timer = schedule(() => {
      timers.delete(chat);
      const current = read(chat);
      if (current?.id !== state.id || !current.active) return;
      save(chat, { ...current, active: false });
      try { if (!groupEnabled(chat)) return; }
      catch { return; } // Sem acesso à configuração, não publique o aviso no grupo.
      sock.sendMessage(chat, { text: card('🎨 TEMPO ENCERRADO', [`*Palavra:* ${mono(current.word)}`], {
        tip: current.round < current.total ? `_Continue com_ ${commandText(require('../config').get('PREFIX') + 'gartic proxima')}` : '_Sessão concluída.',
      }) }).catch(() => {});
    }, Math.max(1, state.ends - now()));
    timer?.unref?.(); timers.set(chat, timer);
  }
  async function round(sock, chat, user, total, previous, category = 'geral', event) {
    if (!Object.hasOwn(CATEGORIES, category)) throw Error('Categoria inválida. Consulte gartic categorias.');
    const pool = CATEGORIES[category];
    const state = {
      id: crypto.randomUUID(), artist: user, category, word: pool[pick(pool.length)],
      round: (previous?.round || 0) + 1, total, startedAt: now(), ends: now() + 120000, active: true,
      startEvent: event || null,
    };
    if (previous?.word === state.word) state.word = pool[(pool.indexOf(state.word) + 1) % pool.length];
    await sock.sendMessage(user, { text: card('🎨 PALAVRA SECRETA', [
      `*Desenhe:* ${mono(state.word)}`, `*Categoria:* ${category}`, `*Rodada:* ${mono(`${state.round}/${total}`)}`,
    ], { tip: '_Envie o desenho no grupo sem revelar a palavra._' }) });
    db.transaction(() => {
      if (!actionEvent(chat, user, 'round', event, state.id)) throw Error('Essa jogada já foi processada. Consulte gartic status.');
      save(chat, state);
    })();
    arm(sock, chat, state); return state;
  }
  function seasonRanking(chat, season, category) {
    const rows = db.prepare(`SELECT user_jid,name,SUM(points) AS points,COUNT(*) AS wins
      FROM phase1_gartic_results WHERE chat_jid=? AND season=? AND (? IS NULL OR category=?)
      GROUP BY user_jid ORDER BY points DESC,wins DESC,user_jid LIMIT 10`).all(chat, season, category || null, category || null);
    return `🏆 *Temporada iniciada em:* ${mono(season)}${category ? '\n*Categoria:* ' + category : ''}\n` +
      (rows.map((row, index) => `${mono(index + 1)} *${clean(row.name)}* • ${mono(row.points)} pontos • ${mono(row.wins)} acertos`).join('\n') || 'Nenhum acerto nesta temporada.');
  }
  async function command(sock, ctx) {
    const chat = ctx.jid, action = normalize(ctx.args?.[0] || 'status'), p = require('../config').get('PREFIX');
    if (!chat.endsWith('@g.us')) throw Error('Gartic funciona em grupos.');
    const current = read(chat);
    if (action === 'categorias') return card('🎨 CATEGORIAS DO GARTIC', Object.entries(CATEGORIES).map(([name, words]) => `${name} • ${words.length} palavras`), { tip: commandText(`${p}gartic iniciar 3 animais`) });
    if (action === 'ranking') {
      if (ctx.args.length > 3) throw Error('Use gartic ranking temporada [categoria].');
      const requested = normalize(ctx.args?.[1]);
      if (requested === 'temporada' || /^\d{4}-\d{2}-\d{2}$/.test(requested)) {
        const season = requested === 'temporada' ? seasonKey(now()) : requested;
        const category = normalize(ctx.args?.[2]) || null;
        if (category && !Object.hasOwn(CATEGORIES, category)) throw Error('Categoria inválida. Consulte gartic categorias.');
        return seasonRanking(chat, season, category);
      }
      if (requested) throw Error('Use gartic ranking ou gartic ranking temporada [categoria].');
      return db.prepare('SELECT name,points,wins FROM arcade_scores WHERE chat_jid=? ORDER BY points DESC LIMIT 10').all(chat)
        .map((row, index) => `${mono(index + 1)} *${clean(row.name)}*\n⭐ ${mono(row.points)} pontos • 🏆 ${mono(row.wins)} vitórias`).join('\n') || 'Nenhuma partida.';
    }
    const user = identity(chat, ctx.sender);
    if (['iniciar', 'proxima', 'parar'].includes(action) && seen(chat, ctx.msg?.key?.id)) return 'Essa jogada já foi processada; consulte gartic status.';
    if (action === 'iniciar') {
      if (current?.active && current.ends > now()) throw Error('Já existe uma rodada ativa.');
      if (ctx.msg?.key?.id && current?.startEvent === ctx.msg.key.id) return 'Essa rodada já foi iniciada; consulte gartic status.';
      const total = ctx.args[1] === undefined ? 3 : Number(ctx.args[1]);
      if (!Number.isInteger(total) || total < 1 || total > 10) throw Error('Escolha de `1` a `10` rodadas.');
      if (ctx.args.length > 3) throw Error('Use gartic iniciar [1–10] [categoria].');
      const category = normalize(ctx.args[2]) || 'geral';
      if (!Object.hasOwn(CATEGORIES, category)) throw Error('Categoria inválida. Consulte gartic categorias.');
      const state = await round(sock, chat, user, total, null, category, ctx.msg?.key?.id);
      return `🎨 *Gartic:* ${mono(`${state.round}/${state.total}`)}\n*Categoria:* ${category}\n_O desenhista recebeu a palavra no privado; envie seu desenho aqui._\n*Pista:* ${mono(state.word.length)} letras • *Tempo:* ${mono('2 minutos')}\n> _Os demais respondem:_ ${commandText(`${p}gartic PALAVRA`)}`;
    }
    if (action === 'proxima') {
      if (ctx.args.length > 1) throw Error('Use gartic proxima.');
      if (!current || current.active && current.ends > now() || current.round >= current.total) throw Error('Não há próxima rodada disponível.');
      if (current.artist !== user) throw Error('Somente o desenhista inicia a próxima rodada.');
      if (ctx.msg?.key?.id && current.startEvent === ctx.msg.key.id) return 'Essa rodada já foi iniciada; consulte gartic status.';
      const state = await round(sock, chat, user, current.total, current, current.category || 'geral', ctx.msg?.key?.id);
      return `🎨 *Rodada:* ${mono(`${state.round}/${state.total}`)}\n_Nova palavra enviada ao desenhista._\n*Categoria:* ${state.category}\n*Pista:* ${mono(state.word.length)} letras`;
    }
    if (action === 'parar') {
      const actor = await require('../activations/access').resolveActor(sock, ctx);
      if (current?.artist !== user && !actor.owner && !actor.admin) throw Error('Somente desenhista, administrador ou dono pode parar.');
      db.transaction(() => {
        actionEvent(chat, user, 'stop', ctx.msg?.key?.id, current?.id || null);
        if (current) save(chat, { ...current, active: false, total: current.round });
      })();
      if (timers.has(chat)) { cancel(timers.get(chat)); timers.delete(chat); }
      return '✅ *Gartic encerrado.*';
    }
    if (action === 'pista') {
      if (!current?.active || current.ends <= now()) throw Error('Não há rodada ativa.');
      return `🎨 *Pista progressiva:* ${mono(progressiveHint(current, now()))}`;
    }
    if (action === 'status') {
      if (current?.active && current.ends > now()) {
        arm(sock, chat, current);
        return `🎨 *Rodada:* ${mono(`${current.round}/${current.total}`)}\n*Categoria:* ${current.category || 'geral'}\n*Pista:* ${mono(current.word.length)} letras\n> ⏳ _Restam_ ${mono(`${Math.ceil((current.ends - now()) / 1000)}s`)}.`;
      }
      return [commandText(`${p}gartic iniciar [1–10] [categoria]`), commandText(`${p}gartic categorias`), commandText(`${p}gartic proxima`), commandText(`${p}gartic pista`), commandText(`${p}gartic parar`), commandText(`${p}gartic ranking temporada`)].map(text => '▸ ' + text).join('\n');
    }
    return guess(sock, ctx, ctx.args.join(' '));
  }
  async function guess(sock, ctx, text) {
    const chat = ctx.jid, state = read(chat);
    if (!state?.active) return null;
    if (state.ends <= now()) { save(chat, { ...state, active: false }); return null; }
    let user;
    try { user = identity(chat, ctx.sender); } catch { return null; }
    if (user === state.artist || normalize(text) !== normalize(state.word)) return null;
    return require('../isolation/context').run(chat, () => db.transaction(() => {
      const current = read(chat);
      if (!current.active || current.id !== state.id || current.ends <= now()) return null;
      if (!actionEvent(chat, user, 'guess', ctx.msg?.key?.id, state.id)) return null;
      const inserted = db.prepare(`INSERT OR IGNORE INTO phase1_gartic_results
        (chat_jid,round_id,user_jid,name,category,season,points,won_at) VALUES(?,?,?,?,?,?,30,?)`)
        .run(chat, state.id, user, clean(ctx.pushName || 'Lobo'), state.category || 'geral', seasonKey(now()), now());
      if (!inserted.changes) return null;
      save(chat, { ...current, active: false });
      api.upsertUser(user, clean(ctx.pushName || user.split('@')[0]));
      const profile = api.getUser(user);
      if (profile?.banned || profile?.muted) throw Error('Este perfil não pode receber a recompensa agora.');
      if (!profile || !Number.isSafeInteger(profile.gold + 40) || !Number.isSafeInteger((profile.xp || 0) + 20)) throw Error('A recompensa excederia o limite permitido do perfil.');
      api.addGold(user, 40); api.addXP(user, 20);
      api.logGoldTransaction('gartic', user, 40, 'Gartic: ' + state.id);
      db.prepare('INSERT INTO arcade_scores VALUES(?,?,?,30,1,1) ON CONFLICT(chat_jid,user_jid) DO UPDATE SET name=excluded.name,points=points+30,wins=wins+1,played=played+1').run(chat, user, clean(ctx.pushName || 'Lobo'));
      require('../missions/service').recordGameEvent(db, { chat, user, event: 'gartic:' + state.id, kind: 'arcade_complete', at: now(), metadata: { game: 'gartic', won: true, points: 30 } });
      require('./history').recordArcadeResult(db,{chat,user,event:'gartic:'+state.id,name:ctx.pushName||'Lobo',game:'gartic',points:30,won:true,state:{category:state.category||'classico',_startedAt:state.ends-120000},at:now()});
      return `🏆 *Acertou:* ${mono(state.word)}\n*Recompensa:* ${mono('+40 WoK coin')} • ${mono('+20 XP')} • ${mono('+30 pontos')}\n> ${state.round < state.total ? `_Desenhista:_ ${commandText(`${require('../config').get('PREFIX')}gartic proxima`)}` : '🎨 _Sessão concluída!_'}`;
    })());
  }
  return {
    command: (sock, ctx) => queue.run(ctx.jid, () => command(sock, ctx)), guess, read,
    resume(sock) {
      for (const row of db.prepare("SELECT chat_jid,state FROM expansion_rounds WHERE kind='gartic' LIMIT 500").all()) {
        const state = JSON.parse(row.state); if (state.active) arm(sock, row.chat_jid, state);
      }
    },
    stop() { for (const timer of timers.values()) cancel(timer); timers.clear(); },
  };
}
let instance;
function gartic() { return instance || (instance = createGartic(require('../utils/database'), {
  groupEnabled: chat => require('../activations/store').getStore().isBotEnabled(chat),
})); }
module.exports = { createGartic, gartic, CATEGORIES, seasonKey, progressiveHint };
