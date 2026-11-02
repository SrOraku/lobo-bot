'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

function freshConfig(env = {}) {
  for (const key of ['BOT_OWNER','BOT_OWNERS','MAX_RECONNECT','XP_COOLDOWN_SEC','NODE_ENV','LOG_LEVEL','LOG_COMMANDS','GOLD_START','XP_PER_MESSAGE','XP_PREMIUM_MULTIPLIER','BATTLE_TIMEOUT','INACTIVITY_DAYS','CMD_COOLDOWN_MS','PREFIX','SESSION_NAME','BOT_NAME','BOT_DESCRIPTION','DEVELOPER_NAME','DEVELOPER_CONTACT','REDIS_URL','YOUTUBE_API_KEY','LASTFM_API_KEY','ASSEMBLYAI_API_KEY','BRONXYS_API_KEY']) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../src/config/index')];
  return require('../src/config/index');
}

test('configuração exige dono explícito antes de iniciar', () => {
  const config = freshConfig();
  const result = config.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('BOT_OWNER')));
});

test('configuração aceita dono válido e aplica defaults não sensíveis', () => {
  const config = freshConfig({ BOT_OWNER: '5511999999999' });
  const result = config.validate();
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(config.get('PREFIX'), '!');
  assert.equal(config.get('DEVELOPER_CONTACT'), '');
});

test('configuração rejeita números não finitos e fora dos limites', () => {
  for (const value of ['NaN','Infinity','-1','101']) {
    const config = freshConfig({ BOT_OWNER: '5511999999999', MAX_RECONNECT: value });
    const result = config.validate();
    assert.equal(result.ok, false, 'MAX_RECONNECT=' + value);
    assert.ok(result.errors.some(error => error.includes('MAX_RECONNECT')));
  }
});

test('configuração rejeita telefone de dono malformado', () => {
  const config = freshConfig({ BOT_OWNER: '+5511999999999' });
  const result = config.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('BOT_OWNER')));
});
