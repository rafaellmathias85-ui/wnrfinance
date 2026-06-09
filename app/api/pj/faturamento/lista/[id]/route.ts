export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = (session.user as any).activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const { id } = params;

    const item = await prisma.accountsReceivable.findFirst({
      where: { id, companyId },
      include: {
        category: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const [nfes, boletos, emailLogs, auditLogs] = await Promise.all([
      prisma.nFe.findMany({
        where: { receivableId: id, companyId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.boletoCharge.findMany({
        where: { receivableId: id, companyId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.emailLog.findMany({
        where: { contextType: 'receivable', contextId: id, companyId },
        orderBy: { sentAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: { entity: 'AccountsReceivable', entityId: id, companyId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build unified timeline
    const timeline: Array<{
      id: string;
      date: Date;
      type: 'email' | 'audit';
      user: string;
      action: string;
      description: string;
    }> = [
      ...emailLogs.map(e => ({
        id: e.id,
        date: e.sentAt,
        type: 'email' as const,
        user: 'Sistema',
        action: 'E-mail',
        description: `E-mail enviado para ${e.to}: ${e.subject}`,
      })),
      ...auditLogs.map(a => ({
        id: a.id,
        date: a.createdAt,
        type: 'audit' as const,
        user: (a.metadata as any)?.userName || a.userId || 'Sistema',
        action: a.action,
        description: (a.metadata as any)?.description || a.action,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ item, nfes, boletos, timeline });
  } catch (error: any) {
    console.error('[pj/faturamento/lista/[id] GET]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
