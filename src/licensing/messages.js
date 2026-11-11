'use strict';
// Textos da licença para o console e para o dono. Ficam separados para que
// o supervisor (console) e o runtime (WhatsApp) digam a mesma coisa.

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(deadline) - now) / DAY_MS));
}

function dateLabel(deadline) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Number(deadline)));
}

const HOW_TO = 'Coloque a chave em LOBO_LICENSE_KEY (arquivo .env ou variáveis do painel da hospedagem) e reinicie o bot.';
const WHO = 'Ainda não tem a chave? Peça a quem forneceu o bot.';

// Linhas para o console enquanto a instalação está no período de aviso.
function noticeLines(deadline, now = Date.now()) {
  const days = daysLeft(deadline, now);
  return [
    `Este bot está sem chave de licença. Ele continua funcionando por mais ${days} dia${days === 1 ? '' : 's'} (até ${dateLabel(deadline)}).`,
    'Depois dessa data ele não inicia mais sem uma licença válida.',
    HOW_TO,
    WHO,
  ];
}

// Mensagem enviada ao dono pelo WhatsApp durante o período de aviso.
function ownerNotice(deadline, { now = Date.now(), prefix = '!' } = {}) {
  const days = daysLeft(deadline, now);
  return [
    '⚠️ *LICENÇA PENDENTE*',
    `Este bot está sem chave de licença e para de iniciar em *${days} dia${days === 1 ? '' : 's'}* (${dateLabel(deadline)}).`,
    HOW_TO,
    `Ainda não tem a chave? Fale com o criador: *${prefix}criador*`,
  ].join('\n');
}

// Só os motivos conhecidos ganham explicação; os demais aparecem como o painel enviou.
const REASONS = Object.freeze({
  credencial_invalida: 'a chave não existe no painel ou foi digitada errada',
  licenca_nao_autorizada: 'o painel não autorizou esta licença',
});

// Explicação de uma falha de licença na inicialização ou na verificação periódica.
function failureLines(error) {
  const code = String(error?.code || '');
  const reason = error?.reason ? String(error.reason) : '';
  switch (code) {
    case 'LOBO_LICENSE_REQUIRED':
      return ['Este bot precisa de uma licença válida para iniciar; o período de aviso terminou.', HOW_TO, WHO];
    case 'LOBO_LICENSE_DENIED':
    case 'LOBO_LICENSE_REQUEST_REJECTED':
      return [
        `O painel de licenças recusou esta instalação${reason ? ` (${reason}${REASONS[reason] ? ': ' + REASONS[reason] : ''})` : ''}.`,
        'Confira a chave em LOBO_LICENSE_KEY e a situação da licença com quem forneceu o bot.',
      ];
    case 'LOBO_LICENSE_GRACE_EXPIRED':
      return ['Não foi possível falar com o painel de licenças e a tolerância de 24 horas sem confirmação acabou.', 'Verifique a internet da hospedagem; o bot volta sozinho quando o painel responder.'];
    case 'LOBO_LICENSE_URL_NOT_OFFICIAL':
    case 'LOBO_LICENSE_URL_INVALID':
    case 'LOBO_LICENSE_HTTPS_REQUIRED':
      return ['LOBO_API_URL não aponta para o painel oficial de licenças.', 'Apague essa variável (o endereço oficial já vem no bot) e reinicie.'];
    default:
      return [];
  }
}

module.exports = { DAY_MS, daysLeft, dateLabel, noticeLines, ownerNotice, failureLines };
