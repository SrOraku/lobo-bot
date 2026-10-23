import { DEV_SIGNATURE, header } from '../game/constants.js';
import { formatMenu } from '../menu-style.js';

const COMMANDS = new Set([
  'rp', 'profissoes', 'profissao', 'trabalhar', 'acao', 'carteira', 'transferir',
  'rploja', 'rpcomprar', 'usar', 'inventario', 'familia',
]);
const PAGE_SIZE = 10;

function clean(value, fallback = 'nenhum', max = 100) {
  return String(value ?? fallback).replace(/[\r\n]+/g, ' ').slice(0, max);
}

function money(value) {
  return `${Number.isFinite(value) ? value.toLocaleString('pt-BR') : '—'} WOK Coin`;
}

function frame(title, lines) {
  const contents = lines.filter(value => value !== undefined && value !== null);
  if (!contents.some(value => value.includes('WOK Coin'))) contents.push('💰 Economia compartilhada: WOK Coin.');
  return `${header(title)}\n${contents.join('\n')}`;
}

function nameOf(value, fallback = 'jogador') {
  if (!value) return fallback;
  if (typeof value === 'object') return value.name ? clean(value.name) : nameOf(value.jid || value.id, fallback);
  if (typeof value !== 'string') return fallback;
  const phone = /^55\d{10,11}@s\.whatsapp\.net$/.test(value) ? value.split('@')[0] : null;
  if (phone) return `🐺 ••••${phone.slice(-4)}`;
  if (value.includes('@')) return fallback;
  return clean(value, fallback);
}

function duration(value) {
  if (!Number.isFinite(value) || value <= 0) return 'disponível';
  const minutes = Math.ceil(value / 60_000);
  return minutes < 60 ? `${minutes}min` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`;
}

function salaryOf(job) {
  const value = job.salary ?? job.pay ?? job.reward;
  if (Number.isFinite(value)) return money(value);
  const min = value?.min ?? job.minPay ?? job.salaryMin;
  const max = value?.max ?? job.maxPay ?? job.salaryMax;
  if (Number.isFinite(min) && Number.isFinite(max)) return `${min}–${money(max)}`;
  return 'pagamento conforme resultado';
}

function effectsText(effects = {}) {
  const labels = { hunger: 'saciedade', energy: 'energia', health: 'saúde RP', reputation: 'reputação' };
  return Object.entries(effects).map(([field, amount]) => `+${amount} ${labels[field] || clean(field)}`).join(' • ');
}

function itemDescription(item) {
  if (item.description) return clean(item.description, '', 180);
  const effects = effectsText(item.effects);
  if (effects) return effects;
  if (item.type === 'home') return `Moradia de nível ${item.level || 1}; utilizada após a compra.`;
  if (item.type === 'vehicle') return `Veículo de nível ${item.level || 1}; utilizado após a compra.`;
  if (item.type === 'ring') return 'Aliança para um pedido de casamento RP.';
  return 'Item do inventário RP.';
}

function pageFooter(command, result, prefix) {
  const page = Math.max(1, result.page || 1);
  const total = Math.max(page, result.totalPages || 1);
  const filter = command === 'profissoes' && result.category ? `${clean(result.category)} ` : '';
  return [`📖 Página ${page}/${total}`, page < total ? `🐺 Próxima: ${prefix}${command} ${filter}${page + 1}` : undefined];
}

export function isRPCommand(command, args = []) {
  return COMMANDS.has(String(command || '').toLowerCase());
}

export function rpMenu(config = {}) {
  const p = config.prefix || '!';
  return formatMenu({ title: 'MENU RP DA ALCATEIA', botName: config.botName, botDescription: config.botDescription,
    ownerNumber: config.ownerNumber, subtitle: [
    '🌹 Viva sua história. Honre sua família.', '💰 A carteira WOK Coin é a mesma dos lobisomens.',
  ], signature: '', sections: [
    { title: '🐺 SUA NOVA JORNADA', lines: [
      `🌙 ${p}rp iniciar — criar personagem`, `👤 ${p}rp perfil — painel do RP`, `📜 ${p}rp menu — abrir este menu`,
    ] },
    { title: '⭐ PROFISSÕES E INFLUÊNCIA', lines: [
      `📚 ${p}profissoes [categoria] [página]`, `🎓 ${p}profissao ID/nome — carreira`,
      `⚒️ ${p}trabalhar — cumprir expediente`, `⚔️ ${p}acao [@jogador] — exercer função`,
    ] },
    { title: '💰 PATRIMÔNIO WOK COIN', lines: [
      `👛 ${p}carteira — saldo compartilhado`, `💸 ${p}transferir @jogador quantidade`,
      `🛍️ ${p}rploja [página] — catálogo`, `💳 ${p}rpcomprar ITEM [quantidade]`,
      `🎒 ${p}inventario — seus pertences`, `💎 ${p}usar ITEM [@destinatário para presentes]`,
    ] },
    { title: '🏰 DINASTIA E FAMÍLIA', lines: [
      `🌹 ${p}familia criar Nome`, `📖 ${p}familia perfil`, `🐺 ${p}familia convidar @jogador parentesco`,
      `💍 ${p}familia casar @jogador`, `✅ ${p}familia aceitar ID`, `❌ ${p}familia recusar ID`,
      `🚪 ${p}familia sair`, `🌑 ${p}familia divorciar`,
      `💰 ${p}familia depositar quantidade`, `👑 ${p}familia retirar quantidade`,
    ] },
  ] });
}

function profileText(result, at) {
  const { player, job, family } = result;
  const rp = result.rp || player.rp;
  const spouse = rp.relationship?.name || rp.relationship?.spouse || rp.relationship?.jid || rp.relationship?.partnerJid || rp.relationship;
  return frame('PERFIL RP', [
    `🐺 ${clean(player.name, 'Lobo')}`,
    `⭐ Profissão: ${job ? nameOf(job) : rp.jobId ? clean(rp.jobId) : 'nenhuma'} • XP: ${rp.experience}`,
    `⚡ Energia RP: ${rp.energy}/100 • 🍽️ Saciedade RP: ${rp.hunger}/100`,
    `💎 Saúde RP: ${rp.health}/100 • HP lobisomem: ${player.hp}/100`,
    `💰 Carteira: ${money(player.coins)}`,
    `🏆 Reputação: ${rp.reputation} • Procurado: ${rp.wanted}`,
    `⏳ Prisão: ${rp.jailedUntil > at ? duration(rp.jailedUntil - at) : 'livre'}`,
    `🌹 Família: ${family ? nameOf(family) : rp.familyId ? clean(rp.familyId) : 'nenhuma'}`,
    `💍 Cônjuge: ${nameOf(spouse, 'nenhum')}`,
    `🏠 Casa: ${nameOf(rp.home, 'nenhuma')} • 🚗 Veículo: ${nameOf(rp.vehicle, 'nenhum')}`,
  ]);
}

function jobsText(result, config) {
  const prefix = config?.prefix || '!';
  const lines = (result.jobs || []).slice(0, PAGE_SIZE).flatMap(job => [
    `⭐ ${clean(job.id)} • ${clean(job.name)} [${clean(job.category)}]`,
    `💰 ${salaryOf(job)} • ⏳ ${duration(job.cooldownMs ?? job.cooldown)}`,
    `⭐ XP mínimo: ${job.experienceRequired || 0}`,
    `🐺 ${clean(job.description, 'Consulte a profissão para conhecer sua função.', 180)}`,
  ]);
  if (!lines.length) lines.push('🐺 Nenhuma profissão encontrada para esse filtro.');
  return formatMenu({ title: 'PROFISSÕES RP', botName: config?.botName, botDescription: config?.botDescription,
    ownerNumber: config?.ownerNumber,
    subtitle: '⭐ Talento, respeito e influência', signature: '',
    sections: [{ title: '📚 CARREIRAS DA CIDADE', lines },
      { title: '🧭 ESCOLHA SEU CAMINHO', lines: [...pageFooter('profissoes', result, prefix),
        `⭐ Escolha: ${prefix}profissao ID ou nome.`, '💰 Pagamentos em WOK Coin.'] }] });
}

function shopText(result, config) {
  const prefix = config?.prefix || '!';
  const lines = (result.items || []).slice(0, PAGE_SIZE).flatMap(item => [
    `💎 ${clean(item.id)} • ${clean(item.name)}`,
    `💰 ${money(item.price)}`,
    `🐺 ${itemDescription(item)}`,
  ]);
  if (!lines.length) lines.push('🐺 Nenhum item nessa página.');
  return formatMenu({ title: 'LOJA RP', botName: config?.botName, botDescription: config?.botDescription,
    ownerNumber: config?.ownerNumber,
    subtitle: '🌹 Elegância, conforto e prestígio', signature: '',
    sections: [{ title: '🛍️ VITRINE DA ALCATEIA', lines },
      { title: '💳 ESCOLHA SEU TESOURO', lines: [...pageFooter('rploja', result, prefix),
        `💰 Comprar: ${prefix}rpcomprar ITEM [quantidade].`] }] });
}

function familyText(family) {
  const members = family.members || [];
  return frame('FAMÍLIA RP', [
    `🌹 ${clean(family.name)}`,
    `👑 Líder: ${nameOf(family.leader, 'não informado')}`,
    `🐺 Membros: ${members.length}`,
    ...members.slice(0, PAGE_SIZE).map(member => {
      const role = member.role || member.relation;
      const label = { leader: 'líder', conjuge: 'cônjuge', irmao: 'irmão' }[role] || clean(role, 'membro');
      return `🐺 ${nameOf(member)} • ${label}`;
    }),
    members.length > PAGE_SIZE ? `🐺 Exibindo ${PAGE_SIZE} de ${members.length} membros.` : undefined,
    `💰 Tesouro: ${money(family.coins)}`,
  ]);
}

/** Render only; all authorization and state changes belong to GameService. */
export async function handleRPResponse(ctx, response, at = Date.now()) {
  if (typeof response?.type !== 'string' || !response.type.startsWith('rp-')) return false;
  const p = ctx.config?.prefix || '!';
  const player = response.player;
  let text;
  switch (response.type) {
    case 'rp-menu': text = rpMenu(ctx.config); break;
    case 'rp-registered':
      text = frame('BEM-VINDO AO RP', [
        `🐺 ${clean(player.name, 'Lobo')}, sua história começou.`,
        `💰 Carteira compartilhada: ${money(player.coins)}`,
        '🌹 O RP utiliza o saldo existente, sem novo bônus de cadastro.',
        `⭐ Comece com ${p}profissoes e ${p}rp perfil.`,
      ]);
      break;
    case 'rp-profile': text = profileText(response, at); break;
    case 'rp-jobs': text = jobsText(response, ctx.config); break;
    case 'rp-job':
      text = frame('PROFISSÃO RP', [
        `⭐ ${nameOf(response.job)}`, `🐺 ${clean(response.job.description, 'Sua profissão foi atualizada.', 180)}`,
        `💰 Pagamento: ${salaryOf(response.job)} • ⏳ ${duration(response.job.cooldownMs ?? response.job.cooldown)}`,
        `⭐ XP mínimo: ${response.job.experienceRequired || 0} • Função: ${clean(response.job.roleActionName, 'ação da profissão')}`,
        `⚔️ Trabalhe com ${p}trabalhar. Ação: ${p}acao [@jogador].`,
        `💰 Carteira: ${money(player.coins)}`,
      ]);
      break;
    case 'rp-work': {
      const reward = response.reward;
      text = frame('TRABALHO RP', [
        `⭐ ${nameOf(response.job)}`, `🐺 ${clean(reward.description, reward.event === 'fine' ? 'Sua ação RP terminou em multa e prisão fictícias.' : 'Expediente concluído.', 200)}`,
        `💰 Resultado: ${money(reward.amount ?? reward.coinChange ?? reward.salary)} • XP: +${reward.xp ?? reward.experienceGain ?? 0}`,
        reward.fine ? `⚔️ Multa RP: ${money(reward.fine)}` : undefined,
        reward.jailedUntil > at ? `⏳ Prisão RP: ${duration(reward.jailedUntil - at)}` : undefined,
        `💰 Carteira: ${money(player.coins)}`,
      ]);
      break;
    }
    case 'rp-action': {
      const result = response.result;
      text = frame('AÇÃO RP', [
        `⭐ ${nameOf(response.job)}`, `🐺 ${clean(result.message, 'Ação concluída.', 300)}`,
        Number.isFinite(result.amount ?? result.coinChange) ? `💰 Resultado: ${money(result.amount ?? result.coinChange)}` : undefined,
        result.experienceGain ? `⭐ XP: +${result.experienceGain}` : undefined,
        result.healthGain ? `💎 Saúde RP recuperada: +${result.healthGain}` : undefined,
        result.wantedReduction ? `⚔️ Procura RP reduzida em ${result.wantedReduction}.` : undefined,
        result.reputationGain ? `🏆 Reputação: +${result.reputationGain}` : undefined,
        result.fine ? `⚔️ Multa RP: ${money(result.fine)}` : undefined,
        result.jailedUntil > at ? `⏳ Prisão RP: ${duration(result.jailedUntil - at)}` : undefined,
        `💰 Carteira: ${money(player.coins)}`,
      ]);
      break;
    }
    case 'rp-wallet': text = frame('CARTEIRA WOK', [`🐺 ${nameOf(player)}`, `💰 Saldo: ${money(player.coins)}`, '🌹 Carteira única do RP e dos lobisomens.']); break;
    case 'rp-transfer': text = frame('TRANSFERÊNCIA WOK', [`🐺 Destinatário: ${nameOf(response.target)}`, `💰 Transferido: ${money(response.amount)}`, `💰 Seu saldo: ${money(player.coins)}`]); break;
    case 'rp-shop': text = shopText(response, ctx.config); break;
    case 'rp-purchase':
      text = frame('COMPRA RP', [`💎 ${nameOf(response.result.item)} × ${response.result.quantity}`, `💰 Total: ${money(response.result.totalCost)}`, `💰 Carteira: ${money(player.coins)}`]);
      break;
    case 'rp-use':
      text = frame('ITEM RP', [`💎 ${nameOf(response.result.item)}`,
        `🐺 ${clean(response.result.message, effectsText(response.result.effects) || 'Item utilizado.', 250)}`,
        Number.isFinite(response.result.remaining) ? `💎 Restam: ${response.result.remaining}` : undefined,
        `💰 Carteira: ${money(player.coins)}`]);
      break;
    case 'rp-inventory': {
      const rp = response.rp || player.rp;
      const entries = Object.entries(rp.inventory || {}).filter(([, count]) => count > 0);
      text = frame('INVENTÁRIO RP', [
        ...(entries.length ? entries.slice(0, PAGE_SIZE).map(([id, count]) => `💎 ${clean(id)} × ${count}`) : ['🐺 Seu inventário está vazio.']),
        entries.length > PAGE_SIZE ? `🐺 Exibindo ${PAGE_SIZE} de ${entries.length} tipos de item.` : undefined,
        `💰 Carteira: ${money(player.coins)}`, `💎 Use ${p}usar ITEM.`,
      ]);
      break;
    }
    case 'rp-family': text = familyText(response.family); break;
    case 'rp-invite':
      text = frame((response.invite.type || response.invite.kind) === 'marriage' ? 'PEDIDO DE CASAMENTO RP' : 'CONVITE DE FAMÍLIA RP', [
        `🐺 Para: ${nameOf(response.target)}`,
        response.invite.relation ? `🌹 Parentesco: ${clean(response.invite.relation)}` : undefined,
        `⭐ Convite: ${clean(response.invite.id)}`,
        `🐺 ${p}familia aceitar ${clean(response.invite.id)}`,
        `🌹 ${p}familia recusar ${clean(response.invite.id)}`,
        `⏳ Expira em ${duration(response.invite.expiresAt - at)}.`,
      ]);
      break;
    case 'rp-family-response':
      text = frame('FAMÍLIA RP', [
        `🌹 ${response.accepted ? 'Convite aceito.' : 'Convite recusado.'}`,
        response.accepted && response.marriage ? '💍 Casamento RP confirmado.' : undefined,
        response.family ? `🐺 Família: ${clean(response.family.name)}` : undefined,
        response.message ? `🐺 ${clean(response.message, '', 200)}` : undefined,
      ]);
      break;
    case 'rp-family-left':
      text = frame('FAMÍLIA RP', [
        `🌹 ${clean(response.message, response.action === 'divorce' ? 'Divórcio RP concluído.' : 'Saída da família concluída.', 250)}`,
        response.refunded ? `💰 Tesouro devolvido à carteira: ${money(response.refunded)}` : undefined,
        response.newLeader ? `👑 Nova liderança: ${nameOf(response.newLeader)}` : undefined,
      ]);
      break;
    case 'rp-family-bank':
      text = frame('TESOURO DA FAMÍLIA RP', [
        `🌹 ${clean(response.family.name)}`,
        `💰 ${['withdraw', 'retirar'].includes(response.action) ? 'Retirada' : 'Depósito'}: ${money(response.amount)}`,
        `💰 Tesouro: ${money(response.family.coins)} • Carteira: ${money(player.coins)}`,
      ]);
      break;
    default: return false;
  }
  await ctx.reply(text);
  return true;
}
