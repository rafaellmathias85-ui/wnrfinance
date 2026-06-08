import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const alerts = await prisma.alert.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    const unreadCount = alerts.filter((a: any) => !a.isRead).length;
    return NextResponse.json({ alerts, unreadCount });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar alertas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    if (body.action === 'read-all') {
      await prisma.alert.updateMany({
        where: { userId: session.user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'read' && body.id) {
      await prisma.alert.updateMany({
        where: { id: body.id, userId: session.user.id },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao processar alerta' }, { status: 500 });
  }
}
