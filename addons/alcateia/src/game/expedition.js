import { randomUUID } from 'node:crypto';
import { GameError, formatRemaining } from './validation.js';
import { credit } from './wallet.js';
import { ensureRP } from '../rp/state.js';

const ROLES = ['explorador', 'guardiao', 'curandeiro', 'estrategista'];
const SCENES = [
  { name: 'Ponte das raízes', story: 'A ponte cede onde as carroças cruzavam.', risk: 'atravessar' },
  { name: 'Espelho da lagoa', story: 'O reflexo da lua atrai os vigias da margem.', risk: 'sinalizar' },
  { name: 'Trilha das mariposas', story: 'A fumaça da fogueira dispersa as mariposas-guia.', risk: 'acampar' },
  { name: 'Escadaria de sal', story: 'Degraus de sal se desfazem sob o peso da equipe.', risk: 'atravessar' },
  { name: 'Farolete de vidro', story: 'Uma lente rachada espalha os sinais na névoa.', risk: 'sinalizar' },
  { name: 'Pátio dos ecos', story: 'O vento invade qualquer abrigo que fique parado.', risk: 'acampar' },
];
const ACTIONS = ['atravessar', 'sinalizar', 'acampar'];
const SUPPLIES = { atravessar: 'racampo', sinalizar: 'lampiao', acampar: 'tala' };
const HALF_HOUR = 30 * 60_000, TURN = 5 * 60_000, DAY = 86_400_000;
const report = lines => ({ type: 'field-report', title: 'EXPEDIÇÕES • FARÓIS DA MATILHA', lines });
const GUIDE = ['Reconstrua a luz do farol antes que o vigor acabe. Equipes de 2 a 5 neste grupo.',
  '!expedicao criar [papel] • !expedicao entrar ID [papel] • !expedicao iniciar',
  'Explorador poupa 1 provisão ao atravessar. Guardião protege do risco do terreno. Curandeiro recupera +1 vigor ao acampar. Estrategista ganha +1 luz ao sinalizar.',
  '!expedicao status • !expedicao inventario • !expedicao sair. Equipamento opcional em !loja e !rploja oficina.'];
function roleOf(value = 'explorador') {
  const role = String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (!ROLES.includes(role)) throw new GameError('Papéis: explorador, guardiao, curandeiro ou estrategista.');
  return role;
}
function member(player, role) { return { jid: player.jid, role: roleOf(role), turns: 0 }; }
function itinerary(rng, count) {
  const remaining = [...SCENES.keys()], result = [];
  while (result.length < count) result.push(remaining.splice(Math.floor(rng() * remaining.length), 1)[0]);
  return result;
}
function current(e) { return e.members[e.round % e.members.length]; }
function status(e, game, now) {
  const names = e.members.map(m => game.players[m.jid].name + ' (' + m.role + ')').join(', ');
  if (e.phase === 'lobby') return ['Chamada ' + e.id + ' • ' + names, '!expedicao entrar ' + e.id + ' [papel] • Líder: !expedicao iniciar'];
  if (e.phase === 'done') return e.summary;
  const scene = SCENES[e.route[e.round]], token = e.id + '-' + (e.round + 1);
  return [`Etapa ${e.round + 1}/${e.route.length} • ${scene.name}. ${scene.story}`,
    `Luz ${e.light}/${e.goal} • Vigor ${e.vigor}/6 • Provisões ${e.food}/6`,
    `Risco ao ${scene.risk}: −1 vigor. Vez de ${game.players[current(e).jid].name}. ${now >= e.turnAt + TURN ? 'Outro membro pode assumir.' : 'Após 5 min outro membro pode assumir.'}`,
    'Atravessar: +2 luz, −1 provisão (sem provisão, −1 vigor). Sinalizar: +3 luz, −2 vigor. Acampar: +1 luz, +2 vigor, +1 provisão.',
    `!expedicao escolher ${token} atravessar|sinalizar|acampar [item]`,
    '!expedicao explorar prevê o resultado de cada opção. Opcionais: racampo na travessia, lampiao no sinal ou tala no acampamento.'];
}
function finish(e, game, now) {
  const won = e.vigor > 0 && e.light >= e.goal;
  const lines = [won ? 'O farol acendeu! A frota encontrou o porto.' : 'A matilha voltou ao porto. O farol ficou para outra noite.',
    `Luz final ${e.light}/${e.goal} • Vigor ${e.vigor}/6`];
  for (const m of e.members) {
    const p = game.players[m.jid];
    if (!m.turns || p.banned) continue;
    p.fieldJournal ??= { completed: 0, victories: 0, best: 0, lastPaidAt: null };
    const log = p.fieldJournal;
    log.completed++;
    if (won) log.victories++;
    log.best = Math.max(log.best, e.light);
    if (won && (log.lastPaidAt == null || now >= log.lastPaidAt + DAY)) {
      const reward = Math.min(80, 40 + 10 * m.turns);
      credit(p, reward);
      log.lastPaidAt = now;
      lines.push(`${p.name} • +${reward} WoK coin (${m.turns} turno(s)).`);
    } else if (won) lines.push(p.name + ' • vitória registrada, prêmio disponível novamente em ' + formatRemaining(log.lastPaidAt + DAY - now) + '.');
  }
  e.phase = 'done';
  e.summary = lines;
}
// The scouting report and the actual move use the same terrain, role and relic rules.
function outcome(e, player, m, choice, item) {
  const scene = SCENES[e.route[e.round]], relics = player.fieldRelics || [];
  let { light, food } = e;
  let vigor = scene.risk === choice && m.role !== 'guardiao' ? -1 : 0;
  if (choice === 'atravessar') {
    light += 2;
    if (m.role !== 'explorador' && !relics.includes('treno')) {
      if (food) food--; else vigor--;
    }
    if (item) food = Math.min(6, food + 2);
  } else if (choice === 'sinalizar') {
    light += 3 + Number(m.role === 'estrategista') + Number(relics.includes('astrolabio')) + (item ? 2 : 0);
    vigor -= 2;
  } else {
    light++;
    food = Math.min(6, food + 1);
    vigor += 2 + Number(m.role === 'curandeiro') + Number(relics.includes('tenda')) + (item ? 2 : 0);
  }
  return { light, food, vigor: Math.min(6, Math.max(0, e.vigor + vigor)) };
}
function decide(e, player, m, choice, item, now) {
  if (!ACTIONS.includes(choice)) throw new GameError('Escolha atravessar, sinalizar ou acampar.');
  if (item) {
    if (SUPPLIES[choice] !== item) throw new GameError('Este item não combina com a decisão. Consulte !expedicao status.');
    const rp = ensureRP(player, now);
    if (!(rp.inventory[item] > 0)) throw new GameError('O item precisa estar no seu inventário RP.');
    if (--rp.inventory[item] === 0) delete rp.inventory[item];
    rp.updatedAt = now;
  }
  Object.assign(e, outcome(e, player, m, choice, item));
  m.turns++;
  e.round++;
  e.turnAt = now;
}
export function expedition(game, player, request, now, rng) {
  const [sub = 'status', a, b, c] = request.args || [];
  const n = request.args?.length || 0;
  if (sub === 'inventario' && n === 1) {
    const inv = player.rp?.inventory || {}, journal = player.fieldJournal;
    return report([`Rações: ${inv.racampo || 0} • Lampiões: ${inv.lampiao || 0} • Talas: ${inv.tala || 0}`,
      'Relíquias: ' + (player.fieldRelics?.join(', ') || 'nenhuma'), `Viagens: ${journal?.completed || 0} • Vitórias: ${journal?.victories || 0} • Recorde de luz: ${journal?.best || 0}`]);
  }
  if (!request.chatId?.endsWith('@g.us')) return report(['A expedição cooperativa começa em um grupo.', ...GUIDE]);
  let e = game.expedition;
  if (e && now >= e.expiresAt) e = null;
  if (sub === 'status' && n <= 1) return report(e ? status(e, game, now) : GUIDE);
  if (sub === 'explorar' && n === 1) {
    if (e?.phase !== 'active') return report(e ? status(e, game, now) : GUIDE);
    const own = e.members.find(entry => entry.jid === player.jid);
    if (!own) throw new GameError('O reconhecimento usa o papel e as relíquias dos participantes.');
    return report(['Reconhecimento da sua próxima ação no terreno atual. Previsão sem consumível.',
      ...ACTIONS.map(choice => {
        const next = outcome(e, player, own, choice);
        return `${choice} → luz ${next.light}/${e.goal} • vigor ${next.vigor}/6 • provisões ${next.food}/6`;
      }), ...status(e, game, now).slice(-2)]);
  }
  if (sub === 'criar' && n <= 2) {
    if (e && e.phase !== 'done') throw new GameError('Já existe uma expedição neste grupo.');
    game.expedition = { id: randomUUID().slice(0, 8), phase: 'lobby', members: [member(player, a)], expiresAt: now + HALF_HOUR };
    return report(status(game.expedition, game, now));
  }
  if (!e || e.phase === 'done') throw new GameError('Use !expedicao criar para abrir uma equipe.');
  const m = e.members.find(entry => entry.jid === player.jid), leader = e.members[0].jid === player.jid;
  if (sub === 'entrar' && n >= 2 && n <= 3) {
    if (e.phase !== 'lobby' || a !== e.id || m || e.members.length >= 5) throw new GameError('Confira o ID, as vagas e se você já entrou.');
    e.members.push(member(player, b));
  } else if (sub === 'sair' && n === 1 && m) {
    if (e.phase === 'lobby') {
      e.members = e.members.filter(entry => entry !== m);
      if (!e.members.length) { delete game.expedition; return report(['Chamada encerrada.']); }
    } else {
      const next = current(e);
      e.members = e.members.filter(entry => entry !== m);
      if (e.members.length < 2) { delete game.expedition; return report(['Equipe insuficiente. Viagem encerrada sem prêmio.']); }
      if (next === m) e.turnAt = now;
    }
  } else if (sub === 'iniciar' && n === 1 && leader && e.phase === 'lobby') {
    if (e.members.length < 2) throw new GameError('Convide pelo menos mais um jogador.');
    const stages = Math.max(3, e.members.length);
    Object.assign(e, { phase: 'active', round: 0, route: itinerary(rng, stages), goal: stages * 2 + 1, light: 0, vigor: 5, food: 2, turnAt: now, expiresAt: now + 4 * HALF_HOUR });
  } else if (sub === 'escolher' && n >= 3 && n <= 4 && m && e.phase === 'active') {
    if (a !== e.id + '-' + (e.round + 1)) throw new GameError('Esta escolha pertence a outra etapa. Consulte !expedicao status.');
    if (m !== current(e) && now < e.turnAt + TURN) throw new GameError('Aguarde a sua vez.');
    decide(e, player, m, b, c, now);
    if (!e.vigor || e.round === e.route.length) finish(e, game, now);
  } else throw new GameError('Ação indisponível. Consulte !expedicao status. Só o líder inicia.');
  return report(status(e, game, now));
}
