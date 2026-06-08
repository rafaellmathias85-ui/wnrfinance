import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const months = parseInt(searchParams.get('months') || '6');
    const bankId = searchParams.get('bankId');

    const bankFilter: any = {};
    if (bankId && bankId !== 'todos') {
      bankFilter.bankConnectionId = bankId === 'sem_banco' ? null : bankId;
    }

    const now = new Date();
    const results = [];

    // Pre-calculate recurring totals for projections using current month's recurring items
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const [recurringExpensesData, recurringIncomesData] = await Promise.all([
      prisma.expense.aggregate({
        where: { userId, isRecurring: true, date: { gte: currentMonthStart, lte: currentMonthEnd }, ...bankFilter },
        _sum: { amount: true },
      }),
      prisma.income.aggregate({
        where: { userId, isRecurring: true, date: { gte: currentMonthStart, lte: currentMonthEnd }, ...bankFilter },
        _sum: { amount: true },
      }),
    ]);
    const projectedExpenses = recurringExpensesData._sum.amount || 0;
    const projectedIncomes = recurringIncomesData._sum.amount || 0;

    for (let i = months - 1; i >= -3; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const isFuture = date > now;
      const label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      if (isFuture) {
        results.push({
          label,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          receitas: projectedIncomes,
          despesas: projectedExpenses,
          saldo: projectedIncomes - projectedExpenses,
          isProjection: true,
        });
      } else {
        const [expenses, incomes] = await Promise.all([
          prisma.expense.aggregate({
            where: { userId, date: { gte: date, lte: endDate }, ...bankFilter },
            _sum: { amount: true },
          }),
          prisma.income.aggregate({
            where: { userId, date: { gte: date, lte: endDate }, ...bankFilter },
            _sum: { amount: true },
          }),
        ]);
        results.push({
          label,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          receitas: incomes._sum.amount || 0,
          despesas: expenses._sum.amount || 0,
          saldo: (incomes._sum.amount || 0) - (expenses._sum.amount || 0),
          isProjection: false,
        });
      }
    }

    // Spending by category (current month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const categoryExpenses = await prisma.expense.groupBy({
      by: ['category'],
      where: { userId, date: { gte: monthStart, lte: monthEnd }, ...bankFilter },
      _sum: { amount: true },
    });

    const spendingByCategory = categoryExpenses.map((c: any) => ({
      category: c.category,
      amount: c._sum.amount || 0,
    })).sort((a: any, b: any) => b.amount - a.amount);

    // Investment summary (filter by bank if set)
    const investWhere: any = { userId };
    if (bankId && bankId !== 'todos') {
      investWhere.bankConnectionId = bankId === 'sem_banco' ? null : bankId;
    }
    const investments = await prisma.investment.findMany({ where: investWhere });
    const totalInvested = investments.reduce((s: number, i: any) => s + i.amount, 0);
    const totalCurrent = investments.reduce((s: number, i: any) => s + i.currentValue, 0);

    // Savings summary
    const savings = await prisma.savingsBox.findMany({ where: { userId } });
    const totalSaved = savings.reduce((s: number, b: any) => s + b.balance, 0);

    // Spending by bank (current month)
    const expensesByBank = await prisma.expense.findMany({
      where: { userId, date: { gte: monthStart, lte: monthEnd } },
      include: { bankConnection: { select: { id: true, bankName: true } } },
    });
    const incomesByBank = await prisma.income.findMany({
      where: { userId, date: { gte: monthStart, lte: monthEnd } },
      include: { bankConnection: { select: { id: true, bankName: true } } },
    });

    const bankMap: Record<string, { bankName: string; expenses: number; incomes: number }> = {};
    expensesByBank.forEach((e: any) => {
      const key = e.bankConnectionId || 'sem_banco';
      const name = e.bankConnection?.bankName || 'Sem banco vinculado';
      if (!bankMap[key]) bankMap[key] = { bankName: name, expenses: 0, incomes: 0 };
      bankMap[key].expenses += e.amount;
    });
    incomesByBank.forEach((i: any) => {
      const key = i.bankConnectionId || 'sem_banco';
      const name = i.bankConnection?.bankName || 'Sem banco vinculado';
      if (!bankMap[key]) bankMap[key] = { bankName: name, expenses: 0, incomes: 0 };
      bankMap[key].incomes += i.amount;
    });

    const spendingByBank = Object.entries(bankMap).map(([id, data]) => ({
      id,
      bankName: data.bankName,
      expenses: data.expenses,
      incomes: data.incomes,
      saldo: data.incomes - data.expenses,
    })).sort((a, b) => b.expenses - a.expenses);

    return NextResponse.json({
      monthlyEvolution: results,
      spendingByCategory,
      spendingByBank,
      patrimony: {
        investments: totalCurrent,
        savings: totalSaved,
        total: totalCurrent + totalSaved,
        investmentReturn: totalCurrent - totalInvested,
      },
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: 'Erro ao gerar relatórios' }, { status: 500 });
  }
}
