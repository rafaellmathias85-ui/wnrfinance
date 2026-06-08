export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const next30 = new Date(now);
  next30.setDate(next30.getDate() + 30);

  const [payables, receivables, paidPayables, receivedReceivables, overduePayables, overdueReceivables] = await Promise.all([
    prisma.accountsPayable.aggregate({
      where: { companyId, dueDate: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, dueDate: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pago', paidAt: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { amount: true },
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'recebido', receivedAt: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { amount: true },
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { lt: now } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { lt: now } },
      _sum: { amount: true }, _count: true,
    }),
  ]);

  const [recentPayables, recentReceivables] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: { companyId }, orderBy: { createdAt: 'desc' }, take: 5,
      include: { category: true },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId }, orderBy: { createdAt: 'desc' }, take: 5,
      include: { category: true },
    }),
  ]);

  // Investment summary
  const [investmentSummary, investmentsByType, reconciliationStats] = await Promise.all([
    prisma.pJInvestment.aggregate({
      where: { companyId, status: 'ativo' },
      _sum: { amountInvested: true, currentValue: true },
      _count: true,
    }),
    prisma.pJInvestment.groupBy({
      by: ['investmentType'],
      where: { companyId, status: 'ativo' },
      _sum: { currentValue: true },
      _count: true,
    }),
    prisma.pJReconciliation.groupBy({
      by: ['status'],
      where: { companyId },
      _count: true,
    }),
  ]);

  // Category breakdown for payables
  const payablesByCategory = await prisma.accountsPayable.groupBy({
    by: ['categoryId'],
    where: { companyId, dueDate: { gte: startOfMonth, lte: endOfMonth } },
    _sum: { amount: true },
    _count: true,
  });

  // Fetch category names for the breakdown
  const categoryIds = payablesByCategory.filter((c: any) => c.categoryId).map((c: any) => c.categoryId!);
  const categoryNames = categoryIds.length > 0 ? await prisma.businessCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  }) : [];
  const catMap = Object.fromEntries(categoryNames.map((c: any) => [c.id, c.name]));

  const paid = paidPayables._sum?.amount || 0;
  const received = receivedReceivables._sum?.amount || 0;

  const [
    businessAccountBalance,
    connectedBankBalance,
    forecastReceivables,
    forecastPayables,
    boletoOverdue,
    boletoPending,
    nfeStats,
    fiscalRuleStats,
    pendingReconciliation,
    divergentReconciliation,
    nextCashReceivables,
    nextCashPayables,
  ] = await Promise.all([
    prisma.businessAccount.aggregate({ where: { companyId }, _sum: { balance: true }, _count: true }),
    prisma.bankConnection.aggregate({ where: { companyId }, _sum: { currentBalance: true }, _count: true }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gte: now, lte: next30 } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gte: now, lte: next30 } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.boletoCharge.aggregate({
      where: { companyId, status: { in: ['pendente', 'vencido'] }, dueDate: { lt: now } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.boletoCharge.aggregate({
      where: { companyId, status: 'pendente' },
      _sum: { amount: true }, _count: true,
    }),
    prisma.nFe.groupBy({ by: ['status'], where: { companyId }, _count: true }),
    prisma.serviceFiscalRule.groupBy({ by: ['isActive'], where: { companyId }, _count: true }),
    prisma.pJReconciliation.count({ where: { companyId, status: 'PENDING' } }),
    prisma.pJReconciliation.count({ where: { companyId, status: 'DIVERGENT' } }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gte: now, lte: next30 } },
      select: { dueDate: true, amount: true },
    }),
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gte: now, lte: next30 } },
      select: { dueDate: true, amount: true },
    }),
  ]);

  const realBalance = (businessAccountBalance._sum?.balance || 0) + (connectedBankBalance._sum?.currentBalance || 0);
  const forecastBalance = realBalance + (forecastReceivables._sum?.amount || 0) - (forecastPayables._sum?.amount || 0);
  const nfeByStatus = Object.fromEntries(nfeStats.map(s => [s.status, s._count]));
  const activeFiscalRules = fiscalRuleStats.find(s => s.isActive)?._count || 0;

  const cashflowMap: Record<string, { date: string; receivable: number; payable: number; balance: number }> = {};
  for (let i = 0; i <= 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    cashflowMap[key] = { date: key, receivable: 0, payable: 0, balance: 0 };
  }
  for (const item of nextCashReceivables) {
    const key = item.dueDate.toISOString().slice(0, 10);
    if (cashflowMap[key]) cashflowMap[key].receivable += item.amount;
  }
  for (const item of nextCashPayables) {
    const key = item.dueDate.toISOString().slice(0, 10);
    if (cashflowMap[key]) cashflowMap[key].payable += item.amount;
  }
  let running = realBalance;
  const cashflow30d = Object.values(cashflowMap).map(day => {
    running += day.receivable - day.payable;
    return { ...day, balance: running };
  });

  return NextResponse.json({
    month: {
      payables: { total: payables._sum?.amount || 0, count: payables._count },
      receivables: { total: receivables._sum?.amount || 0, count: receivables._count },
      paid,
      received,
      balance: received - paid,
    },
    overdue: {
      payables: { total: overduePayables._sum?.amount || 0, count: overduePayables._count },
      receivables: { total: overdueReceivables._sum?.amount || 0, count: overdueReceivables._count },
    },
    recent: { payables: recentPayables, receivables: recentReceivables },
    investments: {
      totalInvested: investmentSummary._sum?.amountInvested || 0,
      currentValue: investmentSummary._sum?.currentValue || 0,
      count: investmentSummary._count,
      byType: investmentsByType.map(t => ({ type: t.investmentType, value: t._sum?.currentValue || 0, count: t._count })),
    },
    reconciliation: Object.fromEntries(reconciliationStats.map(r => [r.status, r._count])),
    banking: {
      realBalance,
      forecastBalance30d: forecastBalance,
      manualAccounts: businessAccountBalance._count,
      connectedAccounts: connectedBankBalance._count,
    },
    fiscal: {
      activeServiceRules: activeFiscalRules,
      notesPending: (nfeByStatus.rascunho || 0) + (nfeByStatus.enviada || 0),
      notesAuthorized: nfeByStatus.autorizada || 0,
      notesRejected: nfeByStatus.rejeitada || 0,
    },
    charges: {
      pending: { total: boletoPending._sum?.amount || 0, count: boletoPending._count },
      overdue: { total: boletoOverdue._sum?.amount || 0, count: boletoOverdue._count },
    },
    operations: {
      pendingReconciliation,
      divergentReconciliation,
    },
    dre: {
      revenue: received,
      expenses: paid,
      operatingResult: received - paid,
      margin: received > 0 ? ((received - paid) / received) * 100 : 0,
    },
    cashflow30d,
    payablesByCategory: payablesByCategory.map(c => ({
      category: c.categoryId ? (catMap[c.categoryId] || 'Sem categoria') : 'Sem categoria',
      total: c._sum?.amount || 0,
      count: c._count,
    })),
  });
}
