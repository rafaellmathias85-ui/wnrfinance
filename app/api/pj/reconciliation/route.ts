export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');

  const where: any = { companyId };
  if (status) where.status = status;
  if (type) where.type = type;

  const items = await prisma.pJReconciliation.findMany({
    where,
    include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const { action } = body;

  // Auto-match engine
  if (action === 'auto-match') {
    const payables = await prisma.accountsPayable.findMany({
      where: { companyId, status: { in: ['pendente', 'vencido'] } },
    });
    const receivables = await prisma.accountsReceivable.findMany({
      where: { companyId, status: { in: ['pendente', 'vencido'] } },
    });

    const bankEntries = body.bankEntries as Array<{ reference: string; date: string; amount: number; type: string }>;
    if (!bankEntries?.length) return NextResponse.json({ error: 'Nenhuma entrada bancária fornecida' }, { status: 400 });

    const results: any[] = [];
    for (const entry of bankEntries) {
      const pool = entry.type === 'DEBIT' ? payables : receivables;
      const matchType = entry.type === 'DEBIT' ? 'PAYABLE' : 'RECEIVABLE';
      const absAmount = Math.abs(entry.amount);

      // Try exact amount match
      let match = pool.find((p: any) => {
        const diff = Math.abs(Number(p.amount) - absAmount);
        return diff < 0.01;
      });

      let matchStatus = 'NOT_FOUND';
      let method = 'auto';
      let divergenceNote = null;

      if (match) {
        const dateDiff = Math.abs(new Date(entry.date).getTime() - new Date(match.dueDate).getTime());
        if (dateDiff <= 5 * 86400000) {
          matchStatus = 'RECONCILED';
        } else {
          matchStatus = 'DIVERGENT';
          divergenceNote = `Data divergente: banco ${entry.date}, sistema ${match.dueDate}`;
        }
      } else {
        // Try approximate match (within 5%)
        match = pool.find((p: any) => {
          const diff = Math.abs(Number(p.amount) - absAmount) / Number(p.amount);
          return diff < 0.05;
        });
        if (match) {
          matchStatus = 'DIVERGENT';
          divergenceNote = `Valor divergente: banco R$ ${absAmount.toFixed(2)}, sistema R$ ${Number(match.amount).toFixed(2)}`;
        } else {
          matchStatus = 'BANK_ONLY';
        }
      }

      const recon = await prisma.pJReconciliation.create({
        data: {
          companyId,
          type: matchType,
          accountId: match?.id || 'N/A',
          bankReference: entry.reference,
          bankDate: new Date(entry.date),
          bankAmount: absAmount,
          status: matchStatus,
          matchMethod: method,
          divergenceNote,
          ...(matchStatus === 'RECONCILED' ? { reconciledAt: new Date(), reconciledBy: session.user.id } : {}),
          logs: {
            create: {
              action: 'AUTO_MATCH',
              previousStatus: 'NEW',
              newStatus: matchStatus,
              details: { bankRef: entry.reference, matchedId: match?.id || null },
              performedBy: session.user.id,
            },
          },
        },
        include: { logs: true },
      });

      // If reconciled, update the original record
      if (matchStatus === 'RECONCILED' && match) {
        if (matchType === 'PAYABLE') {
          await prisma.accountsPayable.update({
            where: { id: match.id },
            data: { status: 'pago', paidAt: new Date(entry.date), amountPaid: absAmount },
          });
        } else {
          await prisma.accountsReceivable.update({
            where: { id: match.id },
            data: { status: 'recebido', receivedAt: new Date(entry.date), amountReceived: absAmount },
          });
        }
      }

      results.push(recon);
    }

    return NextResponse.json({ results, summary: {
      total: results.length,
      reconciled: results.filter(r => r.status === 'RECONCILED').length,
      divergent: results.filter(r => r.status === 'DIVERGENT').length,
      notFound: results.filter(r => r.status === 'NOT_FOUND').length,
      bankOnly: results.filter(r => r.status === 'BANK_ONLY').length,
    }});
  }

  // Manual action
  if (action === 'manual-update') {
    const { reconciliationId, newStatus, notes } = body;
    if (!reconciliationId) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const existing = await prisma.pJReconciliation.findFirst({ where: { id: reconciliationId, companyId } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const updated = await prisma.pJReconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: newStatus,
        notes: notes || existing.notes,
        ...(newStatus === 'RECONCILED' ? { reconciledAt: new Date(), reconciledBy: session.user.id, matchMethod: 'manual' } : {}),
        ...(newStatus === 'IGNORED' ? { reconciledAt: new Date(), reconciledBy: session.user.id } : {}),
        logs: {
          create: {
            action: 'MANUAL_UPDATE',
            previousStatus: existing.status,
            newStatus,
            details: { notes },
            performedBy: session.user.id,
          },
        },
      },
      include: { logs: true },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
