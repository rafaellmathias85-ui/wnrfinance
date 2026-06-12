export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDefaultSmtpConfig, enqueueEmail } from '@/lib/smtp';
import { getSession, sendWhatsAppText } from '@/lib/whatsapp';
import { businessDaysBetween } from '@/lib/business-days';

function authorize(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';
  if (!cronSecret) {
    // fail-closed em produção
    return process.env.NODE_ENV !== 'production';
  }
  return authHeader === `Bearer ${cronSecret}`;
}

interface Trigger {
  type: 'before' | 'on' | 'after';
  days: number;
  channels: ('email' | 'whatsapp')[];
  template: string;
}

function interpolate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] || `{${k}}`);
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Lock distribuído — evita envio duplicado de cobranças com múltiplas instâncias
  const { acquireLock } = await import('@/src/lib/distributed-lock');
  const release = await acquireLock('collection-rules', 15 * 60 * 1000);
  if (!release) return NextResponse.json({ ok: false, skipped: 'lock_held' });

  try {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rules = await prisma.collectionRule.findMany({ where: { isActive: true } });

  let processed = 0;
  let sent = 0;
  let errors = 0;

  for (const rule of rules) {
    const triggers = rule.triggers as unknown as Trigger[];

    for (const trigger of triggers) {
      let receivables: any[];

      if (trigger.type === 'after') {
        // Inadimplência em DIAS ÚTEIS (paridade BomControle: sáb/dom/feriados
        // não contam no cálculo de atraso para envio).
        const overdue = await prisma.accountsReceivable.findMany({
          where: {
            companyId: rule.companyId,
            status: { in: ['pendente', 'vencido'] },
            dueDate: { lt: today, gte: new Date(today.getTime() - 90 * 86400000) },
          },
        });
        receivables = overdue.filter(
          (r) => businessDaysBetween(new Date(r.dueDate), today) === trigger.days,
        );
      } else {
        const targetDate = new Date(today);
        if (trigger.type === 'before') targetDate.setDate(targetDate.getDate() + trigger.days);
        const start = new Date(targetDate);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        receivables = await prisma.accountsReceivable.findMany({
          where: {
            companyId: rule.companyId,
            status: 'pendente',
            dueDate: { gte: start, lte: end },
          },
        });
      }

      for (const receivable of receivables) {
        processed++;

        for (const channel of trigger.channels) {
          try {
            const exists = await prisma.collectionRuleLog.findUnique({
              where: {
                collectionRuleId_receivableId_channel_triggerType_triggerDays: {
                  collectionRuleId: rule.id,
                  receivableId: receivable.id,
                  channel,
                  triggerType: trigger.type,
                  triggerDays: trigger.type === 'on' ? 0 : trigger.days,
                },
              },
            });

            if (exists) continue;

            // Variáveis ricas: dados do boleto/Pix vinculado (linha digitável,
            // link do boleto, Pix copia e cola) — paridade BomControle
            const charge = await prisma.boletoCharge.findFirst({
              where: { receivableId: receivable.id, status: { in: ['pendente', 'vencido'] } },
              orderBy: { createdAt: 'desc' },
              select: { boletoUrl: true, boletoBarCode: true, pixCopiaECola: true },
            });

            const vars = {
              nome: receivable.customerName || 'Cliente',
              cliente: receivable.customerName || 'Cliente',
              valor: receivable.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
              vencimento: receivable.dueDate.toLocaleDateString('pt-BR'),
              descricao: receivable.description || '',
              link_pagamento: charge?.boletoUrl || '',
              link_boleto: charge?.boletoUrl || '',
              linha_digitavel: charge?.boletoBarCode || '',
              pix_copia_cola: charge?.pixCopiaECola || '',
            };

            const message = interpolate(trigger.template, vars);

            if (channel === 'email' && receivable.customerEmail) {
              const smtpConfig = await getDefaultSmtpConfig(rule.companyId);
              if (smtpConfig) {
                await enqueueEmail(rule.companyId, smtpConfig.id, {
                  to: receivable.customerEmail,
                  subject: `Lembrete de cobrança — vencimento ${vars.vencimento}`,
                  html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
                  text: message,
                  contextType: 'cobranca',
                  contextId: receivable.id,
                });
              }
            } else if (channel === 'whatsapp') {
              const whatsappSession = await getSession(undefined, rule.companyId);
              if (whatsappSession?.id && receivable.customerDoc) {
                await sendWhatsAppText(whatsappSession.id, receivable.customerDoc, message);
              }
            }

            await prisma.collectionRuleLog.create({
              data: {
                collectionRuleId: rule.id,
                receivableId: receivable.id,
                channel,
                triggerType: trigger.type,
                triggerDays: trigger.type === 'on' ? 0 : trigger.days,
              },
            });

            sent++;
          } catch (err) {
            errors++;
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, processed, sent, errors, timestamp: new Date().toISOString() });
  } finally {
    await release();
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
