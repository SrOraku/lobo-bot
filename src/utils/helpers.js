'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — HELPERS
// Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺
// +55 43 92003-0769 | +55 43 99637-5955
// ============================================================

require('dotenv').config();
const chalk = require('chalk');
const pino  = require('pino');

const BOT_NAME = process.env.BOT_NAME  || '🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾';
const PREFIX   = process.env.PREFIX    || '!';
const OWNER    = process.env.BOT_OWNER || '';
const DEV_NAME = process.env.DEVELOPER_NAME    || '🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺';
const DEV_TEL  = process.env.DEVELOPER_CONTACT || '+55 43 92003-0769 | +55 43 99637-5955';

// ── Logger simples (sem depender de config/logger para evitar circular) ──
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }
  }
});

// ── Formatadores ─────────────────────────────────────────────
function formatNumber(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatDate(d) {
  try { return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return String(d); }
}

// ── JID helpers ──────────────────────────────────────────────
function cleanJid(jid) {
  return jid ? jid.replace(/:[0-9]+@/, '@') : '';
}

function getNumber(jid) {
  return jid ? jid.split('@')[0].replace(/\D/g, '') : '';
}

function toJid(number) {
  const c = String(number).replace(/\D/g, '');
  return c.includes('@') ? c : `${c}@s.whatsapp.net`;
}

function mention(jid) {
  return `@${getNumber(jid)}`;
}

function isBrazilianFake(number) {
  const n = String(number).replace(/\D/g, '');
  return n.startsWith('55') && n.length === 12;
}

// ── Misc ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function progressBar(value, max, size = 10) {
  const filled = Math.min(size, Math.round((value / max) * size));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function wolvesBar(alive, total = 100) {
  const pct  = alive / total;
  const bar  = progressBar(alive, total, 15);
  const icon = pct <= 0 ? '💀' : pct <= 0.25 ? '🩸' : pct <= 0.5 ? '🌙' : pct <= 0.75 ? '🌹' : '🐺';
  return `${icon} ${bar} *${alive}/${total}*`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function validateStrategy(attack, defense, counter) {
  if ([attack, defense, counter].some(v => isNaN(v) || v < 0))
    return { valid: false, error: 'Valores não podem ser negativos!' };
  if ([attack, defense, counter].some(v => v > 100))
    return { valid: false, error: 'Nenhum valor pode ultrapassar 100!' };
  const total = attack + defense + counter;
  if (total !== 100)
    return { valid: false, error: `A soma deve ser *100*! Você somou *${total}*` };
  return { valid: true };
}

// ── calculateBattle (usado por wolf.js) ──────────────────────
function calculateBattle(attacker, defender) {
  const atkS = attacker.strategy;
  const defS = defender.strategy;

  const atkPow = atkS.attack  + (atkS.counter * 0.3);
  const defPow = defS.defense + (defS.counter * 0.5);
  const ctrPow = defS.counter + (atkS.defense * 0.2);

  let atkDmg = Math.max(1, Math.floor((atkPow / (atkPow + defPow)) * 30 + Math.random() * 15));
  let defDmg = Math.max(0, Math.floor((ctrPow / (ctrPow + atkPow)) * 20 + Math.random() * 10));

  atkDmg = Math.floor(atkDmg * (defender.wolves / 100));
  defDmg = Math.floor(defDmg * (attacker.wolves / 100));

  const atkWolvesAfter = Math.max(0, attacker.wolves - defDmg);
  const defWolvesAfter = Math.max(0, defender.wolves - atkDmg);

  const winner = defWolvesAfter < atkWolvesAfter ? 'attacker'
               : atkWolvesAfter < defWolvesAfter ? 'defender'
               : 'draw';

  return { atkDamage: atkDmg, defDamage: defDmg, atkWolvesAfter, defWolvesAfter, winner };
}

// ── Ranks ─────────────────────────────────────────────────────
function getRank(level) {
  if (level >= 90) return '👑 Alpha Supremo';
  if (level >= 75) return '🌕 Alfa da Matilha';
  if (level >= 60) return '🐺 Lobo Veterano';
  if (level >= 50) return '⚔️ Guerreiro da Lua';
  if (level >= 40) return '🔥 Lobo Selvagem';
  if (level >= 30) return '🌙 Lobo Lunar';
  if (level >= 20) return '🌹 Lobo Jovem';
  if (level >= 10) return '🦴 Filhote Crescido';
  return '🐾 Filhote de Lobo';
}

function calcLevel(xp) {
  const level = Math.min(100, Math.floor(0.1 * Math.sqrt(xp)) + 1);
  return { level, rank: getRank(level) };
}

// ── Banner temático ───────────────────────────────────────────
function printBanner() {
  console.log(chalk.red(`
🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹

         🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾

╔══════════════════════════════════════════════════╗
║   100 LOBISOMENS + LOBO-BOT V3                   ║
║   Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺                     ║
║   +55 43 92003-0769 | +55 43 99637-5955          ║
╚══════════════════════════════════════════════════╝

🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹
  `));
}

module.exports = {
  logger,
  BOT_NAME, PREFIX, OWNER, DEV_NAME, DEV_TEL,
  formatNumber, formatTime, formatDate,
  cleanJid, getNumber, toJid, isBrazilianFake,
  sleep, progressBar, wolvesBar, mention,
  validateStrategy, calculateBattle,
  shuffle, getRank, calcLevel,
  printBanner,
};
