import { prisma } from '@/lib/prisma';
import { runReceivableAutomation, type AutomationResult } from '@/lib/receivable-automation';

export type ContractBillingResult = {
  contract: any;
  receivable: any;
  automation: AutomationResult | null;
  duplicated: boolean;
};

export function currentBillingPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function dueDateForBillingPeriod(period: string, billingDay?: number | null) {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(billingDay || 1, 1), lastDay);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function getNextBillingDate(from: Date, cycle: string) {
  const next = new Date(from);
  if (cycle === 'anual') next.setFullYear(next.getFullYear() + 1);
  else if (cycle === 'semestral') next.setMonth(next.getMonth() + 6);
  else if (cycle === 'trimestral') next.setMonth(next.getMonth() + 3);
  else if (cycle === 'unico' || cycle === 'sob_demanda') return null;
  else next.setMonth(next.getMonth() + 1);
  return next;
}

export async function generateContractBilling(params: {
  companyId: string;
  contractId: string;
  userId?: string | null;
  period?: string;
  dueDate?: Date;
  description?: string;
  notes?: string;
}): Promise<ContractBillingResult> {
  const contract = await prisma.contract.findFirst({
    where: { id: params.contractId, companyId: params.companyId },
  });
  if (!contract) throw new Error('Contrato nao encontrado');
  if (contract.status !== 'ativo') throw new Error('Apenas contratos ativos podem gerar faturamento');

  const period = params.period || currentBillingPeriod();
  const dueDate = params.dueDate || dueDateForBillingPeriod(
    period,
    contract.billingDay || contract.startDate.getDate()
  );

  const existingReceivable = await prisma.accountsReceivable.findFirst({
    where: {
      companyId: params.companyId,
      sourceType: 'contract',
      sourceId: contract.id,
      billingPeriod: period,
      status: { not: 'cancelado' },
    },
  });

  if (existingReceivable) {
    const updatedContract = await prisma.contract.update({
      where: { id: contract.id },
      data: {
        lastBilledAt: new Date(),
        nextBillingDate: getNextBillingDate(dueDate, contract.billingCycle),
      },
    });
    return { contract: updatedContract, receivable: existingReceivable, automation: null, duplicated: true };
  }

  const receivable = await prisma.accountsReceivable.create({
    data: {
      companyId: params.companyId,
      description: params.description || contract.title,
      customerName: contract.clientName,
      customerDoc: contract.clientDoc || null,
      customerEmail: contract.clientEmail || null,
      categoryId: contract.categoryId || null,
      costCenterId: contract.costCenterId || null,
      dueDate,
      amount: contract.value,
      status: 'pendente',
      sourceType: 'contract',
      sourceId: contract.id,
      billingPeriod: period,
      autoNfe: contract.requiresNFe,
      autoBoleto: contract.requiresBoleto,
      chargeType: contract.chargeType,
      fiscalRuleId: contract.fiscalRuleId || null,
      notes: params.notes || contract.description || null,
      createdBy: params.userId || contract.createdBy || null,
    },
  });

  const automation = (contract.requiresNFe || contract.requiresBoleto)
    ? await runReceivableAutomation(receivable.id, params.companyId, {
        nfe: contract.requiresNFe,
        boleto: contract.requiresBoleto,
      })
    : null;

  const updatedContract = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      lastBilledAt: new Date(),
      nextBillingDate: getNextBillingDate(dueDate, contract.billingCycle),
    },
  });

  return { contract: updatedContract, receivable, automation, duplicated: false };
}

export async function runRecurringContractBilling(params: {
  companyId?: string;
  today?: Date;
  userId?: string | null;
  limit?: number;
}) {
  const today = params.today || new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  const period = currentBillingPeriod(today);

  const contracts = await prisma.contract.findMany({
    where: {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      status: 'ativo',
      billingCycle: { notIn: ['sob_demanda'] },
      OR: [
        { nextBillingDate: { lte: endOfDay } },
        {
          nextBillingDate: null,
          startDate: { lte: endOfDay },
        },
      ],
    },
    orderBy: [{ nextBillingDate: 'asc' }, { startDate: 'asc' }],
    take: params.limit || 100,
  });

  let generated = 0;
  let duplicated = 0;
  let errors = 0;
  const details: Array<{ contractId: string; receivableId?: string; duplicated?: boolean; error?: string; automation?: AutomationResult | null }> = [];

  for (const contract of contracts) {
    try {
      const dueDate = dueDateForBillingPeriod(period, contract.billingDay || contract.startDate.getDate());
      if (dueDate > endOfDay && contract.nextBillingDate === null) continue;

      const result = await generateContractBilling({
        companyId: contract.companyId,
        contractId: contract.id,
        userId: params.userId || contract.createdBy,
        period,
        dueDate,
      });

      if (result.duplicated) duplicated++;
      else generated++;

      details.push({
        contractId: contract.id,
        receivableId: result.receivable?.id,
        duplicated: result.duplicated,
        automation: result.automation,
      });
    } catch (error: any) {
      errors++;
      details.push({ contractId: contract.id, error: error.message || 'Erro ao gerar faturamento' });
    }
  }

  return { scanned: contracts.length, generated, duplicated, errors, details };
}
