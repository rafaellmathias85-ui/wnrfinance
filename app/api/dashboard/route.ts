import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const bankId = searchParams.get('bankId');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Build bank filter
    const bankFilter: any = {};
    if (bankId && bankId !== 'todos') {
      bankFilter.bankConnectionId = bankId === 'sem_banco' ? null : bankId;
    }

    // Current month totals
    const [expenseAgg, incomeAgg, savingsBoxes, recentExpenses] = await Promise.all([
      prisma.expense.aggregate({ where: { userId, date: { gte: monthStart, lte: monthEnd }, ...bankFilter }, _sum: { amount: true } }),
      prisma.income.aggregate({ where: { userId, date: { gte: monthStart, lte: monthEnd }, ...bankFilter }, _sum: { amount: true } }),
      prisma.savingsBox.findMany({ where: { userId } }),
      prisma.expense.findMany({ where: { userId, ...bankFilter }, orderBy: { date: 'desc' }, take: 5, include: { bankConnection: { select: { id: true, bankName: true } } } }),
    ]);

    const totalExpenses = expenseAgg._sum.amount || 0;
    const totalIncomes = incomeAgg._sum.amount || 0;
    const balance = totalIncomes - totalExpenses;
    const savings = savingsBoxes.reduce((s: number, b: any) => s + b.balance, 0);

    // Chart data: last 6 months
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleDateString('pt-BR', { month: 'short' });

      const [exp, inc] = await Promise.all([
        prisma.expense.aggregate({ where: { userId, date: { gte: d, lte: end }, ...bankFilter }, _sum: { amount: true } }),
        prisma.income.aggregate({ where: { userId, date: { gte: d, lte: end }, ...bankFilter }, _sum: { amount: true } }),
      ]);

      chartData.push({ name: label, receitas: inc._sum.amount || 0, despesas: exp._sum.amount || 0 });
    }

    // Alerts
    const alerts: any[] = [];
    if (balance < 0) {
      alerts.push({ id: 'neg', title: '⚠️ Saldo Negativo', message: `Saldo do mês: ${balance.toFixed(2)}`, severity: 'critical', type: 'low_balance' });
    }

    const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const pendingExpenses = await prisma.expense.findMany({
      where: { userId, status: 'pendente', date: { gte: now, lte: next7 }, ...bankFilter },
    });
    if (pendingExpenses.length > 0) {
      alerts.push({
        id: 'due', title: '📅 Contas a Vencer',
        message: `${pendingExpenses.length} conta(s) nos próximos 7 dias`,
        severity: 'warning', type: 'bill_due',
      });
    }

    // Category data
    const categoryData = await prisma.expense.groupBy({
      by: ['category'],
      where: { userId, date: { gte: monthStart, lte: monthEnd }, ...bankFilter },
      _sum: { amount: true },
    });

    return NextResponse.json({
      balance, totalIncomes, totalExpenses, savings,
      chartData,
      alerts,
      categoryData: categoryData.map((c: any) => ({ category: c.category, amount: c._sum.amount || 0 })).sort((a: any, b: any) => b.amount - a.amount),
      recentExpenses,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Erro ao carregar dashboard' }, { status: 500 });
  }
}
