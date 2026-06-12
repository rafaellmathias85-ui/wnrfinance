// Máquina de estados do pipeline de faturamento (AccountsReceivable.billingStatus).
//
//   PREVISTA → FATURADA → QUITADA → CONCILIADA
//   FATURADA → VENCIDA → QUITADA
//   qualquer → CANCELADA
//
// REGRA DE OURO: nenhum módulo altera billingStatus diretamente — sempre via
// transitionBillingStatus(), que valida a transição, sincroniza o status financeiro
// legado e grava AuditLog. Isso mantém fatura ↔ NF ↔ boleto ↔ extrato sem furos.

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit-log';

export type BillingStatus =
  | 'PREVISTA'
  | 'FATURADA'
  | 'QUITADA'
  | 'CONCILIADA'
  | 'VENCIDA'
  | 'CANCELADA';

const TRANSITIONS: Record<BillingStatus, BillingStatus[]> = {
  PREVISTA: ['FATURADA', 'CANCELADA'],
  FATURADA: ['QUITADA', 'VENCIDA', 'CANCELADA'],
  VENCIDA: ['QUITADA', 'CANCELADA'],
  QUITADA: ['CONCILIADA', 'CANCELADA'], // cancelar pós-quitação = estorno explícito
  CONCILIADA: ['CANCELADA'],
  CANCELADA: [],
};

/** Mapeia o estado do pipeline para o status financeiro legado (compatibilidade). */
const LEGACY_STATUS: Record<BillingStatus, string> = {
  PREVISTA: 'pendente',
  FATURADA: 'pendente',
  VENCIDA: 'vencido',
  QUITADA: 'recebido',
  CONCILIADA: 'recebido',
  CANCELADA: 'cancelado',
};

export function canTransition(from: BillingStatus, to: BillingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionExtras {
  userId?: string;
  companyId?: string;
  /** Campos extras a gravar junto (ex.: receivedAt, amountReceived, reconciledAt). */
  data?: Record<string, unknown>;
  /** Cliente prisma transacional (trx) quando chamado dentro de $transaction. */
  tx?: any;
  notes?: string;
}

/**
 * Transiciona o estado de pipeline de um recebível com validação e auditoria.
 * Lança erro em transição inválida.
 */
export async function transitionBillingStatus(
  receivableId: string,
  to: BillingStatus,
  extras: TransitionExtras = {},
): Promise<void> {
  const db = extras.tx ?? prisma;

  const current = await db.accountsReceivable.findUnique({
    where: { id: receivableId },
    select: { id: true, billingStatus: true, companyId: true },
  });
  if (!current) throw new Error(`Recebível ${receivableId} não encontrado`);

  const from = (current.billingStatus || 'FATURADA') as BillingStatus;
  if (from === to) return; // idempotente

  if (!canTransition(from, to)) {
    throw new Error(`Transição de faturamento inválida: ${from} → ${to} (recebível ${receivableId})`);
  }

  const stamps: Record<string, unknown> = {};
  const now = new Date();
  if (to === 'FATURADA') stamps.billedAt = now;
  if (to === 'QUITADA') stamps.receivedAt = (extras.data as any)?.receivedAt ?? now;
  if (to === 'CONCILIADA') stamps.reconciledAt = now;

  await db.accountsReceivable.update({
    where: { id: receivableId },
    data: {
      billingStatus: to,
      status: LEGACY_STATUS[to],
      ...stamps,
      ...(extras.data || {}),
    },
  });

  // Auditoria fora da transação não é crítica; dentro, usa o mesmo tx se suportado
  try {
    await createAuditLog({
      userId: extras.userId || 'system',
      companyId: extras.companyId ?? current.companyId,
      action: 'UPDATE',
      entity: 'receivable',
      entityId: receivableId,
      metadata: { event: 'billing_status_transition', from, to, notes: extras.notes },
    });
  } catch {
    /* auditoria não bloqueia o fluxo */
  }
}

/** Estados que contam como "em aberto" para inadimplência/cobrança. */
export const OPEN_STATUSES: BillingStatus[] = ['FATURADA', 'VENCIDA'];

/** Estados elegíveis para faturamento pelo pipeline. */
export const BILLABLE_STATUSES: BillingStatus[] = ['PREVISTA'];
