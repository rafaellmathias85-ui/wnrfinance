import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const boxes = await prisma.savingsBox.findMany({
      where: { userId: session.user.id },
      include: { contributions: { orderBy: { date: 'desc' }, take: 10 } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(boxes);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar caixinhas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const box = await prisma.savingsBox.create({
      data: {
        userId: session.user.id,
        name: body.name,
        goal: parseFloat(body.goal),
        emoji: body.emoji || '🎯',
        category: body.category || 'outros',
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
      },
    });
    return NextResponse.json(box, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar caixinha' }, { status: 500 });
  }
}
