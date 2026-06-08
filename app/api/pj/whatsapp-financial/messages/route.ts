import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200);

  const sessions = await prisma.whatsappSession.findMany({
    where: { companyId },
    select: { id: true },
  });
  const sessionIds = sessions.map(s => s.id);

  if (sessionIds.length === 0) return NextResponse.json({ items: [] });

  const items = await prisma.whatsappMessage.findMany({
    where: {
      sessionId: { in: sessionIds },
      direction: 'outbound',
      contextType: { in: ['nfse', 'boleto', 'pix', 'payment_link', 'aviso_vencimento', 'cobranca_atraso'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      to: true,
      body: true,
      templateName: true,
      contextType: true,
      contextId: true,
      deliveryStatus: true,
      externalMsgId: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ items });
}
