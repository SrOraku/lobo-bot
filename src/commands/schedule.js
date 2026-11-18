'use strict';
// !lembrete, !agendamentos e !desagendar, sobre o agendador central.
const { frameNotice } = require('../menus/render');
const { command } = require('../ui/text');

function service() { return require('../scheduler/service'); }
function prefix() { return require('../config').get('PREFIX') || '!'; }
const tail = jid => { const match = /^(\d{8,15})@s\.whatsapp\.net$/.exec(String(jid || '')); return match ? '··' + match[1].slice(-4) : null; };
const short = (text, size = 60) => { const value = String(text).replace(/\s+/g, ' ').trim(); return value.length > size ? value.slice(0, size - 1) + '…' : value; };

// Telefone de quem pediu quando o WhatsApp o informa; senão, o identificador recebido.
async function whoAsked(sock, ctx) {
  try {
    const actor = await require('../activations/access').resolveActor(sock, ctx);
    return { id: actor.phone || ctx.sender, actor };
  } catch { return { id: ctx.sender, actor: null }; }
}

function createScheduleCommands({ scheduler = () => service().scheduler(), resolve = whoAsked } = {}) {
  const reply = (sock, ctx, title, lines) => sock.sendMessage(ctx.jid, { text: frameNotice(title, lines) }, { quoted: ctx.msg });

  async function lembrete(sock, ctx) {
    const p = prefix();
    const usage = [
      `${command(p + 'lembrete 30m beber água')}`,
      `${command(p + 'lembrete 1h30m reunião')}`,
      `${command(p + 'lembrete às 18:00 jantar')}`,
      `${command(p + 'lembrete 25/12 08:00 Feliz Natal')}`,
      '> ⏱️ m = minutos, h = horas, d = dias. Horário de Brasília.',
    ];
    const input = (ctx.argText ?? (ctx.args || []).join(' ')).trim();
    if (!input) return reply(sock, ctx, '⏰ LEMBRETE', usage);
    try {
      const { parseReminder, brt } = service();
      const { at, text } = parseReminder(input);
      const { id: createdBy } = await resolve(sock, ctx);
      const item = scheduler().add({ chat: ctx.jid, kind: 'lembrete', at, text, createdBy });
      return reply(sock, ctx, '⏰ LEMBRETE CRIADO', [
        `🗓️ *Quando:* ${brt(item.run_at)}`,
        `💬 ${short(item.payload, 120)}`,
        `🆔 *Número:* #${item.id}`,
        `> ❌ Cancelar: ${command(p + 'desagendar ' + item.id)}`,
      ]);
    } catch (error) {
      if (!error?.code?.startsWith('SCHEDULE_')) throw error;
      return reply(sock, ctx, '⏰ LEMBRETE', [`❌ ${error.message}`, ...usage]);
    }
  }

  async function agendamentos(sock, ctx) {
    const p = prefix();
    const { brt, describeCron } = service();
    const items = scheduler().list(ctx.jid);
    if (!items.length) return reply(sock, ctx, '⏰ AGENDAMENTOS', ['Nenhum agendamento ativo neste chat.', `> ⏰ Crie com ${command(p + 'lembrete 30m texto')}`]);
    const { id: me } = await resolve(sock, ctx);
    return reply(sock, ctx, '⏰ AGENDAMENTOS', [
      ...items.map(item => {
        const head = item.kind === 'lembrete'
          ? `#${item.id} ⏰ ${brt(item.run_at)}`
          : `#${item.id} 🔁 ${describeCron(item.cron_expr)} • próxima ${brt(item.next)}`;
        const by = item.created_by === me ? 'por você' : tail(item.created_by) ? 'por ' + tail(item.created_by) : '';
        return `${head}\n   _${short(item.payload)}_${by ? ' — ' + by : ''}`;
      }),
      `> ❌ Cancelar: ${command(p + 'desagendar número')}`,
    ]);
  }

  async function desagendar(sock, ctx) {
    const p = prefix();
    const id = String(ctx.args?.[0] || '').replace(/^#/, '');
    if (!/^\d{1,9}$/.test(id)) return reply(sock, ctx, '⏰ DESAGENDAR', [`Use ${command(p + 'desagendar número')}. Veja os números com ${command(p + 'agendamentos')}.`]);
    const { id: me, actor } = await resolve(sock, ctx);
    // Quem criou cancela o próprio; donos e administradores cancelam qualquer um do chat.
    const canManage = !!actor && (actor.owner === true || actor.admin === true || (actor.securityLevel || 0) >= 2);
    try {
      const item = scheduler().cancel(ctx.jid, Number(id), { actor: me, canManage });
      return reply(sock, ctx, '⏰ AGENDAMENTO CANCELADO', [`✅ #${item.id} cancelado.`, `_${short(item.payload)}_`]);
    } catch (error) {
      if (!error?.code?.startsWith('SCHEDULE_')) throw error;
      return reply(sock, ctx, '⏰ DESAGENDAR', [`❌ ${error.message}`]);
    }
  }

  return { lembrete, agendamentos, desagendar };
}

module.exports = { createScheduleCommands, ...createScheduleCommands() };
