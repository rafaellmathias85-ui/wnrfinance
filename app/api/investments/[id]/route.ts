import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const inv = await prisma.investment.updateMany({
      where: { id, userId: session.user.id },
      data: {
        name: body.name,
        type: body.type,
        broker: body.broker,
        amount: body.amount ? parseFloat(body.amount) : undefined,
        currentValue: body.currentValue ? parseFloat(body.currentValue) : undefined,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
        maturityDate: body.maturityDate ? new Date(body.maturityDate) : null,
        notes: body.notes,
      },
    });
    return NextResponse.json(inv);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar investimento' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;
    await prisma.investment.deleteMany({ where: { id, userId: session.user.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao deletar investimento' }, { status: 500 });
  }
}
