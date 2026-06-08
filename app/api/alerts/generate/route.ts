import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = session.user.id;
    const now = new Date();
    const alerts: { type: string; title: string; message: string; severity: string }[] = [];

    // 1. Check negative balance
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [monthExpenses, monthIncomes] = await Promise.all([
      prisma.expense.aggregate({
        where: { userId, date: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
      prisma.income.aggregate({
        where: { userId, date: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
    ]);

    const balance = (monthIncomes._sum.amount || 0) - (monthExpenses._sum.amount || 0);
    if (balance < 0) {
      alerts.push({
        type: 'low_balance',
        title: '⚠️ Saldo Negativo',
        message: `Seu saldo está negativo neste mês: R$ ${balance.toFixed(2)}. Revise seus gastos.`,
        severity: 'critical',
      });
    } else if (balance > 0 && balance < 500) {
      alerts.push({
        type: 'low_balance',
        title: '⚠️ Saldo Baixo',
        message: `Seu saldo está baixo: R$ ${balance.toFixed(2)}. Atenção com gastos extras.`,
        severity: 'warning',
      });
    }

    // 2. Bills due in next 7 days
    const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const pendingExpenses = await prisma.expense.findMany({
      where: {
        userId,
        status: 'pendente',
        date: { gte: now, lte: next7 },
      },
    });

    if (pendingExpenses.length > 0) {
      const total = pendingExpenses.reduce((s: number, e: any) => s + e.amount, 0);
      alerts.push({
        type: 'bill_due',
        title: '📅 Contas a Vencer',
        message: `Você tem ${pendingExpenses.length} conta(s) a vencer nos próximos 7 dias, totalizando R$ ${total.toFixed(2)}.`,
        severity: 'warning',
      });
    }

    // 3. Credit card near limit
    const cards = await prisma.creditCard.findMany({
      where: { userId, isActive: true },
      include: {
        transactions: {
          where: {
            date: { gte: monthStart, lte: monthEnd },
          },
        },
      },
    });

    cards.forEach((card: any) => {
      const used = card.transactions.reduce((s: number, t: any) => s + t.amount, 0);
      const pct = (used / card.cardLimit) * 100;
      if (pct >= 80) {
        alerts.push({
          type: 'card_limit',
          title: `💳 Limite do ${card.name}`,
          message: `Cartão ${card.name} com ${pct.toFixed(0)}% do limite utilizado (R$ ${used.toFixed(2)} de R$ ${card.cardLimit.toFixed(2)}).`,
          severity: pct >= 95 ? 'critical' : 'warning',
        });
      }
    });

    // 4. Savings goal reached
    const completedBoxes = await prisma.savingsBox.findMany({
      where: { userId, isCompleted: false },
    });
    completedBoxes.forEach((box: any) => {
      if (box.balance >= box.goal) {
        alerts.push({
          type: 'goal_reached',
          title: `🎉 Meta Atingida!`,
          message: `Parabéns! A caixinha "${box.name}" atingiu a meta de R$ ${box.goal.toFixed(2)}!`,
          severity: 'info',
        });
      }
    });

    // ====================== PJ ALERTS ======================
    const companyId = session.user.activeCompanyId;
    if (companyId) {
      // PJ: Contas a pagar vencendo nos próximos 7 dias
      const pjPayablesDue = await prisma.accountsPayable.findMany({
        where: { companyId, status: { in: ['pendente'] }, dueDate: { gte: now, lte: next7 } },
      });
      if (pjPayablesDue.length > 0) {
        const total = pjPayablesDue.reduce((s: number, p: any) => s + Number(p.amount), 0);
        alerts.push({
          type: 'pj_payable_due',
          title: '🏢 Contas a Pagar PJ',
          message: `${pjPayablesDue.length} conta(s) a pagar vencendo em 7 dias, total R$ ${total.toFixed(2)}.`,
          severity: 'warning',
        });
      }

      // PJ: Contas a pagar vencidas
      const pjPayablesOverdue = await prisma.accountsPayable.findMany({
        where: { companyId, status: 'vencido' },
      });
      if (pjPayablesOverdue.length > 0) {
        const total = pjPayablesOverdue.reduce((s: number, p: any) => s + Number(p.amount), 0);
        alerts.push({
          type: 'pj_payable_overdue',
          title: '🚨 Contas Vencidas PJ',
          message: `${pjPayablesOverdue.length} conta(s) vencida(s) totalizando R$ ${total.toFixed(2)}.`,
          severity: 'critical',
        });
      }

      // PJ: Contas a receber vencendo
      const pjReceivablesDue = await prisma.accountsReceivable.findMany({
        where: { companyId, status: { in: ['pendente'] }, dueDate: { gte: now, lte: next7 } },
      });
      if (pjReceivablesDue.length > 0) {
        const total = pjReceivablesDue.reduce((s: number, r: any) => s + Number(r.amount), 0);
        alerts.push({
          type: 'pj_receivable_due',
          title: '🏢 Contas a Receber PJ',
          message: `${pjReceivablesDue.length} conta(s) a receber vencendo em 7 dias, total R$ ${total.toFixed(2)}.`,
          severity: 'info',
        });
      }

      // PJ: Investimentos vencendo em 30 dias
      const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const investmentsDue = await prisma.pJInvestment.findMany({
        where: { companyId, status: 'ativo', maturityDate: { gte: now, lte: next30 } },
      });
      if (investmentsDue.length > 0) {
        const total = investmentsDue.reduce((s: number, i: any) => s + Number(i.currentValue), 0);
        alerts.push({
          type: 'pj_investment_maturity',
          title: '📊 Investimentos Vencendo',
          message: `${investmentsDue.length} investimento(s) vencendo em 30 dias, valor R$ ${total.toFixed(2)}.`,
          severity: 'info',
        });
      }

      // PJ: Conciliações pendentes
      const pendingRecon = await prisma.pJReconciliation.count({
        where: { companyId, status: { in: ['PENDING', 'DIVERGENT'] } },
      });
      if (pendingRecon > 0) {
        alerts.push({
          type: 'pj_reconciliation_pending',
          title: '🔄 Conciliações Pendentes',
          message: `${pendingRecon} conciliação(ões) pendente(s) ou divergente(s) aguardando ação.`,
          severity: pendingRecon > 10 ? 'warning' : 'info',
        });
      }
    }

    // Create alerts (avoid duplicates by checking recent alerts)
    const recentAlerts = await prisma.alert.findMany({
      where: { userId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });
    const recentTypes = new Set(recentAlerts.map((a: any) => a.type));

    const newAlerts = alerts.filter(a => !recentTypes.has(a.type));
    if (newAlerts.length > 0) {
      await prisma.alert.createMany({
        data: newAlerts.map(a => ({ ...a, userId })),
      });
    }

    return NextResponse.json({ generated: newAlerts.length, total: alerts.length });
  } catch (error) {
    console.error('Error generating alerts:', error);
    return NextResponse.json({ error: 'Erro ao gerar alertas' }, { status: 500 });
  }
}
