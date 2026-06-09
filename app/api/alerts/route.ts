import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Filter by context: PF (companyId = null) or PJ (companyId = activeCompanyId)
    const companyId = (session.user as any).activeCompanyId ?? null;
    const alerts = await prisma.alert.findMany({
      where: { userId: session.user.id, companyId: companyId ?? null },
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
      const companyId = (session.user as any).activeCompanyId ?? null;
      await prisma.alert.updateMany({
        where: { userId: session.user.id, isRead: false, companyId: companyId ?? null },
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
