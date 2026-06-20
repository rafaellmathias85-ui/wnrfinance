export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emitNFe, cancelNFe, queryNFeStatus, NFePayload } from '@/lib/nfe';
import { createAuditLog } from '@/lib/audit-log';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const nfe = await prisma.nFe.findFirst({ where: { id: params.id, companyId: session.user.activeCompanyId } });
    if (!nfe) return NextResponse.json({ error: 'NF-e não encontrada' }, { status: 404 });

    return NextResponse.json(nfe);
  } catch {
    return NextResponse.json({ error: 'Erro ao buscar NF-e' }, { status: 500 });
  }
}

// PATCH /api/pj/nfe/[id] — actions: emit, cancel, sync_status
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId;
    const body = await request.json();
    const { action, cancelReason } = body;

    const nfe = await prisma.nFe.findFirst({ where: { id: params.id, companyId } });
    if (!nfe) return NextResponse.json({ error: 'NF-e não encontrada' }, { status: 404 });

    if (action === 'emit') {
      if (nfe.status !== 'rascunho') return NextResponse.json({ error: 'Apenas rascunhos podem ser emitidos' }, { status: 400 });

      const items = nfe.items as any[];
      const payload: NFePayload = {
        naturezaOperacao: 'Venda de mercadorias',
        destinatarioNome: nfe.customerName!,
        destinatarioDoc: nfe.customerDoc!,
        destinatarioEmail: nfe.customerEmail || undefined,
        items: items.map((i: any) => ({
          codigo: i.codigo || '000',
          descricao: i.descricao || i.productName,
          unidade: i.unidade || 'UN',
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          valorTotal: i.valorTotal,
        })),
      };

      const result = await emitNFe(companyId, payload);
      await prisma.nFe.update({
        where: { id: nfe.id },
        data: {
          status: result.success ? 'enviada' : 'rejeitada',
          providerNFeId: result.providerNFeId || undefined,
          accessKey: result.accessKey || undefined,
          xmlUrl: result.xmlUrl || undefined,
          pdfUrl: result.pdfUrl || undefined,
          errorMessage: result.errorMessage || null,
          issuedAt: result.success ? new Date() : undefined,
        },
      });

      await createAuditLog({ userId: session.user.id, companyId, action: 'SEND', entity: 'nfe', entityId: nfe.id, request });
      return NextResponse.json(result);

    } else if (action === 'cancel') {
      if (!nfe.providerNFeId) return NextResponse.json({ error: 'NF-e não emitida, não pode ser cancelada' }, { status: 400 });
      if (!cancelReason || cancelReason.length < 15) return NextResponse.json({ error: 'Justificativa deve ter pelo menos 15 caracteres' }, { status: 400 });

      const result = await cancelNFe(companyId, nfe.providerNFeId, cancelReason, nfe.type as 'nfe' | 'nfse');
      if (result.success) {
        await prisma.nFe.update({ where: { id: nfe.id }, data: { status: 'cancelada', cancelReason, canceledAt: new Date() } });
        await createAuditLog({ userId: session.user.id, companyId, action: 'CANCEL', entity: 'nfe', entityId: nfe.id, metadata: { reason: cancelReason }, request });
      }
      return NextResponse.json(result);

    } else if (action === 'sync_status') {
      if (!nfe.providerNFeId) return NextResponse.json({ error: 'NF-e sem ID de provedor' }, { status: 400 });

      const status = await queryNFeStatus(companyId, nfe.providerNFeId, nfe.type);
      const statusMap: Record<string, string> = {
        autorizado: 'autorizada',
        emitida: 'autorizada',
        cancelado: 'cancelada',
        erro_autorizacao: 'rejeitada',
        rejeitada: 'rejeitada',
        denegada: 'rejeitada',
        processando_autorizacao: 'enviada',
      };
      const newStatus = statusMap[status.status] || nfe.status;
      await prisma.nFe.update({
        where: { id: nfe.id },
        data: {
          status: newStatus,
          accessKey: status.accessKey || nfe.accessKey || undefined,
          pdfUrl: status.pdfUrl || nfe.pdfUrl || undefined,
          xmlUrl: status.xmlUrl || nfe.xmlUrl || undefined,
          ...(newStatus === 'autorizada' && !nfe.issuedAt ? { issuedAt: new Date() } : {}),
        },
      });
      return NextResponse.json({ ...status, mappedStatus: newStatus });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('PATCH NF-e error:', error);
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const nfe = await prisma.nFe.findFirst({ where: { id: params.id, companyId: session.user.activeCompanyId } });
    if (!nfe) return NextResponse.json({ error: 'NF-e não encontrada' }, { status: 404 });
    if (nfe.status !== 'rascunho') return NextResponse.json({ error: 'Apenas rascunhos podem ser excluídos' }, { status: 400 });

    await prisma.nFe.delete({ where: { id: params.id } });
    await createAuditLog({ userId: session.user.id, companyId: session.user.activeCompanyId, action: 'DELETE', entity: 'nfe', entityId: params.id, request });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erro ao excluir NF-e' }, { status: 500 });
  }
}
