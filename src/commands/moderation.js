'use strict';
const db = require('../utils/database');
const response = require('../core/response');
const { mono, command } = require('../ui/text');
const { BOT_NAME, cleanJid, getNumber, OWNER, sleep } = require('../utils/helpers');

// Helper: verificar se é admin do grupo
async function isGroupAdmin(sock, jid, senderJid) {
  try {
    const meta = await sock.groupMetadata(jid);
    const p = meta.participants.find(x => cleanJid(x.id) === cleanJid(senderJid));
    return p?.admin === 'admin' || p?.admin === 'superadmin';
  } catch { return false; }
}

async function isBotAdmin(sock, jid) {
  try {
    const metadata=await sock.groupMetadata(jid);
    const {IdentityResolver}=await import('../../addons/alcateia/src/identity.js');
    const bot=await new IdentityResolver(sock,OWNER+'@s.whatsapp.net',metadata).member(sock.user?.id);
    return bot?.isAdmin===true;
  } catch { return false; }
}

function requireGroupAdmin(fn,action='settings') {
  return async(sock,ctx)=>{
    try{await require('../security/groups/service').security().permissions.guardCommand(sock,ctx,action);}
    catch(error){return sock.sendMessage(ctx.jid,{text:require('../menus/render').frameNotice('🛡️ LOBO SECURITY',[error.code?'Não foi possível validar as permissões atuais.':error.message])},{quoted:ctx.msg});}
    return fn(sock,ctx);
  };
}

// ============================
// BAN
// ============================
const ban = require('./group-removal').createRemovalCommand('ban');

// ============================
// UNBAN
// ============================
const unban = require('./group-removal').createUnbanCommand();

// ============================
// MUTE
// ============================
const mute = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: response.error('Ação Inválida!', '_Mencione quem deseja silenciar._') }, { quoted: msg });

  const target = cleanJid(mentioned);
  if (await require('../utils/owners').protectedOwner(sock, target, jid))
    return sock.sendMessage(jid, { text: require('../core/response').warn('DONO PROTEGIDO', 'O dono do bot não pode ser alvo de punições.') }, { quoted: msg });
  db.setMuted(target, 1);
  require('../security/groups/service').security().store.audit(jid,{actor:ctx.sender,target,action:'BOT_MUTE',authorized:true,result:'APPLIED'});

  await sock.sendMessage(jid, {
    text: response.success('SILENCIADO', `@${getNumber(target)} foi silenciado.\n_Comandos do bot ignorados._`),
    mentions: [target]
  }, { quoted: msg });
},'mute');

// ============================
// UNMUTE
// ============================
const unmute = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: response.error('Ação Inválida!', '_Mencione quem deseja desmutar._') }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.setMuted(target, 0);
  require('../security/groups/service').security().store.audit(jid,{actor:ctx.sender,target,action:'BOT_UNMUTE',authorized:true,result:'APPLIED'});

  await sock.sendMessage(jid, {
    text: response.success('DESMUTADO', `@${getNumber(target)} foi desmutado.`),
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// KICK
// ============================
const kick = require('./group-removal').createRemovalCommand('kick');

// ============================
// ADD
// ============================
const add = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  if (!args[0]) return sock.sendMessage(jid, { text: response.usage('!add número', '!add 5511999999999', 'Informe o número com DDI e DDD.') }, { quoted: msg });

  const number = args[0].replace(/\D/g, '');
  if(!/^\d{10,15}$/.test(number))return sock.sendMessage(jid,{text:response.error('Ação Inválida!', '_Informe DDI + DDD + número válido, de `10` a `15` dígitos._')},{quoted:msg});
  const targetJid = `${number}@s.whatsapp.net`;

  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: response.warn('Permissão necessária', '_O bot precisa ser admin para adicionar membros._') }, { quoted: msg });

  await require('../security/groups/service').security().performParticipants(sock,ctx,[targetJid],'add');
  await sock.sendMessage(jid, {
    text: response.success('Membro adicionado', `${mono('+55' + number)} foi adicionado à matilha!`),
  }, { quoted: msg });
},'add');

// ============================
// PROMOVER
// ============================
const promover = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: response.error('Ação Inválida!', '_Mencione quem deseja promover._') }, { quoted: msg });

  const target = cleanJid(mentioned);
  await require('../security/groups/service').security().performParticipants(sock,ctx,[target],'promote');
  await sock.sendMessage(jid, {
    text: response.success('Promoção concluída', `@${getNumber(target)} agora é *ADMIN* da matilha!`),
    mentions: [target]
  }, { quoted: msg });
},'promote');

// ============================
// REBAIXAR
// ============================
const rebaixar = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: response.error('Ação Inválida!', '_Mencione quem deseja rebaixar._') }, { quoted: msg });

  const target = cleanJid(mentioned);
  if (await require('../utils/owners').protectedOwner(sock, target, jid))
    return sock.sendMessage(jid, { text: require('../core/response').warn('DONO PROTEGIDO', 'O dono do bot não pode ser rebaixado.') }, { quoted: msg });
  await require('../security/groups/service').security().performParticipants(sock,ctx,[target],'demote');
  await sock.sendMessage(jid, {
    text: response.success('Rebaixamento concluído', `@${getNumber(target)} foi rebaixado para membro.`),
    mentions: [target]
  }, { quoted: msg });
},'demote');

// ============================
// ABRIR / FECHAR GRUPO
// ============================
const abrirGrupo = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: response.warn('Permissão necessária', '_O bot precisa ser admin._') }, { quoted: msg });

  await require('../security/groups/service').security().engine.operation(sock,jid,{action:'SETTINGS_CHANGE',target:'announce',value:false},()=>sock.groupSettingUpdate(jid,'not_announcement'));
  db.updateGroup(jid, 'open', 1);
  await sock.sendMessage(jid, {
    text: response.success('Grupo aberto', '_Todos podem enviar mensagens._')
  }, { quoted: msg });
});

const fecharGrupo = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: response.warn('Permissão necessária', '_O bot precisa ser admin._') }, { quoted: msg });

  await require('../security/groups/service').security().engine.operation(sock,jid,{action:'SETTINGS_CHANGE',target:'announce',value:true},()=>sock.groupSettingUpdate(jid,'announcement'));
  db.updateGroup(jid, 'open', 0);
  await sock.sendMessage(jid, {
    text: response.success('Grupo fechado', '_Apenas admins podem enviar mensagens._')
  }, { quoted: msg });
});

// ============================
// TOGGLES DE PROTEÇÃO
// ============================
const featureCommand = id => require('./activations').createActivationHandler({featureId:id});
const toggleAntilink = featureCommand('antilink');
const toggleAntifake = featureCommand('antifake');
const toggleAnticontato = featureCommand('anticontato');
const toggleAntitag = featureCommand('antimarcacao');
const toggleAntiInatividade = featureCommand('antiinatividade');

const limparInatividade = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  if (!require('../activations/manager').manager.isEnabled(jid,'antiinatividade')) return sock.sendMessage(jid,{text:response.warn('Proteção desativada', `Ative ${command('antiinatividade')} antes de executar a limpeza manual.`)},{quoted:msg});
  const group = db.getGroup(jid);
  const days = group?.inactivity_days || 7;
  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: response.warn('Permissão necessária', '_O bot precisa ser admin._') }, { quoted: msg });

  const inactive = db.getInactiveUsers(jid, days);
  if (!inactive.length) {
    return sock.sendMessage(jid, {
      text: response.success('Limpeza verificada', `Nenhum membro inativo encontrado nos últimos ${mono(days)} dias!`)
    }, { quoted: msg });
  }

  await sock.sendMessage(jid, {
    text: response.warn('Limpeza em andamento', `Removendo ${mono(inactive.length)} membros inativos há mais de ${mono(days)} dias...`)
  }, { quoted: msg });

  let removed = 0;
  for (const u of inactive) {
    try {
      const security=require('../security/groups/service').security();
      if(security.store.get(jid).pausedUntil>security.store.now())break;
      const check=await security.permissions.context(sock,jid,ctx.sender,ctx.msg.key.participantAlt,{force:true});
      if(!security.permissions.canAct(check,'remove',await check.identify(u.jid)).allowed)continue;
      if(security.manager.isEnabled(jid,'antimasskick')&&removed>=security.store.get(jid).masskick.max)break;
      await security.performParticipants(sock,ctx,[u.jid],'remove');
      removed++;
      await sleep(500);
    } catch {}
  }

  await sock.sendMessage(jid, {
    text: response.success('Limpeza concluída', `${mono(removed)} membros inativos foram removidos!\n> A matilha permanece forte! 🐺`)
  }, { quoted: msg });
},'remove');

// ============================
// MARCAR TODOS
// ============================
const marcarTodos = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  const text = args.join(' ') || 'Atenção matilha! 🐺';
  const meta = await sock.groupMetadata(jid).catch(() => null);
  if (!meta) return;

  const members = meta.participants.map(p => cleanJid(p.id));
  const chunks = [];
  for (let i = 0; i < members.length; i += 20) {
    chunks.push(members.slice(i, i + 20));
  }

  for (const chunk of chunks) {
    const mentions = chunk.map(m => `@${getNumber(m)}`).join(' ');
    await sock.sendMessage(jid, {
      text: `🌙 ${text}\n\n${mentions}`,
      mentions: chunk
    });
    await sleep(1000);
  }
});

module.exports = {
  ban, unban, mute, unmute, kick, add, promover, rebaixar,
  abrirGrupo, fecharGrupo,
  toggleAntilink, toggleAntifake, toggleAnticontato, toggleAntitag,
  toggleAntiInatividade, limparInatividade,
  marcarTodos
};
