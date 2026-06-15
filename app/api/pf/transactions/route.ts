export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/pf/transactions?year=2026&month=6
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const month = Number(searchParams.get('month')) || new Date().getMonth() + 1;
  const group = searchParams.get('group') || undefined;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const where: any = {
    userId: session.user.id,
    date: { gte: startDate, lte: endDate },
  };
  if (group) where.group = group;

  const transactions = await prisma.pfTransaction.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(transactions);
}

// POST /api/pf/transactions
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const { date, group, subgroup, amount, description, isRecurring } = body;

  if (!date || !group || !subgroup || amount === undefined) {
    return NextResponse.json({ error: 'Campos obrigatórios: date, group, subgroup, amount' }, { status: 400 });
  }

  const tx = await prisma.pfTransaction.create({
    data: {
      userId: session.user.id,
      date: new Date(date),
      group,
      subgroup,
      amount,
      description: description || null,
      isRecurring: isRecurring ?? false,
    },
  });

  return NextResponse.json(tx, { status: 201 });
}
