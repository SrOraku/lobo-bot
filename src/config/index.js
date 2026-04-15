'use strict';

// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — CONFIGURAÇÃO CENTRAL
// Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺
// ============================================================

const DEFAULTS = {
  BOT_NAME:              '🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾',
  DEVELOPER_NAME:        '🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺',
  DEVELOPER_CONTACT:     '+55 43 92003-0769 | +55 43 99637-5955',
  PREFIX:                '!',
  SESSION_NAME:          'lobo-bot-session',
  LOG_LEVEL:             'info',
  GOLD_START:            '500',
  XP_PER_MESSAGE:        '5',
  XP_PREMIUM_MULTIPLIER: '2',
  BATTLE_TIMEOUT:        '60',
  INACTIVITY_DAYS:       '7',
  ANTILINK_MODE:         'delete',
  NODE_ENV:              'production',
  MAX_RECONNECT:         '10',
  CMD_COOLDOWN_MS:       '1500',
  XP_COOLDOWN_SEC:       '30',
};

const SCHEMA = {
  BOT_OWNER:             { required: true,  type: 'phone',  desc: 'Número do dono (ex: 5543999999999)' },
  BOT_NAME:              { required: false, type: 'string', desc: 'Nome do bot' },
  DEVELOPER_NAME:        { required: false, type: 'string', desc: 'Nick do desenvolvedor' },
  DEVELOPER_CONTACT:     { required: false, type: 'string', desc: 'Contato do desenvolvedor' },
  PREFIX:                { required: false, type: 'string', desc: 'Prefixo dos comandos' },
  SESSION_NAME:          { required: false, type: 'string', desc: 'Nome da sessão' },
  LOG_LEVEL:             { required: false, type: 'enum',   values: ['info','debug','warn','error'], desc: 'Nível de log' },
  GOLD_START:            { required: false, type: 'number', min: 0, max: 99999,  desc: 'Gold inicial' },
  XP_PER_MESSAGE:        { required: false, type: 'number', min: 1, max: 100,    desc: 'XP por mensagem' },
  XP_PREMIUM_MULTIPLIER: { required: false, type: 'number', min: 1, max: 10,     desc: 'Multiplicador premium' },
  BATTLE_TIMEOUT:        { required: false, type: 'number', min: 10, max: 3600,  desc: 'Cooldown de batalha (s)' },
  INACTIVITY_DAYS:       { required: false, type: 'number', min: 1, max: 365,    desc: 'Dias de inatividade' },
  CMD_COOLDOWN_MS:       { required: false, type: 'number', min: 0, max: 10000,  desc: 'Cooldown de comandos (ms)' },
  REDIS_URL:             { required: false, type: 'string', desc: 'URL Redis (opcional)' },
  YOUTUBE_API_KEY:       { required: false, type: 'string', desc: 'YouTube API Key (opcional)' },
};

function validate() {
  const errors = [];
  const warnings = [];

  // Aplicar defaults
  for (const [key, val] of Object.entries(DEFAULTS)) {
    if (!process.env[key]) process.env[key] = val;
  }

  // Validar schema
  for (const [key, rule] of Object.entries(SCHEMA)) {
    const val = process.env[key];

    if (rule.required && !val) {
      errors.push(`❌ Variável obrigatória ausente: ${key} — ${rule.desc}`);
      continue;
    }
    if (!val) continue;

    if (rule.type === 'phone') {
      if (!/^\d{10,15}$/.test(val)) {
        errors.push(`❌ ${key} inválido: "${val}" — deve conter apenas dígitos (ex: 5543999999999)`);
      }
    }
    if (rule.type === 'number') {
      const n = Number(val);
      if (isNaN(n)) errors.push(`❌ ${key} deve ser um número. Recebido: "${val}"`);
      else if (rule.min !== undefined && n < rule.min) warnings.push(`⚠️ ${key}=${n} abaixo do mínimo recomendado (${rule.min})`);
      else if (rule.max !== undefined && n > rule.max) warnings.push(`⚠️ ${key}=${n} acima do máximo recomendado (${rule.max})`);
    }
    if (rule.type === 'enum' && !rule.values.includes(val)) {
      errors.push(`❌ ${key}="${val}" inválido. Valores aceitos: ${rule.values.join(', ')}`);
    }
  }

  return { errors, warnings, ok: errors.length === 0 };
}

function get(key) {
  return process.env[key] ?? DEFAULTS[key] ?? '';
}

function getNumber(key) {
  return Number(process.env[key] ?? DEFAULTS[key] ?? 0);
}

function getBool(key) {
  const v = (process.env[key] ?? '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

module.exports = { validate, get, getNumber, getBool, DEFAULTS };
