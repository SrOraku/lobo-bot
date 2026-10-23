'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — SERVIÇOS (LÓGICA DE NEGÓCIO)
// ============================================================

const db     = require('../utils/database');
const cache  = require('../utils/cache');
const { bus, EVENTS } = require('../core/eventBus');
const { logError } = require('../config/logger');
const config = require('../config');

// ============================================================
// USER SERVICE
// ============================================================
const UserService = {
  getOrCreate(jid, name) {
    db.upsertUser(jid, name);
    return db.getUser(jid);
  },

  addGold(jid, amount, reason = '') {
    if(!Number.isSafeInteger(amount)) throw Error('Quantidade inválida.');
    let outcome;
    db.db.transaction(()=>{
      const user=db.getUser(jid);
      if(!user) throw Error('Usuário não encontrado.');
      const final=(user.gold || 0)+amount;
      if(!Number.isSafeInteger(final)||final<0) {outcome={success:false,reason:'insufficient'};return;}
      db.addGold(jid,amount);
      db.logGoldTransaction(amount<0?jid:'system',amount<0?'system':jid,Math.abs(amount),reason);
      outcome={success:true,delta:amount,newBalance:final};
    })();
    if(outcome.success) bus.emit(EVENTS.GOLD_CHANGED,{jid,delta:amount,reason});
    return outcome;
  },

  addXP(jid, amount) {
    const result = db.addXP(jid, amount);
    if (result?.newLevel > result?.oldLevel) {
      bus.emit(EVENTS.LEVEL_UP, { jid, level: result.newLevel, rank: result.rank });
    }
    return result;
  },

  transfer(fromJid, toJid, amount) {
    return require('./economy').economy().transfer(fromJid,toJid,amount);
  },

  async claimDaily(jid) {
    return require('./economy').economy().daily(jid);
  },
};

// ============================================================
// WOLF SERVICE
// ============================================================
const WolfService = {
  getOrInit(jid) {
    let s = db.getStrategy(jid);
    if (!s) { db.upsertStrategy(jid, 34, 33, 33); s = db.getStrategy(jid); }
    return s;
  },

  setStrategy(jid, atk, def, ctr) {
    const total = atk + def + ctr;
    if (total !== 100) return { success: false, error: `Soma = *${total}*, deve ser *100*!` };
    if ([atk, def, ctr].some(v => v < 0)) return { success: false, error: 'Valores não podem ser negativos!' };
    db.upsertStrategy(jid, atk, def, ctr);
    return { success: true };
  },

  async battle(attackerJid, defenderJid, groupJid) {
    if(require('./economy').economy().activeEffect(defenderJid,'shield')) return {success:false,reason:'shield'};
    const cooldownKey = `battle_${attackerJid}`;
    const timeout     = config.getNumber('BATTLE_TIMEOUT') || 60;
    const lastBattle  = await cache.get(cooldownKey);

    if (lastBattle) {
      const remaining = timeout - Math.floor((Date.now() - lastBattle) / 1000);
      if (remaining > 0) return { success: false, reason: 'cooldown', remaining };
    }

    const atkS = WolfService.getOrInit(attackerJid);
    const defS = WolfService.getOrInit(defenderJid);

    if (atkS.wolves_alive <= 0) return { success: false, reason: 'attacker_dead' };
    if (defS.wolves_alive <= 0) return { success: false, reason: 'defender_dead' };

    // Cálculo de batalha
    const atkPow = atkS.attack + (atkS.counter * 0.3);
    const defPow = defS.defense + (defS.counter * 0.5);
    const ctrPow = defS.counter + (atkS.defense * 0.2);

    let atkDmg = Math.max(1, Math.floor((atkPow / (atkPow + defPow)) * 30 + Math.random() * 15));
    let defDmg = Math.max(0, Math.floor((ctrPow / (ctrPow + atkPow)) * 20 + Math.random() * 10));

    atkDmg = Math.floor(atkDmg * (defS.wolves_alive / 100));
    defDmg = Math.floor(defDmg * (atkS.wolves_alive / 100));

    const atkAfter = Math.max(0, atkS.wolves_alive - defDmg);
    const defAfter = Math.max(0, defS.wolves_alive - atkDmg);

    const winner = defAfter < atkAfter ? 'attacker' : atkAfter < defAfter ? 'defender' : 'draw';

    // Persistir
    db.updateWolvesAlive(attackerJid, atkAfter);
    db.updateWolvesAlive(defenderJid, defAfter);
    db.incrementAttackStats(attackerJid);

    let goldPrize = 0;
    if (winner === 'attacker') {
      db.incrementVictoryStats(attackerJid);
      db.updateBattleResult(attackerJid, 1, 0);
      db.updateBattleResult(defenderJid, 0, 1);
      goldPrize = Math.floor(50 + Math.random() * 50);
      UserService.addGold(attackerJid, goldPrize, 'Vitória em batalha');
      UserService.addGold(defenderJid, -Math.floor(goldPrize * 0.3), 'Derrota em batalha');
      UserService.addXP(attackerJid, 30);
    } else if (winner === 'defender') {
      db.incrementVictoryStats(defenderJid);
      db.updateBattleResult(defenderJid, 1, 0);
      db.updateBattleResult(attackerJid, 0, 1);
      goldPrize = Math.floor(30 + Math.random() * 30);
      UserService.addGold(defenderJid, goldPrize, 'Defesa vitoriosa');
      UserService.addXP(defenderJid, 20);
    } else {
      UserService.addXP(attackerJid, 10);
      UserService.addXP(defenderJid, 10);
    }

    db.logBattle({
      attacker: attackerJid, defender: defenderJid,
      atkBefore: atkS.wolves_alive, defBefore: defS.wolves_alive,
      atkAfter, defAfter, result: winner, groupId: groupJid,
    });

    await cache.set(cooldownKey, Date.now(), timeout);
    bus.emit(EVENTS.BATTLE_END, { attackerJid, defenderJid, winner, goldPrize });

    return {
      success: true, winner, goldPrize,
      atkDmg, defDmg, atkAfter, defAfter,
      atkBefore: atkS.wolves_alive, defBefore: defS.wolves_alive,
    };
  },
};

// ============================================================
// GROUP SERVICE
// ============================================================
const GroupService = {
  getOrCreate(jid, name = '') {
    db.upsertGroup(jid, name);
    return db.getGroup(jid);
  },

  toggle(jid, field) {
    const feature=require('../activations/registry').list().find(f=>f.legacyColumn===field);
    if(feature){
      const store=require('../activations/store').getStore();
      const next=store.update(jid,'internal:GroupService',policy=>{const value=!policy.features[feature.id];if(value&&feature.dependencies?.some(id=>!policy.features[id]))throw Error('Dependência de ativação ausente.');policy.features[feature.id]=value;return policy;});
      return next.features[feature.id];
    }
    const group = db.getGroup(jid);
    const newVal = group?.[field] ? 0 : 1;
    db.updateGroup(jid, field, newVal);
    return !!newVal;
  },

  set(jid, field, value) {
    const feature=require('../activations/registry').list().find(f=>f.legacyColumn===field);
    if(feature){
      if(![true,false,0,1].includes(value))throw Error('Estado de ativação inválido.');
      require('../activations/store').getStore().update(jid,'internal:GroupService',policy=>{if(value&&feature.dependencies?.some(id=>!policy.features[id]))throw Error('Dependência de ativação ausente.');policy.features[feature.id]=!!value;return policy;});
      return;
    }
    if(['antilink_mode','inactivity_days'].includes(field)){
      if(field==='antilink_mode'&&!['delete','warn','kick'].includes(value)||field==='inactivity_days'&&(!Number.isInteger(value)||value<1||value>90))throw Error('Opção de ativação inválida.');
      require('../activations/store').getStore().update(jid,'internal:GroupService',policy=>{policy.options[field]=value;return policy;});
      return;
    }
    db.updateGroup(jid, field, value);
  },
};

module.exports = { UserService, WolfService, GroupService };
