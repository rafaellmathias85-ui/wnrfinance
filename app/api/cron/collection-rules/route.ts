export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDefaultSmtpConfig, enqueueEmail } from '@/lib/smtp';
import { getSession, sendWhatsAppText } from '@/lib/whatsapp';

function authorize(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';
  if (!cronSecret) return true;
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rules = await prisma.collectionRule.findMany({ where: { isActive: true } });

  let processed = 0;
  let sent = 0;
  let errors = 0;

  for (const rule of rules) {
    const triggers = rule.triggers as unknown as Trigger[];

    for (const trigger of triggers) {
      let targetDate = new Date(today);
      if (trigger.type === 'before') {
        targetDate.setDate(targetDate.getDate() + trigger.days);
      } else if (trigger.type === 'after') {
        targetDate.setDate(targetDate.getDate() - trigger.days);
      }

      const start = new Date(targetDate);
      const end = new Date(targetDate);
      end.setHours(23, 59, 59, 999);

      const receivables = await prisma.accountsReceivable.findMany({
        where: {
          companyId: rule.companyId,
          status: trigger.type === 'after' ? { in: ['pendente', 'vencido'] } : 'pendente',
          dueDate: { gte: start, lte: end },
        },
      });

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

            const vars = {
              nome: receivable.customerName || 'Cliente',
              valor: receivable.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
              vencimento: receivable.dueDate.toLocaleDateString('pt-BR'),
              link_pagamento: '',
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
}

export async function GET(req: NextRequest) {
  return POST(req);
}
