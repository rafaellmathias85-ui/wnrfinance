export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

    const isPJ = session.user.defaultEnv === 'pj' && session.user.activeCompanyId;

    // Get bank connections
    const bankWhere: any = isPJ
      ? { companyId: session.user.activeCompanyId }
      : { userId: session.user.id, scope: 'PF' };

    const banks = await prisma.bankConnection.findMany({
      where: { ...bankWhere, status: 'active' },
      select: { id: true, bankName: true, openingBalance: true, currentBalance: true, accountType: true },
    });

    // Get movements per bank (expenses paid + incomes received)
    const expWhere: any = isPJ
      ? { companyId: session.user.activeCompanyId }
      : { userId: session.user.id, companyId: null };

    const incWhere: any = isPJ
      ? { companyId: session.user.activeCompanyId }
      : { userId: session.user.id, companyId: null };

    const bankBalances = await Promise.all(
      banks.map(async (bank) => {
        // Try to use imported bank transactions for accurate balance
        const bankTxs = await prisma.bankTransaction.findMany({
          where: { bankConnectionId: bank.id },
          select: { amount: true, type: true, date: true, balanceAfter: true },
          orderBy: { date: 'desc' },
          take: 500,
        });

        let calculatedBalance: number;
        let totalExpenses = 0;
        let totalIncomes = 0;
        const opening = bank.openingBalance || 0;

        if (bankTxs.length > 0) {
          totalIncomes = bankTxs.filter(t => t.type === 'credit').reduce((s, t) => s + Math.abs(t.amount), 0);
          totalExpenses = bankTxs.filter(t => t.type === 'debit').reduce((s, t) => s + Math.abs(t.amount), 0);

          // Priority: 1) currentBalance from bank connection (set from extrato import)
          //           2) most recent balanceAfter from transactions
          //           3) openingBalance + credits - debits
          if (bank.currentBalance != null && bank.currentBalance !== 0) {
            calculatedBalance = bank.currentBalance;
          } else {
            const latestWithBalance = bankTxs.find(tx => tx.balanceAfter != null);
            if (latestWithBalance && latestWithBalance.balanceAfter != null) {
              calculatedBalance = latestWithBalance.balanceAfter;
            } else {
              calculatedBalance = opening + totalIncomes - totalExpenses;
            }
          }
        } else {
          // Fallback: use linked expenses/incomes
          const [expAgg, incAgg] = await Promise.all([
            prisma.expense.aggregate({
              where: { ...expWhere, bankConnectionId: bank.id, status: 'pago' },
              _sum: { amount: true },
            }),
            prisma.income.aggregate({
              where: { ...incWhere, bankConnectionId: bank.id, status: 'recebido' },
              _sum: { amount: true },
            }),
          ]);
          totalExpenses = expAgg._sum.amount || 0;
          totalIncomes = incAgg._sum.amount || 0;
          calculatedBalance = opening + totalIncomes - totalExpenses;
        }

        return {
          id: bank.id,
          bankName: bank.bankName,
          accountType: bank.accountType || 'corrente',
          openingBalance: opening,
          totalExpenses,
          totalIncomes,
          calculatedBalance,
        };
      })
    );

    // Get investments per bank — investments são PF-only; em contexto PJ retorna vazio
    const invWhere: any = isPJ ? { id: 'none' } : { userId: session.user.id };
    const investments = await prisma.investment.findMany({
      where: invWhere,
      select: { bankConnectionId: true, currentValue: true, name: true, type: true },
    });

    // Group investments by bank
    const investmentsByBank: Record<string, number> = {};
    let investmentsSemBanco = 0;
    for (const inv of investments) {
      if (inv.bankConnectionId) {
        investmentsByBank[inv.bankConnectionId] = (investmentsByBank[inv.bankConnectionId] || 0) + (inv.currentValue || 0);
      } else {
        investmentsSemBanco += inv.currentValue || 0;
      }
    }

    const result = bankBalances.map((b) => ({
      ...b,
      investimentos: investmentsByBank[b.id] || 0,
      totalPatrimonio: b.calculatedBalance + (investmentsByBank[b.id] || 0),
    }));

    const totalCC = result.reduce((s, b) => s + b.calculatedBalance, 0);
    const totalInv = result.reduce((s, b) => s + b.investimentos, 0) + investmentsSemBanco;
    const totalPatrimonio = totalCC + totalInv;

    return NextResponse.json({
      banks: result,
      summary: {
        totalContaCorrente: totalCC,
        totalInvestimentos: totalInv,
        totalPatrimonio,
        investimentosSemBanco: investmentsSemBanco,
      },
    });
  } catch (error: any) {
    console.error('Balance API error:', error);
    return NextResponse.json({ error: 'Erro ao calcular saldos' }, { status: 500 });
  }
}
