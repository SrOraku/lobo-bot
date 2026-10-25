'use strict';
const { CATEGORIES } = require('../menus/catalog');
const { frameMenu } = require('../menus/render');
const { command, block } = require('../ui/text');
const DETAILS = {
  jogos: 'Minijogos, partidas salvas e placar por chat.',
  alcateia: 'Lobisomens, treino, formação, batalhas, clãs e eventos.',
  midia: 'Busca e download de áudio e vídeo; depende da plataforma.',
  adm: 'Moderação e configurações: administradores e donos.',
  dono: 'Manutenção e administração exclusiva dos donos.',
  util: 'Utilidades instaladas para o dia a dia.',
  figurinhas: 'Criação e conversão de figurinhas.',
  pesquisa: 'Buscas externas disponíveis na instalação.',
  ia: 'Categoria reservada às integrações de IA instaladas.',
  diversao: 'Brincadeiras e interações sociais.',
  grupo: 'Informações, regras e recursos coletivos.',
  info: 'Versão, ping, tempo online e informações do bot.',
  ferramentas: 'Categoria reservada às ferramentas instaladas.',
  rp: 'Profissões, personagem, família, inventário e progressão.',
  economia: 'Carteiras, lojas, recompensas e transferências.',
  seguranca: 'Confiança, auditoria e proteções administrativas do grupo.',
  trabalho: 'Carreira, profissões e progresso profissional.',
  conquistas: 'Objetivos, troféus e recompensas do jogador.',
  gartic: 'Rodadas de desenho, pistas e adivinhação em grupo.',
};
async function sectors(sock, ctx) {
  const p = require('../config').get('PREFIX');
  return sock.sendMessage(ctx.jid, { text: frameMenu('🧭 SETORES DO BOT', [
    '_Painel informativo. Setores permanecem disponíveis e não possuem botão de desligar._',
    Object.entries(CATEGORIES).map(([id, title]) => block(title, [`${command(p + 'menu ' + id)}\n_${DETAILS[id]}_`])).join('\n'),
    '🛡️ _Cada comando mantém suas permissões, registro e cooldowns._\n> Proteções opcionais do grupo: ' + command(p + 'ativacoes') + '.',
  ]) }, { quoted: ctx.msg });
}
module.exports = { sectors };
