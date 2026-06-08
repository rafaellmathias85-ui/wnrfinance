import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = (session.user as any).activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const year = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const [payables, receivables] = await Promise.all([
      prisma.accountsPayable.findMany({
        where: { companyId, dueDate: { gte: startDate, lte: endDate } },
        include: { category: { select: { name: true, type: true } } },
      }),
      prisma.accountsReceivable.findMany({
        where: { companyId, dueDate: { gte: startDate, lte: endDate } },
        include: { category: { select: { name: true, type: true } } },
      }),
    ]);

    // Revenue categories breakdown per month
    const revCats: Record<string, Record<number, number>> = {};
    const revTotals: Record<string, number> = {};
    // Expense categories breakdown per month
    const expCats: Record<string, Record<number, number>> = {};
    const expTotals: Record<string, number> = {};

    // Build months array (1-12)
    const monthsArr: { month: number; revenue: number; expense: number; net: number }[] = [];
    for (let i = 1; i <= 12; i++) {
      monthsArr.push({ month: i, revenue: 0, expense: 0, net: 0 });
    }

    for (const r of receivables) {
      const m = new Date(r.dueDate).getMonth(); // 0-11
      monthsArr[m].revenue += r.amount;
      const cat = (r as any).category?.name || 'Outras Receitas';
      if (!revCats[cat]) { revCats[cat] = {}; revTotals[cat] = 0; }
      revCats[cat][m + 1] = (revCats[cat][m + 1] || 0) + r.amount;
      revTotals[cat] += r.amount;
    }

    for (const p of payables) {
      const m = new Date(p.dueDate).getMonth(); // 0-11
      monthsArr[m].expense += p.amount;
      const cat = (p as any).category?.name || 'Outras Despesas';
      if (!expCats[cat]) { expCats[cat] = {}; expTotals[cat] = 0; }
      expCats[cat][m + 1] = (expCats[cat][m + 1] || 0) + p.amount;
      expTotals[cat] += p.amount;
    }

    monthsArr.forEach(m => { m.net = m.revenue - m.expense; });

    const totalRevenue = monthsArr.reduce((s, m) => s + m.revenue, 0);
    const totalExpenses = monthsArr.reduce((s, m) => s + m.expense, 0);
    const netResult = totalRevenue - totalExpenses;

    return NextResponse.json({
      year,
      totalRevenue,
      totalExpenses,
      netResult,
      months: monthsArr,
      revenueCategories: Object.entries(revCats).map(([name, months]) => ({
        name,
        months,
        total: revTotals[name] || 0,
      })),
      expenseCategories: Object.entries(expCats).map(([name, months]) => ({
        name,
        months,
        total: expTotals[name] || 0,
      })),
    });
  } catch (error: any) {
    console.error('[pj/dre]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
