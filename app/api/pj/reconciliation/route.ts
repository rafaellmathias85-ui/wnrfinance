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

  const where: any = { companyId };
  if (status) where.status = status;

  const items = await prisma.pJReconciliation.findMany({
    where,
    include: { logs: { orderBy: { createdAt: 'desc' }, take: 5 } },
    orderBy: { createdAt: 'desc' },
  });

  // Enrich with linked account details
  const payableIds = items.filter(i => i.type === 'PAYABLE' && i.accountId && i.accountId !== 'N/A').map(i => i.accountId);
  const receivableIds = items.filter(i => i.type === 'RECEIVABLE' && i.accountId && i.accountId !== 'N/A').map(i => i.accountId);

  const [payables, receivables] = await Promise.all([
    payableIds.length > 0
      ? prisma.accountsPayable.findMany({ where: { id: { in: payableIds } }, select: { id: true, description: true, amount: true, dueDate: true, supplierName: true } })
      : Promise.resolve([]),
    receivableIds.length > 0
      ? prisma.accountsReceivable.findMany({ where: { id: { in: receivableIds } }, select: { id: true, description: true, amount: true, dueDate: true, customerName: true } })
      : Promise.resolve([]),
  ]);

  const payableMap = Object.fromEntries(payables.map(p => [p.id, { ...p, party: p.supplierName }]));
  const receivableMap = Object.fromEntries(receivables.map(r => [r.id, { ...r, party: r.customerName }]));

  const enrichedItems = items.map(item => ({
    ...item,
    account: item.type === 'PAYABLE' ? (payableMap[item.accountId] ?? null) : (receivableMap[item.accountId] ?? null),
  }));

  const summary = {
    total: enrichedItems.length,
    reconciled: enrichedItems.filter(i => i.status === 'RECONCILED').length,
    divergent: enrichedItems.filter(i => i.status === 'DIVERGENT').length,
    bankOnly: enrichedItems.filter(i => i.status === 'BANK_ONLY').length,
    pending: enrichedItems.filter(i => i.status === 'PENDING').length,
    ignored: enrichedItems.filter(i => i.status === 'IGNORED').length,
  };

  // Group into batches by creation minute
  const batchMap = new Map<string, any>();
  for (const item of enrichedItems) {
    const d = new Date(item.createdAt);
    d.setSeconds(0, 0);
    const batchKey = d.toISOString();
    if (!batchMap.has(batchKey)) {
      batchMap.set(batchKey, {
        id: `batch_${batchKey}`,
        importedAt: item.createdAt,
        bankName: 'Extrato PJ',
        stats: { total: 0, reconciled: 0, divergent: 0, bankOnly: 0, pending: 0, ignored: 0 },
        items: [],
        dateRange: { min: item.bankDate, max: item.bankDate },
      });
    }
    const batch = batchMap.get(batchKey)!;
    batch.items.push(item);
    batch.stats.total++;
    const st = item.status;
    if (st === 'RECONCILED') batch.stats.reconciled++;
    else if (st === 'DIVERGENT') batch.stats.divergent++;
    else if (st === 'BANK_ONLY') batch.stats.bankOnly++;
    else if (st === 'PENDING') batch.stats.pending++;
    else if (st === 'IGNORED') batch.stats.ignored++;
    if (item.bankDate) {
      if (!batch.dateRange.min || new Date(item.bankDate) < new Date(batch.dateRange.min)) batch.dateRange.min = item.bankDate;
      if (!batch.dateRange.max || new Date(item.bankDate) > new Date(batch.dateRange.max)) batch.dateRange.max = item.bankDate;
    }
  }

  return NextResponse.json({ items: enrichedItems, summary, batches: Array.from(batchMap.values()) });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const { action } = body;

  const doUpdate = async (id: string, newStatus: string, extra?: { notes?: string; logAction?: string }) => {
    const existing = await prisma.pJReconciliation.findFirst({ where: { id, companyId } });
    if (!existing) return null;
    return prisma.pJReconciliation.update({
      where: { id },
      data: {
        status: newStatus,
        ...(extra?.notes !== undefined ? { notes: extra.notes } : {}),
        ...(newStatus === 'RECONCILED' ? { reconciledAt: new Date(), reconciledBy: session.user.id, matchMethod: 'manual' } : {}),
        ...(newStatus === 'PENDING' ? { reconciledAt: null, reconciledBy: null } : {}),
        logs: {
          create: {
            action: extra?.logAction || 'MANUAL_UPDATE',
            previousStatus: existing.status,
            newStatus,
            details: extra?.notes ? { notes: extra.notes } : {},
            performedBy: session.user.id,
          },
        },
      },
      include: { logs: { take: 5, orderBy: { createdAt: 'desc' } } },
    });
  };

  if (action === 'approve') {
    const updated = await doUpdate(body.reconciliationId, 'RECONCILED', { logAction: 'APPROVE' });
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  if (action === 'ignore') {
    const updated = await doUpdate(body.reconciliationId, 'IGNORED', { logAction: 'IGNORE' });
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  if (action === 'reopen') {
    const updated = await doUpdate(body.reconciliationId, 'PENDING', { logAction: 'REOPEN' });
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  if (action === 'force') {
    const updated = await doUpdate(body.reconciliationId, 'RECONCILED', { notes: body.notes, logAction: 'FORCE' });
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  if (action === 'unlink') {
    const updated = await doUpdate(body.reconciliationId, 'PENDING', { logAction: 'UNLINK' });
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  if (action === 'batch') {
    const { ids, batchAction } = body;
    if (!ids?.length) return NextResponse.json({ error: 'IDs obrigatórios' }, { status: 400 });
    const statusMap: Record<string, string> = { approve: 'RECONCILED', ignore: 'IGNORED', reopen: 'PENDING' };
    const newStatus = statusMap[batchAction];
    if (!newStatus) return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    const results = await Promise.all(ids.map((id: string) => doUpdate(id, newStatus, { logAction: `BATCH_${batchAction.toUpperCase()}` })));
    return NextResponse.json({ updated: results.filter(Boolean).length });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const { action } = body;

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

      let match = pool.find((p: any) => Math.abs(Number(p.amount) - absAmount) < 0.01);
      let matchStatus = 'NOT_FOUND';
      let divergenceNote = null;

      if (match) {
        const dateDiff = Math.abs(new Date(entry.date).getTime() - new Date(match.dueDate).getTime());
        matchStatus = dateDiff <= 5 * 86400000 ? 'RECONCILED' : 'DIVERGENT';
        if (matchStatus === 'DIVERGENT') divergenceNote = `Data divergente: banco ${entry.date}, sistema ${match.dueDate}`;
      } else {
        match = pool.find((p: any) => Math.abs(Number(p.amount) - absAmount) / Number(p.amount) < 0.05);
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
          matchMethod: 'auto',
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

      if (matchStatus === 'RECONCILED' && match) {
        if (matchType === 'PAYABLE') {
          await prisma.accountsPayable.update({ where: { id: match.id }, data: { status: 'pago', paidAt: new Date(entry.date), amountPaid: absAmount } });
        } else {
          await prisma.accountsReceivable.update({ where: { id: match.id }, data: { status: 'recebido', receivedAt: new Date(entry.date), amountReceived: absAmount } });
        }
      }

      results.push(recon);
    }

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        reconciled: results.filter(r => r.status === 'RECONCILED').length,
        divergent: results.filter(r => r.status === 'DIVERGENT').length,
        notFound: results.filter(r => r.status === 'NOT_FOUND').length,
        bankOnly: results.filter(r => r.status === 'BANK_ONLY').length,
      },
    });
  }

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
