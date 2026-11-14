// Textos da Guerra de Alcateias: respostas do !guerra e avisos no grupo.
import { panel, progress, mono } from '../presentation.js';
import { TERRITORIES, WAR, AI_NAME, formatWait as rawWait } from './war.js';

// Durações sempre em monoespaçado, inteiras ("5d 13h"), como os outros números do jogo.
const formatWait = ms => mono(rawWait(ms));

function clean(value, fallback = 'Lobo') {
  return String(value ?? fallback).replace(/[\r\n*_`~]+/g, ' ').trim().slice(0, 40) || fallback;
}

const territoryOf = id => TERRITORIES.find(territory => territory.id === id);
const numberOf = territory => TERRITORIES.findIndex(item => item.id === territory.id) + 1;
const medal = position => ['🥇', '🥈', '🥉'][position - 1] || `${position}º`;
const prizeLine = () => `💰 Prêmio por membro que participou: 1º ${WAR.prizes[0]} • 2º ${WAR.prizes[1]} • 3º ${WAR.prizes[2]} WoK coin`;

function rankingLines(ranking) {
  return ranking.map(entry => `${medal(entry.position)} ${entry.ai ? '🌑' : '🐺'} ${clean(entry.name)} — ${entry.points} pts • ${entry.territories} 🏴`);
}

function mapText(result, prefix) {
  return panel('GUERRA DE ALCATEIAS', [
    '🗺️ _Territórios em disputa nesta semana._',
    ...result.territories.flatMap(territory => [
      `${territory.number}. ${territory.emoji} ${territory.name}`,
      `   ${territory.ai ? '🌑 ' + AI_NAME : territory.owner ? (territory.mine ? '🐺 ' : '⚔️ ') + clean(territory.owner) : '🏳️ livre'} • 🛡️ ${territory.defense}/100`,
    ]),
    '🏆 _Placar da semana_',
    ...rankingLines(result.ranking),
    `⏳ Fecha em ${formatWait(result.endsIn)} (segunda-feira, 00h).`,
    result.clan
      ? `🐺 Sua alcateia: ${clean(result.clan)} • ${result.ready ? 'próxima ação em ' + formatWait(result.ready) : 'pronta para agir'}`
      : `🐺 Você ainda não tem alcateia. Use ${prefix}clan criar Nome ou ${prefix}clan entrar Nome.`,
    `> ⚔️ ${prefix}guerra atacar N • 🛡️ ${prefix}guerra defender N • 🏆 ${prefix}guerra placar • 📜 ${prefix}guerra regras`,
  ]);
}

function attackText(result, prefix) {
  const { territory } = result;
  return panel(result.captured ? 'TERRITÓRIO CONQUISTADO' : 'ATAQUE DE GUERRA', [
    `⚔️ ${clean(result.player)} atacou ${territory.emoji} ${territory.name} (${result.previousOwner ? clean(result.previousOwner) : 'livre'}).`,
    `💥 Dano: ${result.damage} • Defesa: ${result.before} → ${result.after}`,
    result.captured
      ? `🏴 ${territory.name} agora é da alcateia ${clean(result.clan)}! Defesa inicial: ${result.defense}/100`
      : `🛡️ ${progress(result.after)} ${result.after}/100`,
    `🏆 +${result.points} pontos para ${clean(result.clan)} • Total: ${result.total}`,
    `> ⏳ Próxima ação de guerra em ${formatWait(WAR.actionCooldown)}. ${result.captured ? 'Reforce com ' + prefix + 'guerra defender ' + numberOf(territory) + '.' : ''}`.trim(),
  ]);
}

function defendText(result) {
  const { territory } = result;
  return panel('DEFESA REFORÇADA', [
    `🛡️ ${clean(result.player)} reforçou ${territory.emoji} ${territory.name}.`,
    `🧱 Defesa: ${result.before} → ${result.after} (+${result.amount})`,
    `${progress(result.after)} ${result.after}/100`,
    `🏆 +${result.points} pontos para ${clean(result.clan)} • Total: ${result.total}`,
    `> ⏳ Próxima ação de guerra em ${formatWait(WAR.actionCooldown)}.`,
  ]);
}

function podiumLines(summary) {
  return summary.podium.map(entry =>
    `${medal(entry.position)} ${clean(entry.name)} — ${entry.points} pts • ${entry.prize} WoK coin para ${entry.awarded} membro${entry.awarded === 1 ? '' : 's'}`);
}

function rankingText(result, prefix) {
  return panel('PLACAR DA GUERRA', [
    ...rankingLines(result.ranking),
    `⏳ Fecha em ${formatWait(result.endsIn)} (segunda-feira, 00h).`,
    prizeLine(),
    ...(result.last ? ['📜 _Semana passada_', ...podiumLines(result.last), `🌑 ${AI_NAME}: ${result.last.ai.position}º lugar`] : []),
    `> 🗺️ Mapa: ${prefix}guerra`,
  ]);
}

function rulesText(prefix) {
  return panel('REGRAS DA GUERRA', [
    `🐺 As alcateias (clãs) deste grupo disputam ${TERRITORIES.length} territórios durante a semana.`,
    `🌑 A ${AI_NAME} é controlada pelo bot e ataca todos os dias às ${WAR.aiHours.join('h, ')}h.`,
    `⚔️ ${prefix}guerra atacar N — tira defesa de um território; ao zerar, ele passa a ser da sua alcateia.`,
    `🛡️ ${prefix}guerra defender N — reforça um território da sua alcateia.`,
    `⏳ Cada jogador faz uma ação de guerra a cada ${formatWait(WAR.actionCooldown)}.`,
    `🏆 Pontos: dano causado • +${WAR.capturePoints} por conquista • metade do reforço • +${WAR.holdPoints} por território mantido no fechamento.`,
    '📅 Toda segunda-feira, 00h, o placar fecha, o mapa recomeça e o prêmio é pago.',
    prizeLine(),
    `👥 Recebe o prêmio quem fez pelo menos uma ação na semana (até ${WAR.prizeMembers} membros por alcateia).`,
    '💪 Sua força vem da formação: ataque e contra-ataque para atacar, defesa para reforçar. Boosts da loja contam.',
    `> 🔔 Administradores: ${prefix}guerra avisos on/off`,
  ]);
}

export function warText(result, prefix = '!') {
  switch (result.view) {
    case 'map': return mapText(result, prefix);
    case 'attack': return attackText(result, prefix);
    case 'defend': return defendText(result);
    case 'ranking': return rankingText(result, prefix);
    case 'rules': return rulesText(prefix);
    case 'announce':
      return panel('AVISOS DA GUERRA', [result.announce
        ? `🔔 Avisos ligados: o grupo será avisado quando a ${AI_NAME} atacar e quando a semana fechar.`
        : '🔕 Avisos desligados neste grupo. A guerra continua normalmente.']);
    default: throw new Error('Resposta desconhecida da guerra.');
  }
}

/** Uma única mensagem para o grupo com tudo o que aconteceu desde o último aviso. */
export function warAnnouncement(events, prefix = '!') {
  const lines = [];
  let attacked = false, closed = false;
  for (const event of events) {
    if (event.type === 'ai-attack') {
      const territory = territoryOf(event.territory);
      if (!territory || !event.owner) continue;
      attacked = true;
      lines.push(event.captured
        ? `🌑 A ${AI_NAME} tomou ${territory.emoji} ${territory.name} da alcateia ${clean(event.owner)}!`
        : `🌑 A ${AI_NAME} atacou ${territory.emoji} ${territory.name} (${clean(event.owner)}): defesa ${event.before} → ${event.after}.`);
    } else if (event.type === 'week-result') {
      closed = true;
      lines.push('🏆 _A semana de guerra terminou!_', ...podiumLines(event.summary),
        `🌑 ${AI_NAME}: ${event.summary.ai.position}º lugar`, '🗺️ O mapa recomeçou. Boa caçada!');
    }
  }
  if (!lines.length) return null;
  const tip = attacked
    ? `🛡️ Reforcem com ${prefix}guerra defender N ou revidem com ${prefix}guerra atacar N.`
    : `🗺️ Veja o novo mapa com ${prefix}guerra.`;
  return panel(closed && !attacked ? 'RESULTADO DA GUERRA' : 'AVISO DE GUERRA', [...lines, `> ${tip}`]);
}
