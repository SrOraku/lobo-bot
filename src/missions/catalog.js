'use strict';

// Rewards are fixed virtual amounts. No message-count objective or money conversion.
const MISSIONS = Object.freeze([
  { id: 'd-jogos', period: 'daily', name: 'Dois desafios da matilha', description: 'Conclua dois minijogos.', kind: 'arcade_complete', target: 2, coins: 40, xp: 20 },
  { id: 'd-treino', period: 'daily', name: 'Formação em dia', description: 'Conclua um treino da Alcateia Estratégica.', kind: 'training', target: 1, coins: 25, xp: 15 },
  { id: 'd-trabalho', period: 'daily', name: 'Expediente na cidade', description: 'Conclua um expediente da profissão RP.', kind: 'rp_work', target: 1, coins: 30, xp: 20 },
  { id: 's-jogos', period: 'weekly', name: 'Explorador dos desafios', description: 'Conclua dez minijogos na semana.', kind: 'arcade_complete', target: 10, coins: 120, xp: 70 },
  { id: 's-conhecimento', period: 'weekly', name: 'Trilha do conhecimento', description: 'Conclua três rodadas completas de quiz.', kind: 'quiz_complete', target: 3, coins: 90, xp: 50 },
  { id: 's-cidade', period: 'weekly', name: 'Compromisso com a cidade', description: 'Conclua cinco expedientes da profissão RP.', kind: 'rp_work', target: 5, coins: 100, xp: 60 },
  { id: 's-aventuras', period: 'weekly', name: 'Histórias sob a lua', description: 'Conclua duas aventuras com vitória.', kind: 'adventure_complete', target: 2, coins: 100, xp: 60 },
].map(item => Object.freeze(item)));

const EVENT_KINDS = Object.freeze(['arcade_complete', 'adventure_complete', 'quiz_complete', 'training', 'rp_work', 'expedition_complete', 'project_contribution']);
const LIMITS = Object.freeze({ dailyCoins: 95, dailyXP: 55, weeklyCoins: 410, weeklyXP: 240 });

module.exports = { MISSIONS, EVENT_KINDS, LIMITS };
