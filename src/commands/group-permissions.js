'use strict';
const {frameNotice} = require('../menus/render');
async function groupPermissions(sock,ctx) {
  if(!ctx.args.length) return require('./menu').menu(sock,{...ctx,args:['adm']});
  const reply = text => sock.sendMessage(ctx.jid,{text:frameNotice('🛡️ SEGURANÇA DO GRUPO',[text])},{quoted:ctx.msg});
  if(!ctx.jid.endsWith('@g.us')) return reply('Use este painel dentro do grupo.');
  const actor = await require('../activations/access').resolveActor(sock,ctx);
  const guard = require('../security/group-guard'), policy = guard.get(ctx.jid);
  const [section, action] = ctx.args;
  if(section === 'perm') {
    if(!actor.owner) return reply('Somente donos cadastrados podem conceder permissões ou configurar o antirroubo.');
    if(!action || action === 'status') return reply(`Proteção: ${policy.enabled?'🟢 ativa':'🔴 desativada'}\nAutorizados: ${policy.allowed.length}\n\n!adm perm on/off\n!adm perm permitir @usuário\n!adm perm revogar @usuário\n!adm nome novo nome\n!adm descricao novo texto\n\n_Protege nome, descrição e configurações recebidas em eventos. Não impede o criador do grupo de remover o bot; foto e ações não informadas pelo WhatsApp não são revertidas._`.replaceAll('!',require('../config').get('PREFIX')));
    if(['on','off'].includes(action) && ctx.args.length===2) {
      if(action==='on') {
        if(!actor.botAdmin) return reply('O bot precisa ser administrador.');
        const metadata = await sock.groupMetadata(ctx.jid);
        Object.assign(policy,{subject:metadata.subject,desc:metadata.desc || '',restrict:!!metadata.restrict,announce:!!metadata.announce});
        await sock.groupSettingUpdate(ctx.jid,'locked');policy.restrict=true;
      }
      policy.enabled=action==='on';
    } else if(['permitir','revogar'].includes(action)) {
      const mentions = require('../activations/message-rules').inspect(ctx.msg.message).mentions;
      if(mentions.length!==1) return reply('Mencione exatamente um participante.');
      const mention = mentions[0];
      const {IdentityResolver} = await import('../../addons/alcateia/src/identity.js');
      const member = await new IdentityResolver(sock,'',await sock.groupMetadata(ctx.jid)).member(mention);
      if(!member?.phoneNumber || !member.inGroup) return reply('Mencione um participante deste grupo.');
      policy.allowed=action==='permitir'?[...new Set([...policy.allowed,member.phoneNumber])]:policy.allowed.filter(p=>p!==member.phoneNumber);
    } else return reply('Use perm on/off, permitir @usuário ou revogar @usuário.');
    guard.save(ctx.jid,policy,actor.phone,'guard.'+action);
    return reply('✅ Permissões salvas somente neste grupo. Desativar a proteção não muda outras configurações do WhatsApp.');
  }
  if(!['nome','descricao'].includes(section)) return reply('Use adm perm para configurar ou consultar a proteção.');
  if(!actor.owner && !(policy.enabled && guard.authorized(policy,actor.phone))) return reply('Sem autorização do dono para alterar informações do grupo.');
  if(!actor.botAdmin) return reply('O bot precisa ser administrador.');
  const text=ctx.args.slice(1).join(' ').trim();
  if(!text || text.length > (section==='nome'?100:2000)) return reply('Informe um texto válido; nome até 100 caracteres e descrição até 2000.');
  if(section==='nome') await sock.groupUpdateSubject(ctx.jid,text);else await sock.groupUpdateDescription(ctx.jid,text);
  policy[section==='nome'?'subject':'desc']=text;
  guard.save(ctx.jid,policy,actor.phone,'group.'+section);
  return reply('✅ Informação do grupo atualizada.');
}
module.exports = { groupPermissions };
