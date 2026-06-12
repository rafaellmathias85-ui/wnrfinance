import { prisma } from '@/lib/prisma';
import { reconciliationRulesService, type MatchCandidate } from './reconciliation-rules.service';
import { normalizeTransactionDescription } from '@/src/modules/banking/bank-transaction-hash';

interface ReconcileParams {
  userId: string;
  companyId?: string | null;
  bankConnectionId?: string | null;
  bankTransactionIds?: string[];
}

interface ReconcileSummary {
  processed: number;
  reconciled: number;
  suggested: number;
  pending: number;
}

export class ReconciliationService {
  async reconcileBankTransactions(params: ReconcileParams): Promise<ReconcileSummary> {
    const where: any = {
      userId: params.userId,
      status: { in: ['PENDING', 'SUGGESTED'] },
    };

    if (params.companyId !== undefined) where.companyId = params.companyId;
    if (params.bankConnectionId) where.bankConnectionId = params.bankConnectionId;
    if (params.bankTransactionIds?.length) where.id = { in: params.bankTransactionIds };

    const bankTransactions = await prisma.bankTransaction.findMany({
      where,
      include: { reconciliation: true },
      orderBy: { date: 'desc' },
    });

    if (!bankTransactions.length) {
      return { processed: 0, reconciled: 0, suggested: 0, pending: 0 };
    }

    const candidates = await this.loadCandidates(params, bankTransactions);
    let reconciled = 0;
    let suggested = 0;
    let pending = 0;

    // Regras de conciliação por conta (paridade BomControle: "Texto Conciliação")
    const accountRules = await prisma.bankReconciliationRule.findMany({
      where: {
        userId: params.userId,
        isActive: true,
        OR: [
          { bankConnectionId: params.bankConnectionId || undefined },
          { bankConnectionId: null },
        ],
        ...(params.companyId !== undefined ? { companyId: params.companyId } : {}),
      },
      orderBy: { priority: 'desc' },
    });

    for (const tx of bankTransactions) {
      // Aplica a primeira regra que casar: categoriza a transação do extrato
      const txType = tx.type === 'debit' ? 'DESPESA' : 'RECEITA';
      const normalizedDesc = normalizeTransactionDescription(tx.description || '');
      const rule = accountRules.find((r) => {
        if (r.type !== txType) return false;
        const ruleText = normalizeTransactionDescription(r.matchText);
        return r.exactMatch ? normalizedDesc === ruleText : normalizedDesc.includes(ruleText);
      });
      if (rule && !tx.category) {
        await prisma.bankTransaction.update({
          where: { id: tx.id },
          data: { category: rule.categoryId || rule.paymentMethod || null },
        }).catch(() => {});
      }
      const relevant = candidates.filter((candidate) =>
        tx.type === 'debit' ? candidate.type === 'expense' : candidate.type === 'income',
      );

      let best: MatchCandidate | null = null;
      let bestScore = 0;

      for (const candidate of relevant) {
        const score = reconciliationRulesService.score(
          {
            amount: tx.amount,
            date: tx.date,
            description: tx.description,
            documentNumber: tx.documentNumber,
            counterpartyTaxId: tx.payerDocument,
          },
          candidate,
        );
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }

      if (best && bestScore >= 90) {
        await this.persistMatch(tx, best, bestScore, 'RECONCILED');
        reconciled++;
        continue;
      }

      if (best && bestScore >= 60) {
        await this.persistMatch(tx, best, bestScore, 'SUGGESTED');
        suggested++;
        continue;
      }

      await this.persistPending(tx);
      pending++;
    }

    return {
      processed: bankTransactions.length,
      reconciled,
      suggested,
      pending,
    };
  }

  private async loadCandidates(params: ReconcileParams, bankTransactions: any[]): Promise<MatchCandidate[]> {
    const dates = bankTransactions.map((tx) => new Date(tx.date).getTime());
    const minDate = new Date(Math.min(...dates) - 7 * 86400000);
    const maxDate = new Date(Math.max(...dates) + 7 * 86400000);

    if (params.companyId) {
      const [payables, receivables] = await Promise.all([
        prisma.accountsPayable.findMany({
          where: { companyId: params.companyId, dueDate: { gte: minDate, lte: maxDate } },
          select: {
            id: true,
            description: true,
            supplierName: true,
            amount: true,
            dueDate: true,
            transferDoc: true,
          },
        }),
        prisma.accountsReceivable.findMany({
          where: { companyId: params.companyId, dueDate: { gte: minDate, lte: maxDate } },
          select: {
            id: true,
            description: true,
            customerName: true,
            customerDoc: true,
            amount: true,
            dueDate: true,
          },
        }),
      ]);

      return [
        ...payables.map((item) => ({
          id: item.id,
          type: 'expense' as const,
          amount: item.amount,
          date: item.dueDate,
          description: `${item.description} ${item.supplierName || ''}`,
          taxId: item.transferDoc,
        })),
        ...receivables.map((item) => ({
          id: item.id,
          type: 'income' as const,
          amount: item.amount,
          date: item.dueDate,
          description: `${item.description} ${item.customerName || ''}`,
          taxId: item.customerDoc,
        })),
      ];
    }

    const [expenses, incomes] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: params.userId, companyId: null, date: { gte: minDate, lte: maxDate } },
        select: { id: true, description: true, amount: true, date: true },
      }),
      prisma.income.findMany({
        where: { userId: params.userId, companyId: null, date: { gte: minDate, lte: maxDate } },
        select: { id: true, description: true, amount: true, date: true },
      }),
    ]);

    return [
      ...expenses.map((item) => ({
        id: item.id,
        type: 'expense' as const,
        amount: item.amount,
        date: item.date,
        description: item.description,
      })),
      ...incomes.map((item) => ({
        id: item.id,
        type: 'income' as const,
        amount: item.amount,
        date: item.date,
        description: item.description,
      })),
    ];
  }

  private async persistMatch(
    tx: any,
    candidate: MatchCandidate,
    score: number,
    status: 'RECONCILED' | 'SUGGESTED',
  ): Promise<void> {
    const action = status === 'RECONCILED' ? 'auto_matched' : 'suggested';
    const bankStatus = status;

    await prisma.$transaction(async (trx) => {
      if (tx.reconciliation) {
        await trx.reconciliation.update({
          where: { id: tx.reconciliation.id },
          data: {
            internalType: candidate.type,
            internalId: candidate.id,
            status,
            matchScore: score,
            matchMethod: 'auto',
            resolvedAt: status === 'RECONCILED' ? new Date() : null,
            logs: {
              create: {
                action,
                previousStatus: tx.reconciliation.status,
                newStatus: status,
                details: { score, internalId: candidate.id, internalType: candidate.type },
              },
            },
          },
        });
      } else {
        await trx.reconciliation.create({
          data: {
            userId: tx.userId,
            bankTransactionId: tx.id,
            internalType: candidate.type,
            internalId: candidate.id,
            status,
            matchScore: score,
            matchMethod: 'auto',
            resolvedAt: status === 'RECONCILED' ? new Date() : null,
            logs: {
              create: {
                action,
                previousStatus: 'PENDING',
                newStatus: status,
                details: { score, internalId: candidate.id, internalType: candidate.type },
              },
            },
          },
        });
      }

      await trx.bankTransaction.update({
        where: { id: tx.id },
        data: { status: bankStatus },
      });
    });

    // Conciliação confirmada de RECEITA PJ → recebível QUITADA → CONCILIADA
    // (máquina de estados mantém billingStatus/status legado e auditoria em sincronia)
    if (status === 'RECONCILED' && candidate.type === 'income' && tx.companyId) {
      try {
        const { transitionBillingStatus } = await import('@/lib/billing-state');
        const receivable = await prisma.accountsReceivable.findUnique({
          where: { id: candidate.id },
          select: { id: true, billingStatus: true },
        });
        if (receivable) {
          if (receivable.billingStatus === 'FATURADA' || receivable.billingStatus === 'VENCIDA') {
            await transitionBillingStatus(candidate.id, 'QUITADA', {
              companyId: tx.companyId,
              data: { receivedAt: tx.date, amountReceived: tx.amount },
              notes: 'Auto-match de extrato bancário',
            });
          }
          const after = await prisma.accountsReceivable.findUnique({
            where: { id: candidate.id },
            select: { billingStatus: true },
          });
          if (after?.billingStatus === 'QUITADA') {
            await transitionBillingStatus(candidate.id, 'CONCILIADA', { companyId: tx.companyId });
          }
        }
      } catch (err: any) {
        console.error('[Reconciliation] transição de estado falhou:', err?.message);
      }
    }
  }

  private async persistPending(tx: any): Promise<void> {
    if (tx.reconciliation) return;

    await prisma.reconciliation.create({
      data: {
        userId: tx.userId,
        bankTransactionId: tx.id,
        status: 'PENDING',
        matchMethod: 'auto',
        logs: {
          create: {
            action: 'unmatched',
            previousStatus: 'PENDING',
            newStatus: 'PENDING',
            details: { message: 'Nenhum lançamento interno compatível' },
          },
        },
      },
    });
  }
}

export const reconciliationService = new ReconciliationService();
