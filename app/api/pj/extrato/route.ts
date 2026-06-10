export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const bankConnectionId = searchParams.get('bankConnectionId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const dateStart = startDate ? new Date(startDate) : defaultStart;
  const dateEnd = endDate ? new Date(endDate + 'T23:59:59') : defaultEnd;

  // Load bank accounts for company
  const bankAccounts = await prisma.bankConnection.findMany({
    where: { companyId, status: { in: ['active', 'ACTIVE'] } },
    select: { id: true, bankName: true, accountNumber: true, openingBalance: true, currentBalance: true },
  });

  if (bankAccounts.length === 0) {
    return NextResponse.json({ bankAccounts: [], lines: [], saldoInicial: 0, saldoFinal: 0, totalEntradas: 0, totalSaidas: 0 });
  }

  // If no specific bank selected, use first one
  const targetBankId = bankConnectionId || bankAccounts[0].id;
  const bank = bankAccounts.find((b) => b.id === targetBankId) || bankAccounts[0];

  const saldoInicial = bank?.openingBalance || 0;

  // Load payables and receivables for the bank in the period
  const [payables, receivables] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: {
        companyId,
        status: 'pago',
        paidAt: { gte: dateStart, lte: dateEnd },
      },
      include: { category: true },
      orderBy: { paidAt: 'asc' },
    }),
    prisma.accountsReceivable.findMany({
      where: {
        companyId,
        status: 'recebido',
        receivedAt: { gte: dateStart, lte: dateEnd },
      },
      include: { category: true },
      orderBy: { receivedAt: 'asc' },
    }),
  ]);

  type Line = {
    id: string;
    date: Date;
    description: string;
    category: string | null;
    tipo: 'entrada' | 'saida';
    amount: number;
    saldoAcumulado: number;
  };

  const lines: Line[] = [];
  let balance = saldoInicial;

  const all: Array<{ id: string; date: Date; description: string; category: string | null; tipo: 'entrada' | 'saida'; amount: number }> = [
    ...payables.map((p) => ({
      id: p.id,
      date: p.paidAt!,
      description: p.description,
      category: p.category?.name || null,
      tipo: 'saida' as const,
      amount: p.amountPaid || p.amount,
    })),
    ...receivables.map((r) => ({
      id: r.id,
      date: r.receivedAt!,
      description: r.description,
      category: r.category?.name || null,
      tipo: 'entrada' as const,
      amount: r.amountReceived || r.amount,
    })),
  ];

  all.sort((a, b) => a.date.getTime() - b.date.getTime());

  let totalEntradas = 0;
  let totalSaidas = 0;

  for (const item of all) {
    if (item.tipo === 'entrada') { balance += item.amount; totalEntradas += item.amount; }
    else { balance -= item.amount; totalSaidas += item.amount; }
    lines.push({ ...item, saldoAcumulado: balance });
  }

  return NextResponse.json({
    bankAccounts,
    lines,
    saldoInicial,
    saldoFinal: balance,
    totalEntradas,
    totalSaidas,
  });
}
