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
      // Aceita 'receivable' (billing-pipeline) e 'AccountsReceivable' (outros módulos)
      prisma.auditLog.findMany({
        where: { entity: { in: ['receivable', 'AccountsReceivable'] }, entityId: id, companyId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const NFE_STATUS_LABEL: Record<string, string> = {
      rascunho: 'Rascunho', enviada: 'Enviada', autorizada: 'Autorizada',
      cancelada: 'Cancelada', rejeitada: 'Rejeitada',
    };
    const AUDIT_ACTION_LABEL: Record<string, string> = {
      SEND: 'Faturamento', CREATE: 'Criação', UPDATE: 'Atualização',
      DELETE: 'Exclusão', PAYMENT: 'Recebimento', CANCEL: 'Cancelamento',
    };

    // Build unified timeline
    const timeline: Array<{
      id: string;
      date: Date;
      type: 'nfe' | 'boleto' | 'email' | 'audit';
      user: string;
      action: string;
      description: string;
    }> = [
      ...nfes.map(n => ({
        id: n.id,
        date: n.createdAt,
        type: 'nfe' as const,
        user: 'Sistema',
        action: 'NFS-e / NF-e',
        description: `Nota fiscal ${NFE_STATUS_LABEL[n.status] ?? n.status}${n.errorMessage ? ` — ${n.errorMessage}` : ''}`,
      })),
      ...boletos.map(b => ({
        id: b.id,
        date: b.createdAt,
        type: 'boleto' as const,
        user: 'Sistema',
        action: 'Boleto',
        description: `Boleto ${b.status}${b.boletoBarCode ? ` — ${b.boletoBarCode.slice(0, 10)}…` : ''}`,
      })),
      ...emailLogs.map(e => ({
        id: e.id,
        date: e.sentAt,
        type: 'email' as const,
        user: 'Sistema',
        action: 'E-mail',
        description: `E-mail enviado para ${e.to}: ${e.subject}`,
      })),
      ...auditLogs.map(a => {
        const meta = a.metadata as any;
        let description = meta?.description || AUDIT_ACTION_LABEL[a.action] || a.action;
        // Enriquecer audit do billing-pipeline com detalhes de NFS-e/boleto/email
        if (a.action === 'SEND' && meta?.event === 'faturar_parcela') {
          const parts: string[] = [];
          if (meta.nfe) parts.push(`NFS-e: ${meta.nfe}`);
          if (meta.boleto) parts.push(`Boleto: ${meta.boleto}`);
          if (meta.email) parts.push(`E-mail: ${meta.email}`);
          if (parts.length) description = `Faturamento — ${parts.join(' · ')}`;
        }
        return {
          id: a.id,
          date: a.createdAt,
          type: 'audit' as const,
          user: meta?.userName || a.userId || 'Sistema',
          action: AUDIT_ACTION_LABEL[a.action] || a.action,
          description,
        };
      }),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ item, nfes, boletos, timeline });
  } catch (error: any) {
    console.error('[pj/faturamento/lista/[id] GET]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
