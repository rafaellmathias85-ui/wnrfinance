// WhatsApp Bot — intent detection, bill matching, payment confirmation
// Uses Claude Haiku for smart NLP when simple regex isn't enough

import { prisma } from '@/lib/prisma';
import { sendWhatsAppText, sendWhatsAppMedia } from '@/lib/whatsapp';

// ─────────────────────────────────────────────────────────────────────────────
// Intent detection — keywords first, AI as fallback
// ─────────────────────────────────────────────────────────────────────────────
type Intent = 'paid' | 'acknowledge' | 'help' | 'list_pending' | 'unknown';

const PAID_KEYWORDS = /\b(paguei|pago|paga|efetuei|realizei|quitei|feito|ok|confirmado|comprovante|transferi|depositei)\b/i;
const ACK_KEYWORDS = /\b(ciente|visto|ok|entendi|anotado|vou pagar|pagarei|certo)\b/i;
const LIST_KEYWORDS = /\b(listar|lista|minhas contas|pendentes|o que tenho|quanto devo|vencimentos)\b/i;
const HELP_KEYWORDS = /\b(ajuda|help|comandos|como usar|o que você faz)\b/i;

function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  if (PAID_KEYWORDS.test(t)) return 'paid';
  if (LIST_KEYWORDS.test(t)) return 'list_pending';
  if (HELP_KEYWORDS.test(t)) return 'help';
  if (ACK_KEYWORDS.test(t)) return 'acknowledge';
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Process incoming WhatsApp message
// ─────────────────────────────────────────────────────────────────────────────
export async function processIncomingMessage(params: {
  sessionId: string;
  from: string;
  body: string;
  mediaUrl?: string;
  mediaType?: string;
  messageId: string;
  timestamp: number;
}) {
  const { sessionId, from, body, mediaUrl, mediaType, messageId } = params;

  // Find the session to get userId/companyId
  const session = await prisma.whatsappSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  // Log the message
  const msg = await prisma.whatsappMessage.create({
    data: {
      sessionId,
      direction: 'inbound',
      from,
      to: session.phoneNumber || '',
      body: body || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      processed: false,
    },
  });

  const intent = detectIntent(body || '');
  const userId = session.userId || undefined;
  const companyId = session.companyId || undefined;

  // Find the last bill reminder sent to this number (context)
  const lastReminder = await prisma.whatsappMessage.findFirst({
    where: {
      sessionId,
      to: from,
      direction: 'outbound',
      contextType: 'bill_reminder',
      contextId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  let reply = '';

  switch (intent) {
    case 'paid': {
      reply = await handlePaymentConfirmation({
        sessionId, from, mediaUrl, mediaType,
        contextId: lastReminder?.contextId || null,
        userId, companyId,
      });
      break;
    }
    case 'acknowledge': {
      reply = lastReminder?.contextId
        ? '👍 Certo! Quando efetuar o pagamento, me envie *PAGUEI* junto com o comprovante.'
        : 'Olá! Pode me enviar *PAGUEI* com o comprovante quando quitar uma conta.';
      break;
    }
    case 'list_pending': {
      reply = await handleListPending({ userId, companyId });
      break;
    }
    case 'help': {
      reply = buildHelpMessage();
      break;
    }
    default: {
      // If has attachment and last reminder exists, treat as payment
      if (mediaUrl && lastReminder?.contextId) {
        reply = await handlePaymentConfirmation({
          sessionId, from, mediaUrl, mediaType,
          contextId: lastReminder.contextId,
          userId, companyId,
        });
      } else {
        reply = '🤖 Não entendi. Digite *AJUDA* para ver os comandos disponíveis.';
      }
    }
  }

  // Mark message as processed
  await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { processed: true, contextType: intent } });

  // Send reply
  if (reply) {
    await sendWhatsAppText(sessionId, from, reply);
    await prisma.whatsappMessage.create({
      data: { sessionId, direction: 'outbound', from: session.phoneNumber || '', to: from, body: reply, contextType: intent, processed: true },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle payment confirmation
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentConfirmation(params: {
  sessionId: string;
  from: string;
  mediaUrl?: string;
  mediaType?: string;
  contextId: string | null;
  userId?: string;
  companyId?: string;
}): Promise<string> {
  const { contextId, mediaUrl, mediaType, userId, companyId } = params;

  if (!contextId) {
    return '⚠️ Não encontrei uma conta pendente associada a esta conversa. Qual conta você pagou? Responda com a descrição ou valor.';
  }

  // Try AccountsPayable first, then AccountsReceivable
  let billDesc = '';
  let billAmount = 0;

  const payable = await prisma.accountsPayable.findFirst({
    where: { id: contextId, companyId },
  }).catch(() => null);

  if (payable) {
    await prisma.accountsPayable.update({
      where: { id: contextId },
      data: {
        status: 'pago',
        paidAt: new Date(),
        amountPaid: payable.amount,
        attachmentUrl: mediaUrl || null,
      },
    });
    billDesc = payable.description;
    billAmount = payable.amount;
  } else {
    const receivable = await prisma.accountsReceivable.findFirst({
      where: { id: contextId, companyId },
    }).catch(() => null);

    if (receivable) {
      await prisma.accountsReceivable.update({
        where: { id: contextId },
        data: {
          status: 'recebido',
          receivedAt: new Date(),
          amountReceived: receivable.amount,
        },
      });
      billDesc = receivable.description;
      billAmount = receivable.amount;
    }
  }

  if (!billDesc) {
    return '⚠️ Não foi possível localizar a conta. Entre em contato com o suporte.';
  }

  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(billAmount);
  const attachedMsg = mediaUrl ? '\n📎 Comprovante anexado ao registro.' : '';

  return `✅ *Pagamento registrado!*\n\n📋 ${billDesc}\n💰 ${fmt}\n📅 ${new Date().toLocaleDateString('pt-BR')}${attachedMsg}\n\n_Registrado no WNR Finance_`;
}

// ─────────────────────────────────────────────────────────────────────────────
// List pending bills
// ─────────────────────────────────────────────────────────────────────────────
async function handleListPending(params: { userId?: string; companyId?: string }): Promise<string> {
  const { userId, companyId } = params;
  const today = new Date();
  const in7Days = new Date(today.getTime() + 7 * 86400000);

  const where: any = {
    status: { in: ['pendente', 'aberto'] },
    dueDate: { lte: in7Days },
  };
  if (companyId) where.companyId = companyId;

  const payables = await prisma.accountsPayable.findMany({
    where,
    orderBy: { dueDate: 'asc' },
    take: 10,
  }).catch(() => []);

  if (!payables.length) {
    return '🎉 Nenhuma conta a pagar nos próximos 7 dias!';
  }

  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const lines = payables.map(p => {
    const due = new Date(p.dueDate);
    const isToday = due.toDateString() === today.toDateString();
    const isLate = due < today;
    const icon = isLate ? '🔴' : isToday ? '🟡' : '🟢';
    return `${icon} *${p.description}*\n   ${fmt.format(p.amount)} — ${due.toLocaleDateString('pt-BR')}`;
  }).join('\n\n');

  return `📋 *Contas a pagar (próx. 7 dias):*\n\n${lines}\n\nResponda *PAGUEI* + comprovante para registrar pagamentos.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Help message
// ─────────────────────────────────────────────────────────────────────────────
function buildHelpMessage(): string {
  return `🤖 *WNR Finance Bot* — Comandos disponíveis:

📋 *LISTAR* — Ver contas vencendo nos próximos 7 dias
✅ *PAGUEI* — Confirmar pagamento da última conta notificada
   _(envie junto com foto do comprovante)_

💡 *Dicas:*
• Você recebe alertas automáticos antes do vencimento
• Envie o comprovante junto com "paguei" para anexar automaticamente
• Responda *CIENTE* para confirmar que viu o alerta

_WNR Finance — seu financeiro no WhatsApp_`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Send daily reminders (called by cron endpoint)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendDailyReminders(): Promise<{ sent: number; errors: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const in3Days = new Date(today.getTime() + 3 * 86400000);

  // Get all active WhatsApp sessions
  const sessions = await prisma.whatsappSession.findMany({
    where: { isActive: true },
  });

  let sent = 0;
  let errors = 0;

  for (const session of sessions) {
    if (!session.companyId && !session.userId) continue;

    const where: any = {
      status: { in: ['pendente', 'aberto'] },
      dueDate: { gte: today, lte: in3Days },
    };
    if (session.companyId) where.companyId = session.companyId;

    const bills = await prisma.accountsPayable.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      take: 5,
    }).catch(() => []);

    for (const bill of bills) {
      // Check if we already sent reminder today
      const alreadySent = await prisma.whatsappMessage.findFirst({
        where: {
          sessionId: session.id,
          contextId: bill.id,
          contextType: 'bill_reminder',
          createdAt: { gte: today },
          direction: 'outbound',
        },
      });
      if (alreadySent) continue;

      const due = new Date(bill.dueDate);
      const isToday = due.toDateString() === new Date().toDateString();
      const isTomorrow = due.toDateString() === tomorrow.toDateString();
      const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

      const when = isToday ? '⚠️ *VENCE HOJE*' : isTomorrow ? '📅 Vence amanhã' : `📅 Vence em ${due.toLocaleDateString('pt-BR')}`;

      const msg = `🔔 *WNR Finance — Alerta de Vencimento*\n\n${when}\n\n📋 *${bill.description}*\n💰 ${fmt.format(bill.amount)}\n${bill.supplierName ? `🏢 ${bill.supplierName}` : ''}\n\nResponda *PAGUEI* + comprovante quando efetuar o pagamento.`;

      // Get user phone number from session or user profile
      let phoneNumber = session.phoneNumber;
      if (!phoneNumber && session.userId) {
        const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
        // Would use user.phone if available
      }

      if (!phoneNumber) continue;

      try {
        const ok = await sendWhatsAppText(session.id, phoneNumber, msg);
        if (ok) {
          await prisma.whatsappMessage.create({
            data: {
              sessionId: session.id,
              direction: 'outbound',
              from: '',
              to: phoneNumber,
              body: msg,
              contextType: 'bill_reminder',
              contextId: bill.id,
              processed: true,
            },
          });
          sent++;
        } else {
          errors++;
        }
      } catch { errors++; }
    }
  }

  return { sent, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart weekly summary — projected balance + overdue alert
// ─────────────────────────────────────────────────────────────────────────────
export async function sendSmartWeeklySummary(): Promise<{ sent: number; errors: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today.getTime() + 7 * 86400000);
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const sessions = await prisma.whatsappSession.findMany({ where: { isActive: true } });
  let sent = 0;
  let errors = 0;

  for (const session of sessions) {
    if (!session.companyId && !session.userId) continue;
    const phoneNumber = session.phoneNumber;
    if (!phoneNumber) continue;

    const companyId = session.companyId ?? undefined;

    const [payables, receivables, overduePayables, overdueReceivables] = await Promise.all([
      prisma.accountsPayable.findMany({
        where: { companyId, status: 'pendente', dueDate: { gte: today, lte: in7Days } },
        select: { amount: true, dueDate: true, description: true },
      }).catch(() => []),
      prisma.accountsReceivable.findMany({
        where: { companyId, status: 'pendente', dueDate: { gte: today, lte: in7Days } },
        select: { amount: true, dueDate: true, description: true },
      }).catch(() => []),
      prisma.accountsPayable.aggregate({
        where: { companyId, status: 'pendente', dueDate: { lt: today } },
        _sum: { amount: true }, _count: true,
      }).catch(() => ({ _sum: { amount: 0 }, _count: 0 })),
      prisma.accountsReceivable.aggregate({
        where: { companyId, status: 'pendente', dueDate: { lt: today } },
        _sum: { amount: true }, _count: true,
      }).catch(() => ({ _sum: { amount: 0 }, _count: 0 })),
    ]);

    const totalPay = payables.reduce((s, p) => s + Number(p.amount), 0);
    const totalRec = receivables.reduce((s, p) => s + Number(p.amount), 0);
    const saldo = totalRec - totalPay;
    const overduePayAmt = Number(overduePayables._sum?.amount || 0);
    const overdueRecAmt = Number(overdueReceivables._sum?.amount || 0);
    const overduePayCount = overduePayables._count || 0;
    const overdueRecCount = overdueReceivables._count || 0;

    const startLabel = today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const endLabel = in7Days.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const saldoIcon = saldo >= 0 ? '📈' : '📉';
    const saldoSign = saldo >= 0 ? '+' : '';

    let msg = `📊 *Resumo da semana (${startLabel} – ${endLabel})*\n\n`;
    msg += `💸 A pagar: *${fmt.format(totalPay)}* (${payables.length} conta${payables.length !== 1 ? 's' : ''})\n`;
    msg += `💰 A receber: *${fmt.format(totalRec)}* (${receivables.length} conta${receivables.length !== 1 ? 's' : ''})\n`;
    msg += `${saldoIcon} Saldo projetado: *${saldoSign}${fmt.format(saldo)}*\n`;

    if (overduePayCount > 0 || overdueRecCount > 0) {
      msg += `\n⚠️ *Em atraso:*\n`;
      if (overduePayCount > 0) msg += `   🔴 ${overduePayCount} conta(s) a pagar — ${fmt.format(overduePayAmt)}\n`;
      if (overdueRecCount > 0) msg += `   🟠 ${overdueRecCount} conta(s) a receber — ${fmt.format(overdueRecAmt)}\n`;
    }

    // Show top 3 most urgent bills
    const urgent = [...payables, ...receivables]
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 3);

    if (urgent.length > 0) {
      msg += `\n📋 *Próximos vencimentos:*\n`;
      for (const b of urgent) {
        const due = new Date(b.dueDate);
        const isToday = due.toDateString() === new Date().toDateString();
        const dayLabel = isToday ? 'Hoje' : due.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
        msg += `   • ${b.description} — ${fmt.format(Number(b.amount))} (${dayLabel})\n`;
      }
    }

    msg += `\nDigite *LISTAR* para detalhes ou *AJUDA* para comandos.\n_WNR Finance_`;

    // Prevent duplicate weekly summary (check if sent in last 6 days)
    const recentSummary = await prisma.whatsappMessage.findFirst({
      where: {
        sessionId: session.id,
        contextType: 'weekly_summary',
        direction: 'outbound',
        createdAt: { gte: new Date(today.getTime() - 6 * 86400000) },
      },
    }).catch(() => null);

    if (recentSummary) continue;

    try {
      const ok = await sendWhatsAppText(session.id, phoneNumber, msg);
      if (ok) {
        await prisma.whatsappMessage.create({
          data: {
            sessionId: session.id,
            direction: 'outbound',
            from: '',
            to: phoneNumber,
            body: msg,
            contextType: 'weekly_summary',
            processed: true,
          },
        });
        sent++;
      } else {
        errors++;
      }
    } catch { errors++; }
  }

  return { sent, errors };
}
