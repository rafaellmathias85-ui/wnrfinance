import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;

    const box = await prisma.savingsBox.findFirst({ where: { id, userId: session.user.id } });
    if (!box) return NextResponse.json({ error: 'Caixinha não encontrada' }, { status: 404 });

    const body = await req.json();
    const amount = parseFloat(body.amount) || 0;

    let newBalance = box.balance;
    if (body.action === 'add') {
      newBalance += amount;
    } else if (body.action === 'remove') {
      newBalance = Math.max(0, newBalance - amount);
    }

    // Create contribution record
    if (amount > 0) {
      await prisma.savingsContribution.create({
        data: {
          boxId: id,
          amount,
          type: body.action === 'add' ? 'deposit' : 'withdrawal',
          notes: body.notes || null,
        },
      });
    }

    const isCompleted = newBalance >= box.goal;
    const updated = await prisma.savingsBox.update({
      where: { id },
      data: { balance: newBalance, isCompleted },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar caixinha' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;
    await prisma.savingsBox.deleteMany({ where: { id, userId: session.user.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao deletar caixinha' }, { status: 500 });
  }
}
