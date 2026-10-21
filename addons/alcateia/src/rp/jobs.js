import { GameError, integer, formatRemaining } from '../game/validation.js';
import { assertPlayable } from '../game/players.js';
import { credit, debit } from '../game/wallet.js';
import { ensureRP } from './state.js';

const HOUR = 3_600_000;
const ACTION_COOLDOWN = 300_000;
const JAIL_TIME = 600_000;

// These are character careers inside the RP game. Their actions never confer
// WhatsApp moderation privileges or authority over another player's wallet.
const CAREERS = [
  ['medico', 'Médico', 'Saúde', 90, 100, 'tratar', 'Consulta fictícia recupera 20 de saúde RP por 20 WOK Coin.'],
  ['enfermeiro', 'Enfermeiro', 'Saúde', 60, 20, 'cuidar', 'Cuidado fictício recupera 20 de saúde RP por 20 WOK Coin.'],
  ['paramedico', 'Paramédico', 'Saúde', 65, 40, 'socorrer', 'Atendimento de personagem recupera 20 de saúde RP por 20 WOK Coin.'],
  ['dentista', 'Dentista', 'Saúde', 85, 100, 'consultar', 'Consulta de personagem recupera 20 de saúde RP por 20 WOK Coin.'],
  ['psicologo', 'Psicólogo', 'Saúde', 75, 80, 'acolher', 'Acolhimento de personagem recupera 20 de saúde RP por 20 WOK Coin.'],
  ['farmaceutico', 'Farmacêutico', 'Saúde', 70, 60, 'orientar', 'Atendimento fictício recupera 20 de saúde RP por 20 WOK Coin.'],
  ['veterinario', 'Veterinário', 'Saúde', 80, 80, 'atender', 'Cena de clínica recupera 20 de saúde RP por 20 WOK Coin.'],
  ['advogado', 'Advogado', 'Justiça', 85, 100, 'recurso', 'Recurso fictício reduz sua própria procura em 1 por 40 WOK Coin.'],
  ['juiz', 'Juiz', 'Justiça', 115, 300, 'julgar', 'Revisão fictícia reduz sua própria procura em 1 por 40 WOK Coin.'],
  ['promotor', 'Promotor', 'Justiça', 95, 180, 'parecer', 'Parecer fictício reduz sua própria procura em 1 por 40 WOK Coin.'],
  ['defensor', 'Defensor público', 'Justiça', 80, 80, 'defender', 'Defesa fictícia reduz sua própria procura em 1 por 40 WOK Coin.'],
  ['policial', 'Policial', 'Segurança', 70, 50, 'patrulhar', 'Patrulha simulada rende 10 WOK Coin e experiência; não prende outros jogadores.'],
  ['guarda', 'Guarda municipal', 'Segurança', 55, 20, 'patrulhar', 'Ronda simulada rende 10 WOK Coin e experiência; não modifica grupos.'],
  ['bombeiro', 'Bombeiro', 'Segurança', 70, 50, 'resgatar', 'Missão fictícia de resgate rende experiência e reputação.'],
  ['detetive', 'Detetive', 'Segurança', 85, 100, 'investigar', 'Mistério fictício resolvido rende experiência e reputação.'],
  ['seguranca', 'Segurança privado', 'Segurança', 45, 0, 'proteger', 'Missão de proteção de cenário rende experiência e reputação.'],
  ['professor', 'Professor', 'Educação', 65, 30, 'ensinar', 'Aula rende experiência e concede 2 XP ao aluno de RP.'],
  ['diretor', 'Diretor escolar', 'Educação', 90, 150, 'planejaraula', 'Planejamento de uma escola fictícia rende experiência e reputação.'],
  ['pesquisador', 'Pesquisador', 'Educação', 85, 100, 'pesquisar', 'Descoberta de cenário rende experiência e reputação.'],
  ['bibliotecario', 'Bibliotecário', 'Educação', 45, 0, 'catalogar', 'Organização do acervo fictício rende experiência e reputação.'],
  ['programador', 'Programador', 'Tecnologia', 80, 50, 'programar', 'Entrega fictícia de software rende experiência e reputação.'],
  ['analista', 'Analista de sistemas', 'Tecnologia', 85, 80, 'analisar', 'Análise fictícia de projeto rende experiência e reputação.'],
  ['suporte', 'Técnico de suporte', 'Tecnologia', 45, 0, 'diagnosticar', 'Atendimento fictício rende experiência e reputação.'],
  ['designer', 'Designer', 'Tecnologia', 65, 30, 'desenhar', 'Peça visual fictícia rende experiência e reputação.'],
  ['cientistadedados', 'Cientista de dados', 'Tecnologia', 100, 150, 'modelar', 'Estudo fictício de dados rende experiência e reputação.'],
  ['cozinheiro', 'Cozinheiro', 'Serviços', 45, 0, 'cozinhar', 'Missão de restaurante fictício rende experiência e reputação.'],
  ['padeiro', 'Padeiro', 'Serviços', 40, 0, 'assar', 'Fornada de cenário rende experiência e reputação.'],
  ['garcom', 'Garçom', 'Serviços', 30, 0, 'servir', 'Atendimento fictício rende experiência e reputação.'],
  ['barbeiro', 'Barbeiro', 'Serviços', 45, 0, 'cortar', 'Atendimento de personagem rende experiência e reputação.'],
  ['mecanico', 'Mecânico', 'Serviços', 60, 30, 'reparar', 'Oficina fictícia rende experiência e reputação.'],
  ['eletricista', 'Eletricista', 'Serviços', 60, 30, 'instalar', 'Contrato fictício de manutenção rende experiência e reputação.'],
  ['encanador', 'Encanador', 'Serviços', 55, 20, 'consertar', 'Contrato fictício de manutenção rende experiência e reputação.'],
  ['vendedor', 'Vendedor', 'Serviços', 40, 0, 'negociar', 'Venda de cenário rende experiência e reputação.'],
  ['contador', 'Contador', 'Serviços', 75, 60, 'auditar', 'Relatório fictício rende experiência e reputação.'],
  ['motorista', 'Motorista', 'Transporte', 40, 0, 'transportar', 'Viagem fictícia rende experiência e reputação.'],
  ['taxista', 'Taxista', 'Transporte', 45, 0, 'corrida', 'Corrida de cenário rende experiência e reputação.'],
  ['piloto', 'Piloto', 'Transporte', 110, 200, 'voar', 'Voo fictício rende experiência e reputação.'],
  ['entregador', 'Entregador', 'Transporte', 25, 0, 'entregar', 'Entrega de cenário rende experiência e reputação.'],
  ['maquinista', 'Maquinista', 'Transporte', 70, 50, 'conduzir', 'Percurso fictício rende experiência e reputação.'],
  ['pedreiro', 'Pedreiro', 'Construção', 45, 0, 'construir', 'Obra de cenário rende experiência e reputação.'],
  ['engenheiro', 'Engenheiro', 'Construção', 100, 150, 'projetar', 'Projeto fictício rende experiência e reputação.'],
  ['arquiteto', 'Arquiteto', 'Construção', 90, 100, 'planejarobra', 'Maquete fictícia rende experiência e reputação.'],
  ['pintor', 'Pintor', 'Construção', 40, 0, 'pintar', 'Pintura de cenário rende experiência e reputação.'],
  ['agricultor', 'Agricultor', 'Rural', 40, 0, 'colher', 'Colheita fictícia rende experiência e reputação.'],
  ['pecuarista', 'Pecuarista', 'Rural', 55, 20, 'cuidarrebanho', 'Cuidado fictício de rebanho rende experiência e reputação.'],
  ['pescador', 'Pescador', 'Rural', 35, 0, 'pescar', 'Pescaria de cenário rende experiência e reputação.'],
  ['jardineiro', 'Jardineiro', 'Rural', 35, 0, 'cultivar', 'Jardim fictício rende experiência e reputação.'],
  ['musico', 'Músico', 'Artes', 55, 20, 'tocar', 'Apresentação fictícia rende experiência e reputação.'],
  ['ator', 'Ator', 'Artes', 65, 40, 'atuar', 'Cena artística rende experiência e reputação.'],
  ['artesao', 'Artesão', 'Artes', 40, 0, 'criar', 'Peça fictícia rende experiência e reputação.'],
  ['jornalista', 'Jornalista', 'Artes', 65, 40, 'reportar', 'Notícia do cenário rende experiência e reputação.'],
  ['fotografo', 'Fotógrafo', 'Artes', 55, 20, 'fotografar', 'Ensaio de cenário rende experiência e reputação.'],
  ['vereador', 'Vereador', 'Política', 85, 200, 'projeto', 'Projeto fictício rende experiência e reputação pessoal.'],
  ['prefeito', 'Prefeito', 'Política', 100, 300, 'projeto', 'Projeto fictício rende experiência e reputação pessoal.'],
  ['deputado', 'Deputado', 'Política', 105, 350, 'projeto', 'Projeto fictício rende experiência e reputação pessoal.'],
  ['governador', 'Governador', 'Política', 115, 400, 'projeto', 'Projeto fictício rende experiência e reputação pessoal.'],
  ['presidente', 'Presidente', 'Política', 120, 500, 'projeto', 'Projeto fictício rende experiência e reputação pessoal.'],
  ['ministro', 'Ministro', 'Política', 110, 350, 'projeto', 'Projeto fictício rende experiência e reputação pessoal.'],
  ['mafioso', 'Mafioso fictício', 'Ilegal', 95, 100, 'cena', 'Cena narrativa sorteada; pode gerar multa e prisão fictícias.'],
  ['contrabandista', 'Contrabandista fictício', 'Ilegal', 90, 80, 'cena', 'Cena narrativa sorteada; não contém instruções reais.'],
  ['ladrao', 'Ladrão fictício', 'Ilegal', 65, 0, 'cena', 'Cena sorteada; nunca subtrai o saldo de outro jogador.'],
  ['falsificador', 'Falsificador fictício', 'Ilegal', 85, 60, 'cena', 'Cena sorteada; não produz documentos nem instruções reais.'],
  ['apostador', 'Apostador fictício', 'Ilegal', 60, 0, 'cena', 'Sorteio de personagem, sem dinheiro real nem apostas externas.'],
  ['gangster', 'Gângster fictício', 'Ilegal', 80, 50, 'cena', 'Cena narrativa sorteada; efeitos apenas no próprio personagem.'],
];

export const JOBS = Object.freeze(CAREERS.map(([id, name, category, salary, experienceRequired, roleActionName, actionDescription]) =>
  Object.freeze({ id, name, category, description: `Carreira de personagem: ${name}. ${actionDescription}`,
    salary, cooldownMs: HOUR, experienceRequired, illegal: category === 'Ilegal', roleActionName, actionDescription })));

function key(value) { return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s_-]+/g, ''); }

export function listJobs(category) {
  if (category === undefined || category === null || category === '') return [...JOBS];
  return JOBS.filter(job => key(job.category) === key(category));
}

export function getJob(id) {
  const job = JOBS.find(entry => key(entry.id) === key(id) || key(entry.name) === key(id));
  if (!job) throw new GameError('Profissão inválida. Consulte as profissões do RP.');
  return job;
}

function ready(player, now) {
  assertPlayable(player);
  integer(now, { max: Number.MAX_SAFE_INTEGER - HOUR, label: 'Data' });
  const rp = ensureRP(player, now);
  for (const field of ['energy', 'hunger', 'health']) integer(rp[field], { max: 100, label: field });
  integer(rp.experience, { label: 'Experiência' });
  integer(rp.wanted ?? 0, { max: 100, label: 'Procura' });
  integer(rp.reputation ?? 0, { label: 'Reputação' });
  if (rp.jailedUntil !== null && rp.jailedUntil !== undefined && integer(rp.jailedUntil, { label: 'Prisão' }) > now) {
    throw new GameError(`Seu personagem está em prisão fictícia. Aguarde ${formatRemaining(rp.jailedUntil - now)}.`, 'RP_JAILED');
  }
  if (rp.health <= 0) throw new GameError('Seu personagem está sem saúde RP. Use um remédio da loja RP.', 'RP_HEALTH');
  return rp;
}

function advance(value, amount, label) { return integer(value + amount, { label }); }
function touch(player, now) { player.rp.updatedAt = now; player.updatedAt = now; }

function random(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new GameError('Sorteio de RP inválido.');
  return value;
}

export function chooseJob(player, id, now = Date.now()) {
  const job = getJob(id);
  const rp = ready(player, now);
  if (rp.experience < job.experienceRequired) throw new GameError(`Essa carreira exige ${job.experienceRequired} XP. Você possui ${rp.experience}.`, 'RP_EXPERIENCE');
  rp.jobId = job.id;
  // A career change intentionally preserves the work and role-action cooldowns.
  touch(player, now);
  return { job, rp };
}

export function work(player, { now = Date.now(), rng = Math.random } = {}) {
  const rp = ready(player, now);
  if (!rp.jobId) throw new GameError('Escolha uma profissão antes de trabalhar.', 'RP_JOB');
  const job = getJob(rp.jobId);
  if (rp.experience < job.experienceRequired) throw new GameError('Sua experiência ainda não permite essa carreira.');
  if (rp.lastWork !== null && rp.lastWork !== undefined && now - rp.lastWork < job.cooldownMs) {
    throw new GameError(`Aguarde ${formatRemaining(job.cooldownMs - (now - rp.lastWork))} para trabalhar.`, 'COOLDOWN');
  }
  if (rp.energy < 15 || rp.hunger < 10) throw new GameError('Para trabalhar, tenha ao menos 15 de energia e 10 de saciedade RP.', 'RP_NEEDS');
  const experience = advance(rp.experience, 10, 'Experiência');
  const caught = job.illegal && random(rng) < 0.25;
  const coinChange = caught ? -Math.min(20, player.coins) : job.salary;
  if (coinChange < 0) debit(player, -coinChange);
  else credit(player, coinChange);
  rp.experience = experience;
  rp.energy -= 10;
  rp.hunger -= 10;
  rp.lastWork = now;
  if (job.illegal) rp.wanted = Math.min(100, (rp.wanted ?? 0) + 1);
  rp.jailedUntil = caught ? now + JAIL_TIME : rp.jailedUntil ?? null;
  touch(player, now);
  return { job, salary: caught ? 0 : job.salary, coinChange, experienceGain: 10,
    energy: rp.energy, hunger: rp.hunger, event: caught ? 'fine' : job.illegal ? 'fictional-success' : 'salary',
    wanted: rp.wanted ?? 0, jailedUntil: rp.jailedUntil };
}

function targetRP(player, target, now) {
  const recipient = target || player;
  assertPlayable(recipient);
  if (!recipient.rp) throw new GameError('O alvo precisa iniciar seu próprio personagem RP primeiro.');
  const rp = ensureRP(recipient, now);
  for (const field of ['health', 'experience']) integer(rp[field], { max: field === 'health' ? 100 : Number.MAX_SAFE_INTEGER, label: field });
  return { recipient, rp };
}

export function performJobAction(player, action, target, { now = Date.now(), rng = Math.random } = {}) {
  const rp = ready(player, now);
  if (!rp.jobId) throw new GameError('Escolha uma profissão antes de usar sua função.');
  const job = getJob(rp.jobId);
  if (rp.experience < job.experienceRequired) throw new GameError('Sua experiência ainda não permite exercer essa função.');
  const aliases = job.category === 'Saúde' ? ['tratar'] : job.category === 'Justiça' ? ['recurso'] : [];
  if (![job.roleActionName, ...aliases].some(name => key(action) === key(name))) throw new GameError(`Sua função de ${job.name} é ${job.roleActionName}.`);
  if (rp.lastJobAction !== null && rp.lastJobAction !== undefined && now - rp.lastJobAction < ACTION_COOLDOWN) {
    throw new GameError(`Aguarde ${formatRemaining(ACTION_COOLDOWN - (now - rp.lastJobAction))} para outra função.`, 'COOLDOWN');
  }
  if (rp.energy < 10) throw new GameError('Você precisa de 10 de energia para exercer sua função.');
  const acceptsTarget = job.category === 'Saúde' || job.id === 'professor';
  if (target && target.jid !== player.jid && !acceptsTarget) throw new GameError('Essa função afeta somente o seu próprio personagem.');
  let experience = advance(rp.experience, 5, 'Experiência');
  const result = { job, action: job.roleActionName, coinChange: 0, experienceGain: 5, message: job.actionDescription };

  if (job.category === 'Saúde') {
    const { recipient, rp: receiving } = targetRP(player, target, now);
    const amount = Math.min(20, 100 - receiving.health);
    if (!amount) throw new GameError('Esse personagem já está com a saúde RP completa.');
    debit(player, 20);
    receiving.health += amount;
    touch(recipient, now);
    Object.assign(result, { coinChange: -20, targetJid: recipient.jid, healthGain: amount });
  } else if (job.category === 'Justiça') {
    if (!(rp.wanted > 0)) throw new GameError('Seu personagem não tem procura fictícia para recorrer.');
    debit(player, 40);
    rp.wanted--;
    Object.assign(result, { coinChange: -40, wantedReduction: 1 });
  } else if (['policial', 'guarda'].includes(job.id)) {
    credit(player, 10);
    result.coinChange = 10;
  } else if (job.id === 'professor') {
    const { recipient, rp: receiving } = targetRP(player, target, now);
    const targetExperience = advance(receiving.experience, 2, 'Experiência do aluno');
    if (recipient.jid === player.jid) experience = advance(experience, 2, 'Experiência');
    else { receiving.experience = targetExperience; touch(recipient, now); }
    Object.assign(result, { targetJid: recipient.jid, targetExperienceGain: 2 });
  } else if (job.illegal) {
    const caught = random(rng) < 0.25;
    const change = caught ? -Math.min(20, player.coins) : 20;
    if (change < 0) debit(player, -change);
    else credit(player, change);
    rp.wanted = Math.min(100, (rp.wanted ?? 0) + 1);
    rp.jailedUntil = caught ? now + JAIL_TIME : rp.jailedUntil ?? null;
    Object.assign(result, { coinChange: change, event: caught ? 'fine' : 'fictional-success', wanted: rp.wanted, jailedUntil: rp.jailedUntil });
  } else {
    rp.reputation = advance(rp.reputation ?? 0, 1, 'Reputação');
    result.reputationGain = 1;
  }
  rp.experience = experience;
  rp.energy -= 10;
  rp.lastJobAction = now;
  touch(player, now);
  return result;
}
