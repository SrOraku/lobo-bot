'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — HELPERS
// Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
// ============================================================

require('dotenv').config();
const chalk = require('chalk');

const BOT_NAME = process.env.BOT_NAME || '🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑';
const BOT_DESCRIPTION = process.env.BOT_DESCRIPTION || '🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺';
const PREFIX = process.env.PREFIX || '!';
const OWNER = process.env.BOT_OWNER || '';
const DEV_NAME = process.env.DEVELOPER_NAME || '🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺';
const DEV_TEL = process.env.DEVELOPER_CONTACT || '';

// Logger compartilhado
const { logger } = require('../config/logger');

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function formatTime(value) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return '0s';
  const seconds = Math.floor(total);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function cleanJid(jid) {
  if (typeof jid !== 'string') return '';
  return jid.replace(/:[0-9]+(?=@)/, '');
}

function getNumber(jid) {
  if (typeof jid !== 'string') return '';
  return jid.split('@')[0].replace(/:\\d+$/, '').replace(/\\D/g, '');
}

function toJid(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const input = String(value).trim();
  if (!input) return '';
  if (/^\\d+@(s\\.whatsapp\\.net|lid)$/.test(input)) return input;
  const normalized = input.replace(/:\\d+(?=@)/, '').replace(/@s\\.whatsapp\\.net$/i, '').replace(/@lid$/i, '').replace(/\\D/g, '');
  return normalized ? `${normalized}@s.whatsapp.net` : '';
}

function mention(jid) {
  const number = getNumber(jid);
  return number ? `@${number}` : '@desconhecido';
}

function isBrazilianFake(number) {
  const n = String(number ?? '').replace(/\\D/g, '');
  return n.startsWith('55') && n.length === 12;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

function progressBar(value, max, size = 10) {
  const width = Number.isFinite(Number(size)) ? Math.max(0, Math.min(100, Math.floor(Number(size)))) : 10;
  const denominator = Number(max);
  const current = Number(value);
  if (!width) return '';
  const ratio = Number.isFinite(current) && Number.isFinite(denominator) && denominator > 0
    ? Math.max(0, Math.min(1, current / denominator))
    : 0;
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function wolvesBar(alive, total = 100) {
  const safeTotal = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : 100;
  const safeAlive = Number.isFinite(Number(alive)) ? Math.max(0, Math.min(safeTotal, Number(alive))) : 0;
  const pct = safeAlive / safeTotal;
  const bar = progressBar(safeAlive, safeTotal, 15);
  const icon = pct <= 0 ? '💀' : pct <= 0.25 ? '🩸' : pct <= 0.5 ? '🌙' : pct <= 0.75 ? '🌹' : '🐺';
  return `${icon} ${bar} *${safeAlive}/${safeTotal}*`;
}

function shuffle(arr) {
  if (!Array.isArray(arr)) return [];
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function validateStrategy(attack, defense, counter) {
  const values = [attack, defense, counter].map(Number);
  if (values.some(v => !Number.isFinite(v) || v < 0))
    return { valid: false, error: 'Valores devem ser números finitos e não podem ser negativos!' };
  if (values.some(v => v > 100))
    return { valid: false, error: 'Nenhum valor pode ultrapassar 100!' };
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total !== 100)
    return { valid: false, error: `A soma deve ser *100*! Você somou *${total}*` };
  return { valid: true };
}

function calculateBattle(attacker, defender) {
  const atkS = attacker.strategy;
  const defS = defender.strategy;
  const atkPow = atkS.attack + (atkS.counter * 0.3);
  const defPow = defS.defense + (defS.counter * 0.5);
  const ctrPow = defS.counter + (atkS.defense * 0.2);
  const atkDenominator = atkPow + defPow;
  const defDenominator = ctrPow + atkPow;
  let atkDmg = Math.max(1, Math.floor((atkDenominator > 0 ? atkPow / atkDenominator : 0) * 30 + Math.random() * 15));
  let defDmg = Math.max(0, Math.floor((defDenominator > 0 ? ctrPow / defDenominator : 0) * 20 + Math.random() * 10));
  atkDmg = Math.floor(atkDmg * (defender.wolves / 100));
  defDmg = Math.floor(defDmg * (attacker.wolves / 100));
  const atkWolvesAfter = Math.max(0, attacker.wolves - defDmg);
  const defWolvesAfter = Math.max(0, defender.wolves - atkDmg);
  const winner = defWolvesAfter < atkWolvesAfter ? 'attacker'
    : atkWolvesAfter < defWolvesAfter ? 'defender'
      : 'draw';
  return { atkDamage: atkDmg, defDamage: defDmg, atkWolvesAfter, defWolvesAfter, winner };
}

function getRank(level) {
  const value = Number.isFinite(Number(level)) ? Number(level) : 0;
  if (value >= 90) return '👑 Alpha Supremo';
  if (value >= 75) return '🌕 Alfa da Matilha';
  if (value >= 60) return '🐺 Lobo Veterano';
  if (value >= 50) return '⚔️ Guerreiro da Lua';
  if (value >= 40) return '🔥 Lobo Selvagem';
  if (value >= 30) return '🌙 Lobo Lunar';
  if (value >= 20) return '🌹 Lobo Jovem';
  if (value >= 10) return '🦴 Filhote Crescido';
  return '🐾 Filhote de Lobo';
}

function calcLevel(xp) {
  const value = Number.isFinite(Number(xp)) ? Math.max(0, Number(xp)) : 0;
  const level = Math.min(100, Math.floor(0.1 * Math.sqrt(value)) + 1);
  return { level, rank: getRank(level) };
}

function printBanner() {
  const { card, plain } = require('../ui/text');
  const version = require('../../package.json').version;
  console.log(chalk.red(plain(card('LOBO BOT', [
    BOT_NAME, '100 LOBISOMENS + LOBO-BOT v' + version,
    '🌹 Dev: ' + DEV_NAME,
    DEV_TEL ? '📞 ' + DEV_TEL : '',
  ].filter(Boolean), { formatNumbers: false }))));
}

module.exports = {
  logger,
  BOT_NAME, BOT_DESCRIPTION, PREFIX, OWNER, DEV_NAME, DEV_TEL,
  formatNumber, formatTime, formatDate,
  cleanJid, getNumber, toJid, isBrazilianFake,
  sleep, progressBar, wolvesBar, mention,
  validateStrategy, calculateBattle,
  shuffle, getRank, calcLevel,
  printBanner,
};
