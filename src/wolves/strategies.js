'use strict';

const { validateStrategy, calculateBattle } = require('../utils/helpers');
const isolation = require('../isolation/context');
const LIMIT = 20;
const DEFAULT = Object.freeze({ attack: 34, defense: 33, counter: 33, wolves_alive: 100 });

function formationName(value) {
  const name = String(value || '').normalize('NFKC').trim().replace(/ +/g, ' ');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,31}$/u.test(name))
    throw Error('Use um nome de 1 a 32 letras, números, espaços, hífens ou sublinhados.');
  return { name, key: name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR') };
}

function formation(value) {
  const result = { attack: value.attack, defense: value.defense, counter: value.counter };
  if (!Object.values(result).every(Number.isInteger)) throw Error('A formação deve usar quantidades inteiras de lobos.');
  const checked = validateStrategy(result.attack, result.defense, result.counter);
  if (!checked.valid) throw Error(checked.error);
  return result;
}

function metrics(strategy) {
  const strong = [], weak = [];
  if (strategy.attack >= 45) strong.push('Pressão ofensiva elevada.');
  if (strategy.defense >= 40) strong.push('Boa resistência a ataques diretos.');
  if (strategy.counter >= 35) strong.push('Resposta de contra-ataque forte.');
  if (strategy.attack < 25) weak.push('Pouca pressão para reduzir os lobos adversários.');
  if (strategy.defense < 25) weak.push('Defesa baixa diante de formações ofensivas.');
  if (strategy.counter < 20) weak.push('Poucos lobos respondem aos ataques adversários.');
  return {
    offense: strategy.attack + strategy.counter * 0.3,
    resistance: strategy.defense + strategy.counter * 0.5,
    counter: strategy.counter,
    strengths: strong.length ? strong : ['Distribuição equilibrada entre as três posições.'],
    weaknesses: weak.length ? weak : ['Sem posição extrema; o resultado ainda depende da formação e dos lobos vivos.'],
  };
}

function createStrategies(api, { now = Date.now } = {}) {
  const db = api.db;
  function identity(chat, original) {
    isolation.chatId(chat);
    const input = String(original || '').replace(/:\d+(?=@)/, '').replace(/@c\.us$/, '@s.whatsapp.net');
    const alias = db.prepare('SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=? AND user_jid=?').get(chat, input);
    const user = alias?.wallet_jid || input;
    if (!/^\d{10,15}@s\.whatsapp\.net$/.test(user))
      throw Error('Não consegui confirmar seu número. Aguarde o vínculo PN/LID da sessão antes de usar estratégias salvas.');
    return user;
  }
  const scoped = (chat, run) => isolation.run(chat, run);
  function current(chat, original) {
    return scoped(chat, () => {
      const user = identity(chat, original);
      const saved = api.getStrategy(user);
      return { user, strategy: { ...DEFAULT, ...saved }, exists: !!saved };
    });
  }
  function operation(chat, original, action, name, event, run) {
    return scoped(chat, () => db.transaction(() => {
      const user = identity(chat, original);
      if (typeof event !== 'string' || !event || event.length > 200) throw Error('Não foi possível confirmar o identificador da mensagem.');
      const actionKey = `${action}:${name.key}`;
      const prior = db.prepare('SELECT * FROM wolf_strategy_operations WHERE chat_jid=? AND event_id=?').get(chat, event);
      if (prior) {
        if (prior.user_jid !== user || prior.action !== actionKey) throw Error('Esta mensagem já foi processada em outra operação.');
        return { ...JSON.parse(prior.result), duplicate: true };
      }
      const result = run(user);
      db.prepare('INSERT INTO wolf_strategy_operations VALUES (?,?,?,?,?,?)').run(chat, event, user, actionKey, JSON.stringify(result), now());
      return result;
    })());
  }
  function saved(chat, user, name) {
    const row = db.prepare('SELECT * FROM saved_wolf_strategies WHERE chat_jid=? AND user_jid=? AND name_key=?').get(chat, user, name.key);
    if (!row) throw Error('Formação salva não encontrada neste chat. Use estrategia listar.');
    return row;
  }
  return {
    current,
    list(chat, original) {
      return scoped(chat, () => db.prepare('SELECT name,attack,defense,counter,created_at FROM saved_wolf_strategies WHERE chat_jid=? AND user_jid=? ORDER BY created_at,name_key LIMIT ?')
        .all(chat, identity(chat, original), LIMIT));
    },
    save(chat, original, value, event) {
      const name = formationName(value);
      return operation(chat, original, 'save', name, event, user => {
        if (!api.getUser(user)) throw Error('Seu perfil ainda não está disponível neste chat. Use um comando do bot e tente novamente.');
        if (db.prepare('SELECT 1 FROM saved_wolf_strategies WHERE chat_jid=? AND user_jid=? AND name_key=?').get(chat, user, name.key))
          throw Error('Já existe uma formação com esse nome. Exclua a anterior ou escolha outro nome.');
        if (db.prepare('SELECT count(*) count FROM saved_wolf_strategies WHERE chat_jid=? AND user_jid=?').get(chat, user).count >= LIMIT)
          throw Error(`Você pode guardar até ${LIMIT} formações neste chat. Exclua uma antes de salvar outra.`);
        const strategy = formation(api.getStrategy(user) || DEFAULT);
        db.prepare('INSERT INTO saved_wolf_strategies VALUES (?,?,?,?,?,?,?,?)').run(chat, user, name.key, name.name, strategy.attack, strategy.defense, strategy.counter, now());
        return { name: name.name, strategy };
      });
    },
    use(chat, original, value, event) {
      const name = formationName(value);
      return operation(chat, original, 'use', name, event, user => {
        const row = saved(chat, user, name), strategy = formation(row);
        api.upsertStrategy(user, strategy.attack, strategy.defense, strategy.counter);
        return { name: row.name, strategy };
      });
    },
    remove(chat, original, value, event) {
      const name = formationName(value);
      return operation(chat, original, 'remove', name, event, user => {
        const row = saved(chat, user, name);
        db.prepare('DELETE FROM saved_wolf_strategies WHERE chat_jid=? AND user_jid=? AND name_key=?').run(chat, user, name.key);
        return { name: row.name };
      });
    },
    tactics(chat, original) {
      const { strategy } = current(chat, original);
      return { strategy: formation(strategy), wolves: strategy.wolves_alive, ...metrics(strategy) };
    },
    simulate(chat, original, opponent = null) {
      return scoped(chat, () => {
        const own = current(chat, original);
        let target = DEFAULT, label = 'Equilibrada de treinamento';
        if (typeof opponent === 'string') {
          const row = saved(chat, own.user, formationName(opponent));
          target = formation(row); label = row.name;
        } else if (opponent) { target = formation(opponent); label = 'Formação de treinamento informada'; }
        const strategy = formation(own.strategy);
        const wolves = Math.max(0, Math.min(100, own.strategy.wolves_alive));
        return { own: { strategy, wolves }, target: { strategy: formation(target), wolves: 100, name: label },
          metrics: metrics(strategy), result: calculateBattle({ strategy, wolves }, { strategy: target, wolves: 100 }) };
      });
    },
    history(chat, original, page = 1) {
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw Error('Informe uma página inteira positiva.');
      return scoped(chat, () => {
        const user = identity(chat, original);
        const aliases = db.prepare('SELECT user_jid FROM universal_wallet_aliases WHERE chat_jid=? AND wallet_jid=? LIMIT 100').all(chat, user).map(row => row.user_jid);
        const ids = [...new Set([user, ...aliases])];
        const marks = ids.map(() => '?').join(',');
        const filter = `(attacker IN (${marks}) OR defender IN (${marks})) AND group_id=?`;
        const params = [...ids, ...ids, chat];
        const total = db.prepare(`SELECT count(*) count FROM battle_log WHERE ${filter}`).get(...params).count;
        const pages = Math.max(1, Math.ceil(total / 5));
        if (page > pages) throw Error(`Este histórico tem ${pages} página(s).`);
        const rows = db.prepare(`SELECT * FROM battle_log WHERE ${filter} ORDER BY id DESC LIMIT 5 OFFSET ?`).all(...params, (page - 1) * 5);
        return { user, page, pages, total, rows: rows.map(row => {
          const attacking = ids.includes(row.attacker);
          return { id: row.id, at: row.created_at, role: attacking ? 'Ataque' : 'Defesa',
            outcome: row.result === 'draw' ? 'Empate' : (row.result === 'attacker') === attacking ? 'Vitória' : 'Derrota',
            wolvesBefore: attacking ? row.attacker_wolves_before : row.defender_wolves_before,
            wolvesAfter: attacking ? row.attacker_wolves_after : row.defender_wolves_after };
        }) };
      });
    },
  };
}

module.exports = { createStrategies, formationName, formation, metrics, LIMIT, DEFAULT };
