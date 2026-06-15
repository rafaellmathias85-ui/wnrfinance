export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PUT /api/pf/transactions/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const tx = await prisma.pfTransaction.findUnique({ where: { id: params.id } });
  if (!tx || tx.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const body = await req.json();
  const updated = await prisma.pfTransaction.update({
    where: { id: params.id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      group: body.group,
      subgroup: body.subgroup,
      amount: body.amount,
      description: body.description ?? null,
      isRecurring: body.isRecurring,
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/pf/transactions/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const tx = await prisma.pfTransaction.findUnique({ where: { id: params.id } });
  if (!tx || tx.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  await prisma.pfTransaction.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
