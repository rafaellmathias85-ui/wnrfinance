// Geração automática de taxas bancárias (paridade BomControle, melhorado).
// Quando habilitado na conta (autoFeeEnabled), cada evento de cobrança gera
// automaticamente a DESPESA da tarifa em AccountsPayable:
//   - emissão/registro de boleto  → feeIssueAmount
//   - liquidação (pagamento)      → feeSettleAmount
//   - pix cobrança                → feePixAmount
// Idempotente por (evento, chargeId): a despesa carrega a chave em notes.

import { prisma } from '@/lib/prisma';

export type BankFeeEvent = 'issue' | 'settle' | 'pix' | 'cancel';

const FEE_DESCRIPTIONS: Record<BankFeeEvent, string> = {
  issue: 'Tarifa bancária — registro de boleto',
  settle: 'Tarifa bancária — liquidação de cobrança',
  pix: 'Tarifa bancária — Pix cobrança',
  cancel: 'Tarifa bancária — cancelamento de boleto',
};

function feeKey(event: BankFeeEvent, chargeId: string): string {
  return `bank_fee:${event}:${chargeId}`;
}

/**
 * Registra a tarifa do evento como conta a pagar, se a conta de cobrança da
 * empresa tiver geração automática de taxas habilitada. Idempotente.
 */
export async function registerBankFee(params: {
  companyId: string;
  chargeId: string;
  event: BankFeeEvent;
  eventDate?: Date;
}): Promise<{ created: boolean; payableId?: string }> {
  const { companyId, chargeId, event } = params;

  // Conta de cobrança ativa da empresa com taxas automáticas habilitadas
  const account = await prisma.bankConnection.findFirst({
    where: { companyId, autoFeeEnabled: true, status: { notIn: ['DISABLED'] } },
    select: {
      id: true,
      bankName: true,
      feeIssueAmount: true,
      feeSettleAmount: true,
      feePixAmount: true,
    },
  });
  if (!account) return { created: false };

  const amount =
    event === 'issue' || event === 'cancel'
      ? account.feeIssueAmount
      : event === 'pix'
        ? account.feePixAmount
        : account.feeSettleAmount;
  if (!amount || amount <= 0) return { created: false };

  const key = feeKey(event, chargeId);

  // Idempotência: já lançada?
  const existing = await prisma.accountsPayable.findFirst({
    where: { companyId, notes: { contains: key } },
    select: { id: true },
  });
  if (existing) return { created: false, payableId: existing.id };

  // Categoria "Tarifas Bancárias" (cria se não existir)
  let category = await prisma.businessCategory.findFirst({
    where: { companyId, name: { equals: 'Tarifas Bancárias', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!category) {
    category = await prisma.businessCategory.create({
      data: { companyId, name: 'Tarifas Bancárias', type: 'despesa' } as any,
      select: { id: true },
    }).catch(() => null as any);
  }

  const eventDate = params.eventDate || new Date();
  const charge = await prisma.boletoCharge.findUnique({
    where: { id: chargeId },
    select: { customerName: true, description: true },
  });

  const payable = await prisma.accountsPayable.create({
    data: {
      companyId,
      description: `${FEE_DESCRIPTIONS[event]} (${charge?.customerName || chargeId.slice(0, 8)})`,
      supplierName: account.bankName,
      categoryId: category?.id || null,
      dueDate: eventDate,
      amount,
      status: 'pago', // tarifa é debitada automaticamente pelo banco
      paidAt: eventDate,
      amountPaid: amount,
      paymentMethod: 'TARIFA',
      launchType: 'impostos',
      notes: `Gerada automaticamente. ${key}`,
      createdBy: 'system',
    },
  });

  return { created: true, payableId: payable.id };
}

/** Hook de conveniência chamado pelos webhooks de pagamento. */
export async function registerSettlementFees(companyId: string, chargeId: string, paidAt?: Date) {
  try {
    await registerBankFee({ companyId, chargeId, event: 'settle', eventDate: paidAt });
  } catch (err: any) {
    console.error('[BankFees] falha ao registrar tarifa de liquidação:', err?.message);
  }
}

/** Hook chamado na emissão de cobrança. */
export async function registerIssueFee(companyId: string, chargeId: string) {
  try {
    await registerBankFee({ companyId, chargeId, event: 'issue' });
  } catch (err: any) {
    console.error('[BankFees] falha ao registrar tarifa de emissão:', err?.message);
  }
}
