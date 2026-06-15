export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// GET /api/pf/poupanca/[id]/entries?year=2026
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const bucket = await prisma.pfSavingsBucket.findUnique({ where: { id: params.id } });
  if (!bucket || bucket.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const year = Number(new URL(req.url).searchParams.get('year')) || undefined;
  const where: any = { bucketId: params.id };
  if (year) {
    where.date = {
      gte: new Date(year, 0, 1),
      lte: new Date(year, 11, 31),
    };
  }

  const entries = await prisma.pfSavingsEntry.findMany({
    where,
    orderBy: { date: 'desc' },
  });

  return NextResponse.json(entries);
}

// POST /api/pf/poupanca/[id]/entries → registra aporte/rendimento/resgate
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const bucket = await prisma.pfSavingsBucket.findUnique({ where: { id: params.id } });
  if (!bucket || bucket.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const { date, type, amount, notes } = await req.json();
  if (!date || !type || amount === undefined) {
    return NextResponse.json({ error: 'Campos obrigatórios: date, type, amount' }, { status: 400 });
  }

  const numAmount = Number(amount);
  const delta = type === 'resgate' ? -Math.abs(numAmount) : Math.abs(numAmount);

  const [entry] = await prisma.$transaction([
    prisma.pfSavingsEntry.create({
      data: {
        bucketId: params.id,
        userId: session.user.id,
        date: new Date(date),
        type,
        amount: numAmount,
        notes: notes || null,
      },
    }),
    prisma.pfSavingsBucket.update({
      where: { id: params.id },
      data: { balance: { increment: delta } },
    }),
  ]);

  return NextResponse.json(entry, { status: 201 });
}

// DELETE /api/pf/poupanca/[id]/entries?entryId=xxx
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const entryId = new URL(req.url).searchParams.get('entryId');
  if (!entryId) return NextResponse.json({ error: 'entryId obrigatório' }, { status: 400 });

  const entry = await prisma.pfSavingsEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.userId !== session.user.id || entry.bucketId !== params.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const delta = entry.type === 'resgate' ? Math.abs(Number(entry.amount)) : -Math.abs(Number(entry.amount));

  await prisma.$transaction([
    prisma.pfSavingsEntry.delete({ where: { id: entryId } }),
    prisma.pfSavingsBucket.update({
      where: { id: params.id },
      data: { balance: { increment: delta } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
