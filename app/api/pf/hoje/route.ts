export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userId = session.user.id;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const [txs, buckets] = await Promise.all([
    prisma.pfTransaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      orderBy: { date: 'desc' },
    }),
    prisma.pfSavingsBucket.findMany({
      where: { userId, isActive: true },
      select: { balance: true },
    }),
  ]);

  const income = txs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const expenses = txs.filter(t => Number(t.amount) < 0 && t.group !== 'Poupança').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const savings = txs.filter(t => t.group === 'Poupança').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const resultado = income - expenses;
  const pocketMargin = resultado - savings;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const totalBuckets = buckets.reduce((s, b) => s + Number(b.balance), 0);

  const recent = txs.slice(0, 8).map(t => ({
    id: t.id,
    date: t.date,
    group: t.group,
    subgroup: t.subgroup,
    description: t.description,
    amount: Number(t.amount),
  }));

  return NextResponse.json({
    year,
    month,
    summary: { income, expenses, savings, resultado, pocketMargin, savingsRate },
    totalBuckets,
    recent,
  });
}
