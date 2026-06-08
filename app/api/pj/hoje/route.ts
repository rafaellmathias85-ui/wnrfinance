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
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
  const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59);
  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59);

  const [
    dueToday_payables,
    dueToday_receivables,
    dueTomorrow_payables,
    dueTomorrow_receivables,
    dueThisWeek_payables,
    dueThisWeek_receivables,
    overdue_payables,
    overdue_receivables,
    received_today,
    paid_today,
    upcoming_payables,
    upcoming_receivables,
  ] = await Promise.all([
    // Due today
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: todayEnd } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: todayEnd } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
    }),
    // Due tomorrow
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gt: todayEnd, lte: tomorrowEnd } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gt: todayEnd, lte: tomorrowEnd } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
    }),
    // Due this week (next 7 days, excluding today and tomorrow)
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gt: tomorrowEnd, lte: in7Days } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gt: tomorrowEnd, lte: in7Days } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
    }),
    // Overdue
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente', dueDate: { lt: todayStart } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente', dueDate: { lt: todayStart } },
      include: { category: true },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),
    // Received/paid today
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'recebido', receivedAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pago', paidAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    // Next 30 days payables (for projected flow)
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: in30Days } },
      select: { amount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: in30Days } },
      select: { amount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  // Build 7-day projected cash flow
  const projectedFlow: { date: string; inflow: number; outflow: number; balance: number }[] = [];
  let runningBalance = 0;
  for (let d = 0; d < 7; d++) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, 23, 59, 59);
    const inflow = upcoming_receivables
      .filter(r => new Date(r.dueDate) >= dayStart && new Date(r.dueDate) <= dayEnd)
      .reduce((s, r) => s + Number(r.amount), 0);
    const outflow = upcoming_payables
      .filter(r => new Date(r.dueDate) >= dayStart && new Date(r.dueDate) <= dayEnd)
      .reduce((s, r) => s + Number(r.amount), 0);
    runningBalance += inflow - outflow;
    projectedFlow.push({
      date: dayStart.toISOString().split('T')[0],
      inflow,
      outflow,
      balance: runningBalance,
    });
  }

  const totalDueTodayPayable = dueToday_payables.reduce((s, p) => s + Number(p.amount), 0);
  const totalDueTodayReceivable = dueToday_receivables.reduce((s, p) => s + Number(p.amount), 0);
  const totalOverduePayable = overdue_payables.reduce((s, p) => s + Number(p.amount), 0);
  const totalOverdueReceivable = overdue_receivables.reduce((s, p) => s + Number(p.amount), 0);

  return NextResponse.json({
    today: {
      payables: dueToday_payables,
      receivables: dueToday_receivables,
      totalPayable: totalDueTodayPayable,
      totalReceivable: totalDueTodayReceivable,
    },
    tomorrow: {
      payables: dueTomorrow_payables,
      receivables: dueTomorrow_receivables,
      totalPayable: dueTomorrow_payables.reduce((s, p) => s + Number(p.amount), 0),
      totalReceivable: dueTomorrow_receivables.reduce((s, p) => s + Number(p.amount), 0),
    },
    thisWeek: {
      payables: dueThisWeek_payables,
      receivables: dueThisWeek_receivables,
      totalPayable: dueThisWeek_payables.reduce((s, p) => s + Number(p.amount), 0),
      totalReceivable: dueThisWeek_receivables.reduce((s, p) => s + Number(p.amount), 0),
    },
    overdue: {
      payables: overdue_payables,
      receivables: overdue_receivables,
      totalPayable: totalOverduePayable,
      totalReceivable: totalOverdueReceivable,
    },
    completedToday: {
      received: { total: received_today._sum?.amount || 0, count: received_today._count },
      paid: { total: paid_today._sum?.amount || 0, count: paid_today._count },
    },
    projectedFlow,
  });
}

// PATCH — mark payable or receivable as paid/received from Hoje page
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;

  const body = await req.json();
  const { id, type, action } = body; // type: 'payable' | 'receivable', action: 'pay' | 'receive' | 'undo'

  if (!id || !type || !action) return NextResponse.json({ error: 'id, type e action são obrigatórios' }, { status: 400 });

  const now = new Date();

  if (type === 'payable') {
    const record = await prisma.accountsPayable.findFirst({ where: { id, companyId: companyId ?? undefined } });
    if (!record) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const updated = await prisma.accountsPayable.update({
      where: { id },
      data: action === 'undo'
        ? { status: 'pendente', paidAt: null }
        : { status: 'pago', paidAt: now },
    });
    return NextResponse.json({ ok: true, item: updated });
  }

  if (type === 'receivable') {
    const record = await prisma.accountsReceivable.findFirst({ where: { id, companyId: companyId ?? undefined } });
    if (!record) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const updated = await prisma.accountsReceivable.update({
      where: { id },
      data: action === 'undo'
        ? { status: 'pendente', receivedAt: null }
        : { status: 'recebido', receivedAt: now },
    });
    return NextResponse.json({ ok: true, item: updated });
  }

  return NextResponse.json({ error: 'type inválido' }, { status: 400 });
}
