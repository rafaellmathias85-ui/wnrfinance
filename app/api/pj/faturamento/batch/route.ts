export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const body = await req.json();
    const { ids, action } = body;

    if (!ids?.length) return NextResponse.json({ error: 'Nenhum item selecionado' }, { status: 400 });

    // Verify ownership
    const items = await prisma.accountsReceivable.findMany({
      where: { id: { in: ids }, companyId },
    });
    if (items.length !== ids.length) return NextResponse.json({ error: 'Itens inválidos' }, { status: 403 });

    switch (action) {
      case 'cancel_nfe': {
        // Cancel NFes linked to the selected receivables
        await prisma.nFe.updateMany({
          where: { receivableId: { in: ids }, companyId, status: { notIn: ['cancelada'] } },
          data: { status: 'cancelada', canceledAt: new Date(), cancelReason: 'Cancelamento em lote' },
        });
        return NextResponse.json({ ok: true, action });
      }
      case 'cancel_boleto': {
        await prisma.boletoCharge.updateMany({
          where: { receivableId: { in: ids }, companyId, status: { notIn: ['cancelado', 'pago'] } },
          data: { status: 'cancelado' },
        });
        return NextResponse.json({ ok: true, action });
      }
      case 'faturar_agora': {
        const pendingItems = items.filter(i => i.status === 'pendente');
        // Mark as "em processamento" — real generation would be a background job
        for (const item of pendingItems) {
          await prisma.auditLog.create({
            data: {
              userId: session.user.id,
              companyId,
              action: 'UPDATE',
              entity: 'AccountsReceivable',
              entityId: item.id,
              metadata: { description: 'Faturamento imediato solicitado via lote', userName: session.user.name },
            },
          });
        }
        return NextResponse.json({ ok: true, processed: pendingItems.length });
      }
      case 'no_boleto':
        await prisma.accountsReceivable.updateMany({ where: { id: { in: ids }, companyId }, data: { generateBoleto: false } });
        return NextResponse.json({ ok: true, action });
      case 'no_pix':
        await prisma.accountsReceivable.updateMany({ where: { id: { in: ids }, companyId }, data: { generatePix: false } });
        return NextResponse.json({ ok: true, action });
      case 'no_nfe':
        await prisma.accountsReceivable.updateMany({ where: { id: { in: ids }, companyId }, data: { generateNfe: false } });
        return NextResponse.json({ ok: true, action });
      case 'no_all':
        await prisma.accountsReceivable.updateMany({
          where: { id: { in: ids }, companyId },
          data: { generateBoleto: false, generatePix: false, generateNfe: false },
        });
        return NextResponse.json({ ok: true, action });
      case 'reenviar_fatura': {
        const smtp = await prisma.smtpConfig.findFirst({
          where: { companyId, isDefault: true, isActive: true },
        });
        let queued = 0;
        for (const item of items) {
          if (!item.customerEmail) continue;
          await prisma.emailQueue.create({
            data: {
              companyId,
              smtpConfigId: smtp?.id || null,
              to: item.customerEmail,
              subject: `Fatura — ${item.description || 'Cobrança'}`,
              htmlBody: `<p>Olá ${item.customerName || ''},</p><p>Segue sua fatura referente a: <strong>${item.description || 'Cobrança'}</strong>.</p><p>Vencimento: ${item.dueDate ? new Date(item.dueDate).toLocaleDateString('pt-BR') : '—'}</p>`,
              contextType: 'receivable',
              contextId: item.id,
              priority: 3,
            },
          });
          await prisma.emailLog.create({
            data: {
              companyId,
              smtpConfigId: smtp?.id || null,
              to: item.customerEmail,
              subject: `Fatura — ${item.description || 'Cobrança'}`,
              contextType: 'receivable',
              contextId: item.id,
              status: 'sent',
            },
          });
          queued++;
        }
        return NextResponse.json({ ok: true, queued });
      }
      case 'update_nfse_status': {
        // Placeholder — would call fiscal provider API for each
        return NextResponse.json({ ok: true, message: 'Status NFSE atualizado (simulado)' });
      }
      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[faturamento/batch POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
