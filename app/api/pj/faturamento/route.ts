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

    const now = new Date();
    const year = parseInt(req.nextUrl.searchParams.get('year') || String(now.getFullYear()));
    const monthParam = req.nextUrl.searchParams.get('month');
    const dateFrom = req.nextUrl.searchParams.get('dateFrom');
    const dateTo = req.nextUrl.searchParams.get('dateTo');

    let startDate: Date, endDate: Date;
    if (dateFrom || dateTo) {
      // Explicit date range takes highest priority
      startDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = dateTo ? new Date(dateTo + 'T23:59:59') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (monthParam) {
      const month = parseInt(monthParam) - 1;
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0, 23, 59, 59);
    } else {
      // Default: current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const [payables, receivables] = await Promise.all([
      prisma.accountsPayable.findMany({
        where: { companyId, dueDate: { gte: startDate, lte: endDate } },
        include: { category: { select: { name: true, color: true } } },
        orderBy: { dueDate: 'desc' },
      }),
      prisma.accountsReceivable.findMany({
        where: { companyId, dueDate: { gte: startDate, lte: endDate } },
        include: { category: { select: { name: true, color: true } } },
        orderBy: { dueDate: 'desc' },
      }),
    ]);

    // KPIs
    const totalReceivable = receivables.reduce((s, r) => s + r.amount, 0);
    const totalReceived = receivables.filter(r => r.status === 'recebido').reduce((s, r) => s + r.amount, 0);
    const pendingReceivable = receivables.filter(r => r.status === 'pendente' || r.status === 'vencido').reduce((s, r) => s + r.amount, 0);
    const totalPayable = payables.reduce((s, p) => s + p.amount, 0);
    const totalPaid = payables.filter(p => p.status === 'pago').reduce((s, p) => s + p.amount, 0);
    const pendingPayable = payables.filter(p => p.status === 'pendente' || p.status === 'vencido').reduce((s, p) => s + p.amount, 0);

    // Monthly evolution
    const monthlyData: { month: string; receivable: number; payable: number; balance: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const ms = new Date(year, m, 1);
      const me = new Date(year, m + 1, 0, 23, 59, 59);
      const monthRec = receivables.filter(r => new Date(r.dueDate) >= ms && new Date(r.dueDate) <= me).reduce((s, r) => s + r.amount, 0);
      const monthPay = payables.filter(p => new Date(p.dueDate) >= ms && new Date(p.dueDate) <= me).reduce((s, p) => s + p.amount, 0);
      monthlyData.push({
        month: ms.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        receivable: monthRec,
        payable: monthPay,
        balance: monthRec - monthPay,
      });
    }

    // Categories for pie charts
    const payableCatMap: Record<string, { name: string; total: number }> = {};
    for (const p of payables) {
      const name = (p as any).category?.name || 'Sem categoria';
      if (!payableCatMap[name]) payableCatMap[name] = { name, total: 0 };
      payableCatMap[name].total += p.amount;
    }

    const receivableCatMap: Record<string, { name: string; total: number }> = {};
    for (const r of receivables) {
      const name = (r as any).category?.name || 'Sem categoria';
      if (!receivableCatMap[name]) receivableCatMap[name] = { name, total: 0 };
      receivableCatMap[name].total += r.amount;
    }

    // Top customers / suppliers
    const custMap: Record<string, number> = {};
    for (const r of receivables) {
      const n = r.customerName || 'Sem cliente';
      custMap[n] = (custMap[n] || 0) + r.amount;
    }
    const topCustomers = Object.entries(custMap).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10);

    const suppMap: Record<string, number> = {};
    for (const p of payables) {
      const n = p.supplierName || 'Sem fornecedor';
      suppMap[n] = (suppMap[n] || 0) + p.amount;
    }
    const topSuppliers = Object.entries(suppMap).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10);

    return NextResponse.json({
      kpis: {
        totalReceivable,
        totalReceived,
        pendingReceivable,
        totalPayable,
        totalPaid,
        pendingPayable,
      },
      monthlyData,
      categories: {
        payable: Object.values(payableCatMap).sort((a, b) => b.total - a.total),
        receivable: Object.values(receivableCatMap).sort((a, b) => b.total - a.total),
      },
      topCustomers,
      topSuppliers,
      recentTransactions: {
        payables: payables.slice(0, 20).map(p => ({
          id: p.id, description: p.description, amount: p.amount,
          dueDate: p.dueDate, status: p.status, supplierName: p.supplierName,
          category: (p as any).category?.name || 'Sem categoria',
        })),
        receivables: receivables.slice(0, 20).map(r => ({
          id: r.id, description: r.description, amount: r.amount,
          dueDate: r.dueDate, status: r.status, customerName: r.customerName,
          category: (r as any).category?.name || 'Sem categoria',
        })),
      },
    });
  } catch (error: any) {
    console.error('[pj/faturamento]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
