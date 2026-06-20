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
        // Cancela NF-e no PROVEDOR (Sefaz/prefeitura) e só então no banco local.
        // Nunca marcar cancelada localmente com nota viva no provedor (furo fiscal).
        const { cancelNFe } = await import('@/lib/nfe');
        const justification = body.justification || 'Cancelamento solicitado pelo emissor';
        const nfes = await prisma.nFe.findMany({
          where: { receivableId: { in: ids }, companyId, status: { notIn: ['cancelada', 'rejeitada'] } },
        });
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const nfe of nfes) {
          try {
            if (nfe.providerNFeId && ['enviada', 'autorizada'].includes(nfe.status)) {
              const r = await cancelNFe(companyId, nfe.providerNFeId, justification, nfe.type as 'nfe' | 'nfse');
              if (!r.success) {
                results.push({ id: nfe.id, ok: false, error: r.errorMessage });
                continue;
              }
            }
            await prisma.nFe.update({
              where: { id: nfe.id },
              data: { status: 'cancelada', canceledAt: new Date(), cancelReason: justification },
            });
            if (nfe.receivableId) {
              await prisma.accountsReceivable.update({
                where: { id: nfe.receivableId },
                data: { nfeStatus: 'cancelada' },
              }).catch(() => {});
            }
            results.push({ id: nfe.id, ok: true });
          } catch (err: any) {
            results.push({ id: nfe.id, ok: false, error: err?.message });
          }
        }
        return NextResponse.json({ ok: true, action, results });
      }
      case 'cancel_boleto': {
        // Cancela a cobrança no PROVEDOR (Asaas/Inter) antes do banco local —
        // boleto cancelado só localmente continuaria pagável pelo cliente.
        const { cancelCharge } = await import('@/lib/boleto');
        const charges = await prisma.boletoCharge.findMany({
          where: { receivableId: { in: ids }, companyId, status: { notIn: ['cancelado', 'pago'] } },
        });
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const charge of charges) {
          try {
            if (charge.providerChargeId) {
              const r = await cancelCharge(companyId, charge.providerChargeId);
              if (!r.success) {
                results.push({ id: charge.id, ok: false, error: r.errorMessage });
                continue;
              }
            }
            await prisma.boletoCharge.update({ where: { id: charge.id }, data: { status: 'cancelado' } });
            if (charge.receivableId) {
              await prisma.accountsReceivable.update({
                where: { id: charge.receivableId },
                data: { boletoStatus: 'cancelado' },
              }).catch(() => {});
            }
            results.push({ id: charge.id, ok: true });
          } catch (err: any) {
            results.push({ id: charge.id, ok: false, error: err?.message });
          }
        }
        return NextResponse.json({ ok: true, action, results });
      }
      case 'faturar_agora': {
        // Pipeline real: NFS-e + boleto/pix + e-mail por parcela (idempotente)
        const { faturarParcela } = await import('@/lib/billing-pipeline');
        const eligible = items.filter((i) =>
          ['PREVISTA', 'FATURADA', 'VENCIDA'].includes((i as any).billingStatus || 'FATURADA') &&
          i.status !== 'cancelado' && i.status !== 'recebido',
        );
        const results = [] as any[];
        for (const item of eligible) {
          const r = await faturarParcela(item.id, { userId: session.user.id });
          results.push(r);
        }
        const succeeded = results.filter((r) => r.ok).length;
        return NextResponse.json({ ok: true, processed: results.length, succeeded, results });
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
        // Polling real no provedor fiscal (Focus NFe) — paridade BomControle
        // "Atualizar Status": complementa o webhook como mecanismo de reconciliação fiscal.
        const { queryNFeStatus } = await import('@/lib/nfe');
        const nfes = await prisma.nFe.findMany({
          where: {
            receivableId: { in: ids },
            companyId,
            providerNFeId: { not: null },
            status: { in: ['enviada', 'rascunho'] },
          },
        });
        const statusMap: Record<string, string> = {
          autorizado: 'autorizada',
          emitida: 'autorizada',
          cancelado: 'cancelada',
          erro_autorizacao: 'rejeitada',
          rejeitada: 'rejeitada',
          denegada: 'rejeitada',
          processando_autorizacao: 'enviada',
        };
        const results: Array<{ id: string; status?: string; error?: string }> = [];
        for (const nfe of nfes) {
          try {
            const remote = await queryNFeStatus(companyId, nfe.providerNFeId!, nfe.type);
            const newStatus = statusMap[remote.status] || remote.status;
            await prisma.nFe.update({
              where: { id: nfe.id },
              data: {
                status: newStatus,
                accessKey: remote.accessKey || nfe.accessKey,
                pdfUrl: remote.pdfUrl || nfe.pdfUrl,
                xmlUrl: remote.xmlUrl || nfe.xmlUrl,
                ...(newStatus === 'autorizada' && !nfe.issuedAt ? { issuedAt: new Date() } : {}),
              },
            });
            if (nfe.receivableId) {
              await prisma.accountsReceivable.update({
                where: { id: nfe.receivableId },
                data: { nfeStatus: newStatus === 'autorizada' ? 'emitida' : newStatus === 'enviada' ? 'pendente' : 'erro' },
              }).catch(() => {});
            }
            results.push({ id: nfe.id, status: newStatus });
          } catch (err: any) {
            results.push({ id: nfe.id, error: err?.message });
          }
        }
        return NextResponse.json({ ok: true, updated: results.length, results });
      }
      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[faturamento/batch POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
