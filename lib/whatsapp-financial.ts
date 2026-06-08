// WhatsApp Financial — envio de documentos financeiros via Meta Cloud API
// Suporta NFS-e, Boleto, PIX, Link de pagamento, Aviso de vencimento, Cobrança em atraso
// Usa templates aprovados pela Meta para mensagens iniciadas pela empresa

import { prisma } from '@/lib/db';
import { safeDecrypt } from '@/lib/encrypt';

const META_BASE = 'https://graph.facebook.com/v19.0';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WaFinancialType =
  | 'nfse'
  | 'boleto'
  | 'pix'
  | 'payment_link'
  | 'aviso_vencimento'
  | 'cobranca_atraso';

export interface WaFinancialPayload {
  phone: string; // número com código do país, ex: 5511999990000
  type: WaFinancialType;
  customerName: string;
  amount: number;
  dueDate?: string; // ISO string
  documentNumber?: string; // número NF, boleto, etc.
  pixCode?: string; // copia e cola PIX
  boletoCode?: string; // código de barras
  paymentLink?: string; // link de pagamento
  pdfUrl?: string; // URL do PDF da NF ou boleto
  companyName?: string;
  daysOverdue?: number; // dias em atraso
  contextId?: string; // ID do registro (receivable, nfe, etc.)
  contextType?: string; // nfse, boleto, pix, etc.
}

// ─────────────────────────────────────────────────────────────────────────────
// Get Meta session for company
// ─────────────────────────────────────────────────────────────────────────────

async function getMetaSession(companyId: string) {
  const session = await prisma.whatsappSession.findFirst({
    where: { companyId, provider: 'meta', isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!session) return null;
  const token = safeDecrypt(session.accessToken || '') || session.accessToken;
  return { session, token, phoneNumberId: session.phoneNumberId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Message text builders — fallback to text if no approved template
// ─────────────────────────────────────────────────────────────────────────────

function formatBRL(amount: number): string {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildMessage(payload: WaFinancialPayload): string {
  const amt = formatBRL(payload.amount);
  const due = payload.dueDate ? new Date(payload.dueDate).toLocaleDateString('pt-BR') : '';
  const company = payload.companyName || 'Nossa empresa';

  switch (payload.type) {
    case 'nfse':
      return `📄 *Nota Fiscal emitida*\n\nOlá, ${payload.customerName}!\n\nSua NFS-e *${payload.documentNumber || ''}* no valor de *${amt}* foi emitida com sucesso.\n${payload.pdfUrl ? `\n🔗 Baixar NFS-e: ${payload.pdfUrl}` : ''}\n\n_${company}_`;

    case 'boleto':
      return `🏦 *Boleto gerado*\n\nOlá, ${payload.customerName}!\n\nSeu boleto de *${amt}* com vencimento em *${due}* está disponível.\n${payload.boletoCode ? `\n*Código de barras:*\n\`${payload.boletoCode}\`` : ''}${payload.pdfUrl ? `\n\n📄 Baixar boleto: ${payload.pdfUrl}` : ''}\n\n_${company}_`;

    case 'pix':
      return `💸 *Pix gerado*\n\nOlá, ${payload.customerName}!\n\nVocê tem uma cobrança via Pix de *${amt}*${due ? ` com vencimento em *${due}*` : ''}.\n${payload.pixCode ? `\n*Pix Copia e Cola:*\n\`${payload.pixCode}\`` : ''}${payload.paymentLink ? `\n\n🔗 Link de pagamento: ${payload.paymentLink}` : ''}\n\n_${company}_`;

    case 'payment_link':
      return `🔗 *Link de pagamento*\n\nOlá, ${payload.customerName}!\n\nAcesse o link abaixo para realizar o pagamento de *${amt}*:\n\n${payload.paymentLink}\n\n_${company}_`;

    case 'aviso_vencimento':
      return `⚠️ *Aviso de vencimento*\n\nOlá, ${payload.customerName}!\n\nLembramos que sua fatura de *${amt}* vence amanhã (${due}).\n${payload.pixCode ? `\n*Pix Copia e Cola:*\n\`${payload.pixCode}\`` : ''}${payload.boletoCode ? `\n*Código de barras:*\n\`${payload.boletoCode}\`` : ''}${payload.paymentLink ? `\n\n🔗 Pagar agora: ${payload.paymentLink}` : ''}\n\n_${company}_`;

    case 'cobranca_atraso':
      return `🔴 *Cobrança — pagamento em atraso*\n\nOlá, ${payload.customerName}!\n\nIdentificamos que sua fatura de *${amt}*${due ? ` (vencida em ${due})` : ''} ainda não foi quitada${payload.daysOverdue ? ` (${payload.daysOverdue} dias em atraso)` : ''}.\n\nEvite juros e regularize agora:\n${payload.pixCode ? `\n*Pix Copia e Cola:*\n\`${payload.pixCode}\`` : ''}${payload.boletoCode ? `\n*Código de barras:*\n\`${payload.boletoCode}\`` : ''}${payload.paymentLink ? `\n\n🔗 Pagar agora: ${payload.paymentLink}` : ''}\n\nEm caso de dúvidas, entre em contato.\n\n_${company}_`;

    default:
      return `Olá, ${payload.customerName}! Mensagem financeira de *${company}*.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send via Meta Cloud API (text message with template fallback)
// ─────────────────────────────────────────────────────────────────────────────

async function sendMetaText(
  phoneNumberId: string,
  token: string,
  to: string,
  body: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phone = to.replace(/\D/g, '');
  const res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body },
    }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
  }
  return { success: true, messageId: data?.messages?.[0]?.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main send function
// ─────────────────────────────────────────────────────────────────────────────

export async function sendFinancialWhatsApp(
  companyId: string,
  payload: WaFinancialPayload,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const meta = await getMetaSession(companyId);
  if (!meta || !meta.token || !meta.phoneNumberId) {
    return { success: false, error: 'Nenhuma sessão WhatsApp Meta ativa configurada' };
  }

  const text = buildMessage(payload);
  const result = await sendMetaText(meta.phoneNumberId, meta.token, payload.phone, text);

  const sessionId = meta.session.id;
  await prisma.whatsappMessage.create({
    data: {
      sessionId,
      direction: 'outbound',
      from: meta.session.phoneNumber || meta.phoneNumberId,
      to: payload.phone,
      body: text,
      contextType: payload.contextType || payload.type,
      contextId: payload.contextId,
      externalMsgId: result.messageId,
      deliveryStatus: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
      templateName: payload.type,
    },
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enqueue for batch sending (stores in WhatsappMessage as pending)
// ─────────────────────────────────────────────────────────────────────────────

export async function enqueueFinancialWhatsApp(
  companyId: string,
  sessionId: string,
  payload: WaFinancialPayload,
): Promise<void> {
  const text = buildMessage(payload);
  await prisma.whatsappMessage.create({
    data: {
      sessionId,
      direction: 'outbound',
      from: '',
      to: payload.phone,
      body: text,
      contextType: payload.contextType || payload.type,
      contextId: payload.contextId,
      deliveryStatus: 'pending',
      templateName: payload.type,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Update delivery status from webhook (called by webhook handler)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateDeliveryStatus(
  externalMsgId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  errorMessage?: string,
): Promise<void> {
  await prisma.whatsappMessage.updateMany({
    where: { externalMsgId },
    data: { deliveryStatus: status, ...(errorMessage ? { errorMessage } : {}) },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Get message history for a context (e.g., receivable ID)
// ─────────────────────────────────────────────────────────────────────────────

export async function getMessageHistory(contextId: string, contextType?: string) {
  return prisma.whatsappMessage.findMany({
    where: {
      contextId,
      ...(contextType ? { contextType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, to: true, body: true, deliveryStatus: true,
      contextType: true, createdAt: true, templateName: true,
    },
  });
}
