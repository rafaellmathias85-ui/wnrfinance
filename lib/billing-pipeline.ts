// Pipeline de faturamento (paridade BomControle, melhorado).
//
// Conceito: o CONTRATO projeta PARCELAS (AccountsReceivable PREVISTA) com
// competência, data de faturamento (vencimento − billingLeadDays) e vencimento.
// "Faturar" uma parcela = emitir NFS-e (se configurado) + boleto/pix (se
// configurado) + enviar fatura por e-mail aos contatos de cobrança, com estado
// independente por artefato e idempotência em todas as etapas.
//
//   PREVISTA ──faturarParcela()──▶ FATURADA ──webhook/conciliação──▶ QUITADA ▶ CONCILIADA
//
// Cada artefato tem ciclo próprio (nfeStatus, boletoStatus, emailStatus):
// falha na NF não impede reenvio de e-mail; falha no boleto não cancela a NF.

import { prisma } from '@/lib/prisma';
import { runReceivableAutomation, type AutomationResult } from '@/lib/receivable-automation';
import { transitionBillingStatus } from '@/lib/billing-state';
import { createAuditLog } from '@/lib/audit-log';
import { getDefaultSmtpConfig, sendEmailWithConfig } from '@/lib/smtp';
import { formatBRL } from '@/lib/money';

// ─────────────────────────────────────────────────────────────────────────────
// Projeção de parcelas do contrato
// ─────────────────────────────────────────────────────────────────────────────

function addCycle(date: Date, cycle: string): Date | null {
  const next = new Date(date);
  if (cycle === 'anual') next.setFullYear(next.getFullYear() + 1);
  else if (cycle === 'semestral') next.setMonth(next.getMonth() + 6);
  else if (cycle === 'trimestral') next.setMonth(next.getMonth() + 3);
  else if (cycle === 'unico' || cycle === 'sob_demanda') return null;
  else next.setMonth(next.getMonth() + 1); // mensal
  return next;
}

function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dueDateInMonth(year: number, monthIndex0: number, day: number): Date {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  return new Date(year, monthIndex0, Math.min(Math.max(day, 1), lastDay), 12, 0, 0);
}

export interface ProjectionResult {
  created: number;
  skipped: number;
  horizonEnd: Date;
}

/**
 * Materializa parcelas PREVISTAS do contrato para os próximos `horizonMonths`
 * meses (rolling). Idempotente: dedup por (sourceId, billingPeriod).
 * billingDate = vencimento − contract.billingLeadDays (paridade BomControle).
 */
export async function projectContractInstallments(
  contractId: string,
  options: { horizonMonths?: number; userId?: string | null } = {},
): Promise<ProjectionResult> {
  const horizonMonths = options.horizonMonths ?? 12;
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new Error('Contrato não encontrado');
  if (contract.status !== 'ativo') return { created: 0, skipped: 0, horizonEnd: new Date() };
  if (contract.billingCycle === 'sob_demanda') return { created: 0, skipped: 0, horizonEnd: new Date() };

  const today = new Date();
  const horizonEnd = new Date(today);
  horizonEnd.setMonth(horizonEnd.getMonth() + horizonMonths);

  const billingDay = contract.billingDay || contract.startDate.getDate();
  const leadDays = contract.billingLeadDays ?? 4;

  // Primeira competência: máx(início do contrato, hoje − 1 ciclo) para não gerar passado profundo
  let cursor = new Date(Math.max(contract.startDate.getTime(), new Date(today.getFullYear(), today.getMonth(), 1).getTime()));

  let created = 0;
  let skipped = 0;

  while (cursor <= horizonEnd) {
    if (contract.endDate && cursor > contract.endDate) break;

    const dueDate = dueDateInMonth(cursor.getFullYear(), cursor.getMonth(), billingDay);
    const period = periodOf(dueDate);
    const billingDate = new Date(dueDate);
    billingDate.setDate(billingDate.getDate() - leadDays);

    const exists = await prisma.accountsReceivable.findFirst({
      where: {
        companyId: contract.companyId,
        sourceType: 'contract',
        sourceId: contract.id,
        billingPeriod: period,
        status: { not: 'cancelado' },
      },
      select: { id: true },
    });

    if (exists) {
      skipped++;
    } else if (dueDate >= contract.startDate) {
      await prisma.accountsReceivable.create({
        data: {
          companyId: contract.companyId,
          description: `${contract.title} — competência ${period.split('-').reverse().join('/')}`,
          customerName: contract.clientName,
          customerDoc: contract.clientDoc || null,
          customerEmail: contract.clientEmail || null,
          categoryId: contract.categoryId || null,
          costCenterId: contract.costCenterId || null,
          dueDate,
          amount: contract.value,
          status: 'pendente',
          billingStatus: 'PREVISTA',
          billingDate,
          sourceType: 'contract',
          sourceId: contract.id,
          billingPeriod: period,
          autoNfe: contract.requiresNFe,
          autoBoleto: contract.requiresBoleto,
          chargeType: contract.chargeType,
          fiscalRuleId: contract.fiscalRuleId || null,
          isRecurring: true,
          createdBy: options.userId || contract.createdBy || null,
          generateBoleto: contract.requiresBoleto,
          generatePix: contract.chargeType !== 'boleto',
          generateNfe: contract.requiresNFe,
        },
      });
      created++;
    }

    const next = addCycle(cursor, contract.billingCycle);
    if (!next) break; // ciclo único
    cursor = next;
  }

  return { created, skipped, horizonEnd };
}

// ─────────────────────────────────────────────────────────────────────────────
// Faturar parcela (orquestrador idempotente)
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingPipelineResult {
  receivableId: string;
  ok: boolean;
  alreadyBilled?: boolean;
  nfe?: { id?: string; status: string; errorMessage?: string };
  boleto?: { id?: string; status: string; errorMessage?: string };
  email?: { status: string; errorMessage?: string };
  error?: string;
}

function mapNfeArtifactStatus(status?: string): string | null {
  if (!status) return null;
  if (['enviada', 'autorizada'].includes(status)) return 'emitida';
  if (status === 'bloqueada') return 'erro';
  if (status === 'cancelada') return 'cancelada';
  if (status === 'rascunho') return 'pendente';
  return status;
}

function mapBoletoArtifactStatus(r?: { status: string; errorMessage?: string }): string | null {
  if (!r) return null;
  if (r.errorMessage) return 'erro';
  if (r.status === 'pendente') return 'registrado';
  if (r.status === 'pago') return 'pago';
  if (r.status === 'cancelado') return 'cancelado';
  if (r.status === 'bloqueada') return 'erro';
  return r.status;
}

/**
 * Fatura uma parcela: NFS-e + boleto/pix + e-mail, com status por artefato.
 * Idempotente: parcelas já FATURADAS retornam sem duplicar nada (as automações
 * internas também são idempotentes — NF e boleto existentes são reutilizados).
 */
export async function faturarParcela(
  receivableId: string,
  opts: { userId?: string | null; sendEmail?: boolean; force?: boolean } = {},
): Promise<BillingPipelineResult> {
  const receivable = await prisma.accountsReceivable.findUnique({ where: { id: receivableId } });
  if (!receivable) return { receivableId, ok: false, error: 'Parcela não encontrada' };

  const status = receivable.billingStatus || 'FATURADA';
  if (status === 'CANCELADA') return { receivableId, ok: false, error: 'Parcela cancelada' };
  if (['QUITADA', 'CONCILIADA'].includes(status)) {
    return { receivableId, ok: true, alreadyBilled: true };
  }

  const result: BillingPipelineResult = { receivableId, ok: true };
  const companyId = receivable.companyId;

  // 1+2. NFS-e e boleto (idempotentes — reutilizam artefatos existentes)
  let automation: AutomationResult = {};
  if (receivable.autoNfe || receivable.autoBoleto) {
    try {
      automation = await runReceivableAutomation(receivableId, companyId, {
        nfe: receivable.autoNfe,
        boleto: receivable.autoBoleto,
      });
      result.nfe = automation.nfe;
      result.boleto = automation.boleto;
    } catch (err: any) {
      result.ok = false;
      result.error = `Automação falhou: ${err?.message}`;
    }
  }

  // 3. E-mail da fatura aos contatos de cobrança
  const wantEmail = opts.sendEmail !== false;
  if (wantEmail && result.ok !== false) {
    result.email = await sendInvoiceEmail(receivable, automation);
  }

  // 4. Estados por artefato + transição PREVISTA → FATURADA
  const artifactData: Record<string, unknown> = {
    nfeStatus: mapNfeArtifactStatus(result.nfe?.status) ?? (receivable.autoNfe ? 'pendente' : null),
    boletoStatus: mapBoletoArtifactStatus(result.boleto) ?? (receivable.autoBoleto ? 'pendente' : null),
    emailStatus: result.email?.status ?? null,
    ...(result.email?.status === 'enviado' ? { invoiceSentAt: new Date() } : {}),
  };

  if (status === 'PREVISTA') {
    await transitionBillingStatus(receivableId, 'FATURADA', {
      userId: opts.userId || undefined,
      companyId,
      data: artifactData,
      notes: 'Pipeline de faturamento',
    });
  } else {
    await prisma.accountsReceivable.update({ where: { id: receivableId }, data: artifactData });
  }

  await createAuditLog({
    userId: opts.userId || 'system',
    companyId,
    action: 'SEND',
    entity: 'receivable',
    entityId: receivableId,
    metadata: {
      event: 'faturar_parcela',
      nfe: result.nfe?.status,
      boleto: result.boleto?.status,
      email: result.email?.status,
    },
  });

  return result;
}

async function sendInvoiceEmail(
  receivable: any,
  automation: AutomationResult,
): Promise<{ status: string; errorMessage?: string }> {
  try {
    const smtp = await getDefaultSmtpConfig(receivable.companyId);
    if (!smtp) return { status: 'erro', errorMessage: 'SMTP não configurado' };

    // Destinatários: contatos de cobrança do cliente + e-mail direto do recebível
    const recipients = new Set<string>();
    if (receivable.customerEmail) recipients.add(receivable.customerEmail);

    if (receivable.customerDoc) {
      const doc = receivable.customerDoc;
      const client = await prisma.client.findFirst({
        where: {
          companyId: receivable.companyId,
          OR: [{ document: doc }, { cnpj: doc }, { cpf: doc }],
        },
        select: { id: true },
      });
      if (client) {
        const contacts = await prisma.clientContact.findMany({
          where: { clientId: client.id, isBilling: true, email: { not: null } },
          select: { email: true },
        });
        contacts.forEach((c) => c.email && recipients.add(c.email));
      }
    }

    if (recipients.size === 0) return { status: 'erro', errorMessage: 'Nenhum contato de cobrança com e-mail' };

    const charge = automation.boleto?.id
      ? await prisma.boletoCharge.findUnique({
          where: { id: automation.boleto.id },
          select: { boletoUrl: true, pixCopiaECola: true, pixQrCodeUrl: true },
        })
      : null;
    const nfe = automation.nfe?.id
      ? await prisma.nFe.findUnique({ where: { id: automation.nfe.id }, select: { pdfUrl: true, number: true } })
      : null;

    const due = new Date(receivable.dueDate).toLocaleDateString('pt-BR');
    const lines = [
      `<p>Olá, ${receivable.customerName || 'cliente'}!</p>`,
      `<p>Sua fatura <strong>${receivable.description}</strong> foi gerada.</p>`,
      `<p><strong>Valor:</strong> ${formatBRL(receivable.amount)}<br/><strong>Vencimento:</strong> ${due}</p>`,
    ];
    if (charge?.boletoUrl) lines.push(`<p><a href="${charge.boletoUrl}">Visualizar boleto</a></p>`);
    if (charge?.pixCopiaECola) lines.push(`<p><strong>Pix copia e cola:</strong><br/><code style="word-break:break-all">${charge.pixCopiaECola}</code></p>`);
    if (nfe?.pdfUrl) lines.push(`<p><a href="${nfe.pdfUrl}">Nota fiscal ${nfe.number || ''}</a></p>`);
    lines.push('<p>Em caso de dúvidas, responda este e-mail.</p>');

    const sent = await sendEmailWithConfig(
      smtp.id,
      {
        to: Array.from(recipients),
        subject: `Fatura ${receivable.description} — vencimento ${due}`,
        html: lines.join('\n'),
      },
      'receivable_invoice',
      receivable.id,
    );

    if (!sent.success) return { status: 'erro', errorMessage: sent.error };
    return { status: 'enviado' };
  } catch (err: any) {
    return { status: 'erro', errorMessage: err?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução diária (cron) — projeta e fatura o que chegou na data
// ─────────────────────────────────────────────────────────────────────────────

export async function runDailyBillingPipeline(params: { companyId?: string; limit?: number } = {}) {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Estende a projeção de parcelas dos contratos ativos (rolling 12 meses)
  const contracts = await prisma.contract.findMany({
    where: {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      status: 'ativo',
      billingCycle: { notIn: ['sob_demanda'] },
    },
    select: { id: true },
    take: params.limit || 200,
  });

  let projected = 0;
  for (const c of contracts) {
    try {
      const r = await projectContractInstallments(c.id);
      projected += r.created;
    } catch (err: any) {
      console.error(`[BillingPipeline] projeção falhou (${c.id}):`, err?.message);
    }
  }

  // 2. Fatura parcelas PREVISTAS cuja data de faturamento chegou
  const dueToBill = await prisma.accountsReceivable.findMany({
    where: {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      billingStatus: 'PREVISTA',
      OR: [{ billingDate: { lte: endOfDay } }, { billingDate: null, dueDate: { lte: endOfDay } }],
    },
    select: { id: true },
    take: params.limit || 200,
  });

  let billed = 0;
  let failed = 0;
  const details: BillingPipelineResult[] = [];
  for (const r of dueToBill) {
    const res = await faturarParcela(r.id);
    details.push(res);
    if (res.ok) billed++;
    else failed++;
  }

  // 3. Marca VENCIDA o que passou do vencimento sem pagamento
  const overdue = await prisma.accountsReceivable.findMany({
    where: {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      billingStatus: 'FATURADA',
      dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
    select: { id: true, companyId: true },
    take: 500,
  });
  for (const r of overdue) {
    try {
      await transitionBillingStatus(r.id, 'VENCIDA', { companyId: r.companyId, notes: 'Cron diário' });
    } catch {
      /* já transicionada */
    }
  }

  return { projected, billed, failed, overdueMarked: overdue.length, details };
}
