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
    const card = await prisma.creditCard.updateMany({
      where: { id, userId: session.user.id },
      data: {
        name: body.name,
        bank: body.bank,
        lastFour: body.lastFour,
        cardLimit: body.cardLimit ? parseFloat(body.cardLimit) : undefined,
        closingDay: body.closingDay ? parseInt(body.closingDay) : undefined,
        dueDay: body.dueDay ? parseInt(body.dueDay) : undefined,
        color: body.color,
        isActive: body.isActive,
      },
    });
    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar cartão' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;
    await prisma.creditCard.deleteMany({ where: { id, userId: session.user.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao deletar cartão' }, { status: 500 });
  }
}
