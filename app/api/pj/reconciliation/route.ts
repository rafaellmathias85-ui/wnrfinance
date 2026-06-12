export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

// ── Scoring engine ─────────────────────────────────────────────────────────────
interface ScoreResult {
  score: number;
  amountDiff: number;
  dateDiffDays: number;
}

function scoreCandidate(
  bankAmount: number,
  bankDate: Date,
  bankRef: string,
  record: { amount: number; dueDate: Date | string; paidDate?: Date | string | null; description?: string; customerName?: string | null; supplierName?: string | null },
): ScoreResult {
  const recAmount = Number(record.amount);
  const dueMs = new Date(record.dueDate).getTime();
  const paidMs = record.paidDate ? new Date(record.paidDate as any).getTime() : null;
  const bankMs = bankDate.getTime();
  // Use paidDate if it is closer to bankDate than dueDate
  const recDate = paidMs !== null && Math.abs(paidMs - bankMs) < Math.abs(dueMs - bankMs)
    ? new Date(record.paidDate as any)
    : new Date(record.dueDate);
  const amountDiff = Math.abs(recAmount - bankAmount);
  const dateDiffDays = Math.abs(recDate.getTime() - bankMs) / 86400000;

  // Amount score — no score at all beyond 2%
  let amountScore = 0;
  if (amountDiff < 0.01) amountScore = 60;
  else if (amountDiff < 1.00) amountScore = 35;
  else if (recAmount > 0 && amountDiff / recAmount < 0.02) amountScore = 20;

  if (amountScore === 0) return { score: 0, amountDiff, dateDiffDays };

  // Date score
  let dateScore = 0;
  if (dateDiffDays <= 2) dateScore = 40;
  else if (dateDiffDays <= 7) dateScore = 25;
  else if (dateDiffDays <= 15) dateScore = 10;
  else if (dateDiffDays <= 30) dateScore = 3;
  else dateScore = -100; // hard block: > 30 days = effectively excluded

  // Name similarity bonus (max +20)
  const recName = (record.customerName || record.supplierName || record.description || '').toLowerCase();
  const ref = bankRef.toLowerCase();
  if (recName && ref) {
    const words = recName.split(/\s+/).filter(w => w.length > 3);
    const matched = words.filter(w => ref.includes(w)).length;
    if (matched > 0) dateScore += Math.min(20, matched * 6);
  }

  return { score: amountScore + dateScore, amountDiff, dateDiffDays };
}

function classifyMatch(
  scored: ScoreResult,
  bankAmount: number,
  bankDate: Date,
  record: { amount: number; dueDate: Date | string },
): { status: string; note: string | null } {
  const { amountDiff, dateDiffDays } = scored;
  const recDate = new Date(record.dueDate);

  if (amountDiff < 0.01 && dateDiffDays <= 7) return { status: 'RECONCILED', note: null };

  if (amountDiff < 0.01 && dateDiffDays > 7) {
    return {
      status: 'DIVERGENT',
      note: `Data divergente: banco ${bankDate.toISOString().split('T')[0]}, sistema ${recDate.toISOString().split('T')[0]} (${Math.round(dateDiffDays)}d)`,
    };
  }

  return {
    status: 'DIVERGENT',
    note: `Valor divergente: banco R$ ${bankAmount.toFixed(2)}, sistema R$ ${Number(record.amount).toFixed(2)}`,
  };
}

// Find best match from a pool, excluding already-used IDs
function findBestMatch(
  bankAmount: number,
  bankDate: Date,
  bankRef: string,
  pool: any[],
  usedIds: Set<string>,
): { record: any; scored: ScoreResult } | null {
  // Pre-filter: only records within 30 days of bank date
  const window = pool.filter(p => {
    if (usedIds.has(p.id)) return false;
    const dueDiff = Math.abs(new Date(p.dueDate).getTime() - bankDate.getTime()) / 86400000;
    const paidDiff = p.paidDate ? Math.abs(new Date(p.paidDate).getTime() - bankDate.getTime()) / 86400000 : Infinity;
    return Math.min(dueDiff, paidDiff) <= 45;
  });

  if (window.length === 0) return null;

  let best: { record: any; scored: ScoreResult } | null = null;
  for (const rec of window) {
    const scored = scoreCandidate(bankAmount, bankDate, bankRef, rec);
    if (scored.score <= 0) continue;
    if (!best || scored.score > best.scored.score) best = { record: rec, scored };
  }

  // Minimum viable score: at least amount matches (amountScore > 0) and not heavily penalised
  if (!best || best.scored.score <= 0) return null;
  return best;
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
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

  const enriched = items.map(item => ({
    ...item,
    account: item.type === 'PAYABLE' ? (payableMap[item.accountId] ?? null) : (receivableMap[item.accountId] ?? null),
  }));

  const summary = {
    total: enriched.length,
    reconciled: enriched.filter(i => i.status === 'RECONCILED').length,
    divergent: enriched.filter(i => i.status === 'DIVERGENT').length,
    bankOnly: enriched.filter(i => i.status === 'BANK_ONLY').length,
    suggested: enriched.filter(i => i.status === 'SUGGESTED').length,
    pending: enriched.filter(i => i.status === 'PENDING').length,
    ignored: enriched.filter(i => i.status === 'IGNORED').length,
  };

  // Group by importBatchId (preferred) or by creation-minute (legacy records without batchId)
  const batchMap = new Map<string, any>();
  for (const item of enriched) {
    const batchKey = (item as any).importBatchId
      ? `bid_${(item as any).importBatchId}`
      : (() => { const d = new Date(item.createdAt); d.setSeconds(0, 0); return `min_${d.toISOString()}`; })();

    if (!batchMap.has(batchKey)) {
      const bName = (item as any).bankName || 'Extrato PJ';
      batchMap.set(batchKey, {
        id: `batch_${batchKey}`,
        importBatchId: (item as any).importBatchId || null,
        importedAt: item.createdAt,
        bankName: bName,
        bankConnectionId: (item as any).bankConnectionId || null,
        stats: { total: 0, reconciled: 0, divergent: 0, bankOnly: 0, suggested: 0, pending: 0, ignored: 0 },
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
    else if (st === 'SUGGESTED') batch.stats.suggested++;
    else if (st === 'PENDING') batch.stats.pending++;
    else if (st === 'IGNORED') batch.stats.ignored++;
    if (item.bankDate) {
      if (!batch.dateRange.min || new Date(item.bankDate) < new Date(batch.dateRange.min)) batch.dateRange.min = item.bankDate;
      if (!batch.dateRange.max || new Date(item.bankDate) > new Date(batch.dateRange.max)) batch.dateRange.max = item.bankDate;
    }
  }

  return NextResponse.json({ items: enriched, summary, batches: Array.from(batchMap.values()) });
}

// ── PATCH ──────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
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
    const rec = await prisma.pJReconciliation.findFirst({ where: { id: body.reconciliationId, companyId } });
    if (!rec) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const updated = await doUpdate(body.reconciliationId, 'RECONCILED', { notes: body.notes, logAction: 'FORCE' });
    if (body.updateAmount && rec.accountId && rec.type === 'PAYABLE' && rec.bankAmount) {
      await prisma.accountsPayable.update({
        where: { id: rec.accountId },
        data: { amountPaid: rec.bankAmount, amount: rec.bankAmount, status: 'pago', paidAt: rec.bankDate },
      }).catch(() => {});
    }
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

  if (action === 'link') {
    const { reconciliationId, accountId } = body;
    if (!reconciliationId || !accountId) return NextResponse.json({ error: 'IDs obrigatórios' }, { status: 400 });
    const existing = await prisma.pJReconciliation.findFirst({ where: { id: reconciliationId, companyId } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const updated = await prisma.pJReconciliation.update({
      where: { id: reconciliationId },
      data: {
        accountId,
        status: 'RECONCILED',
        matchMethod: 'manual',
        reconciledAt: new Date(),
        reconciledBy: session.user.id,
        divergenceNote: null,
        logs: { create: { action: 'MANUAL_LINK', previousStatus: existing.status, newStatus: 'RECONCILED', details: { linkedAccountId: accountId }, performedBy: session.user.id } },
      },
      include: { logs: true },
    });
    if (existing.type === 'PAYABLE') {
      await prisma.accountsPayable.update({ where: { id: accountId }, data: { status: 'pago', paidAt: existing.bankDate, amountPaid: existing.bankAmount } });
    } else {
      await prisma.accountsReceivable.update({ where: { id: accountId }, data: { status: 'recebido', receivedAt: existing.bankDate, amountReceived: existing.bankAmount } });
    }
    return NextResponse.json(updated);
  }

  if (action === 'clear-match') {
    const rec = await prisma.pJReconciliation.findFirst({ where: { id: body.reconciliationId, companyId } });
    if (!rec) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const updated = await prisma.pJReconciliation.update({
      where: { id: body.reconciliationId },
      data: {
        accountId: 'N/A', status: 'BANK_ONLY', divergenceNote: null, reconciledAt: null, reconciledBy: null,
        logs: { create: { action: 'CLEAR_MATCH', previousStatus: rec.status, newStatus: 'BANK_ONLY', details: {}, performedBy: session.user.id } },
      },
      include: { logs: { take: 5, orderBy: { createdAt: 'desc' } } },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const { action } = body;

  // ── rerun-match (re-process PENDING/BANK_ONLY existing records) ────────────
  if (action === 'rerun-match') {
    const pendingItems = await prisma.pJReconciliation.findMany({
      where: { companyId, status: { in: ['PENDING', 'BANK_ONLY', 'NOT_FOUND'] } },
    });
    if (!pendingItems.length) return NextResponse.json({ summary: { total: 0, updated: 0 } });

    const [reconP, reconR, allPay, allRec] = await Promise.all([
      prisma.pJReconciliation.findMany({ where: { companyId, status: 'RECONCILED', type: 'PAYABLE' }, select: { accountId: true } }),
      prisma.pJReconciliation.findMany({ where: { companyId, status: 'RECONCILED', type: 'RECEIVABLE' }, select: { accountId: true } }),
      prisma.accountsPayable.findMany({ where: { companyId }, select: { id: true, description: true, amount: true, dueDate: true, supplierName: true, status: true, paidAt: true } }),
      prisma.accountsReceivable.findMany({ where: { companyId }, select: { id: true, description: true, amount: true, dueDate: true, customerName: true, status: true, receivedAt: true } }),
    ]);
    const reconPayIds = new Set(reconP.map(i => i.accountId).filter(Boolean));
    const reconRecIds = new Set(reconR.map(i => i.accountId).filter(Boolean));
    const payables = allPay.filter(p => !reconPayIds.has(p.id)).map(p => ({ ...p, paidDate: p.paidAt }));
    const receivables = allRec.filter(r => !reconRecIds.has(r.id)).map(r => ({ ...r, paidDate: r.receivedAt }));

    const usedPayableIds = new Set<string>();
    const usedReceivableIds = new Set<string>();
    let updated = 0;

    for (const item of pendingItems) {
      if (!item.bankAmount || !item.bankDate) continue;
      const pool = item.type === 'PAYABLE' ? payables : receivables;
      const usedIds = item.type === 'PAYABLE' ? usedPayableIds : usedReceivableIds;

      const best = findBestMatch(item.bankAmount, item.bankDate, item.bankReference || '', pool, usedIds);

      let newStatus = 'BANK_ONLY';
      let divergenceNote: string | null = null;
      let matchId: string | null = null;

      if (best) {
        const cls = classifyMatch(best.scored, item.bankAmount, item.bankDate, best.record);
        newStatus = cls.status;
        divergenceNote = cls.note;
        matchId = best.record.id;
        if (newStatus === 'RECONCILED') usedIds.add(best.record.id);
      }

      if (newStatus !== item.status) {
        await prisma.pJReconciliation.update({
          where: { id: item.id },
          data: {
            status: newStatus,
            accountId: matchId || item.accountId,
            divergenceNote,
            matchMethod: 'auto',
            ...(newStatus === 'RECONCILED' ? { reconciledAt: new Date(), reconciledBy: session.user.id } : {}),
            logs: { create: { action: 'RERUN_MATCH', previousStatus: item.status, newStatus, details: { matchedId: matchId }, performedBy: session.user.id } },
          },
        });
        if (newStatus === 'RECONCILED' && matchId) {
          if (item.type === 'PAYABLE') await prisma.accountsPayable.update({ where: { id: matchId }, data: { status: 'pago', paidAt: item.bankDate, amountPaid: item.bankAmount } });
          else await prisma.accountsReceivable.update({ where: { id: matchId }, data: { status: 'recebido', receivedAt: item.bankDate, amountReceived: item.bankAmount } });
        }
        updated++;
      }
    }
    return NextResponse.json({ summary: { total: pendingItems.length, updated } });
  }

  // ── auto-match (new import) ────────────────────────────────────────────────
  if (action === 'auto-match') {
    const bankEntries = body.bankEntries as Array<{ reference: string; date: string; amount: number; type: string }>;
    if (!bankEntries?.length) return NextResponse.json({ error: 'Nenhuma entrada bancária fornecida' }, { status: 400 });

    const bankConnectionId: string | null = body.bankConnectionId || null;
    const bankName: string = body.bankName || 'Extrato PJ';
    // PJReconciliation.importBatchId não tem FK — agrupador legado (fluxo CSV antigo)
    const importBatchId = randomUUID();

    const [reconP2, reconR2, allPay2, allRec2] = await Promise.all([
      prisma.pJReconciliation.findMany({ where: { companyId, status: 'RECONCILED', type: 'PAYABLE' }, select: { accountId: true } }),
      prisma.pJReconciliation.findMany({ where: { companyId, status: 'RECONCILED', type: 'RECEIVABLE' }, select: { accountId: true } }),
      prisma.accountsPayable.findMany({ where: { companyId }, select: { id: true, description: true, amount: true, dueDate: true, supplierName: true, status: true, paidAt: true } }),
      prisma.accountsReceivable.findMany({ where: { companyId }, select: { id: true, description: true, amount: true, dueDate: true, customerName: true, status: true, receivedAt: true } }),
    ]);
    const reconPayIds2 = new Set(reconP2.map(i => i.accountId).filter(Boolean));
    const reconRecIds2 = new Set(reconR2.map(i => i.accountId).filter(Boolean));
    const payables = allPay2.filter(p => !reconPayIds2.has(p.id)).map(p => ({ ...p, paidDate: p.paidAt }));
    const receivables = allRec2.filter(r => !reconRecIds2.has(r.id)).map(r => ({ ...r, paidDate: r.receivedAt }));

    const usedPayableIds = new Set<string>();
    const usedReceivableIds = new Set<string>();
    const results: any[] = [];

    for (const entry of bankEntries) {
      const pool = entry.type === 'DEBIT' ? payables : receivables;
      const matchType = entry.type === 'DEBIT' ? 'PAYABLE' : 'RECEIVABLE';
      const usedIds = entry.type === 'DEBIT' ? usedPayableIds : usedReceivableIds;
      const absAmount = Math.abs(entry.amount);
      const bankDate = new Date(entry.date);

      // Dedup: pula se já existe registro idêntico para esta empresa
      // Checa por (date + amount + reference). Se FITID disponível, também
      // verifica se algum registro anterior tem esse FITID na referência.
      const dedupWhere: any = {
        companyId,
        bankDate,
        bankAmount: absAmount,
      };
      const entryFitid = (entry as any).fitid as string | undefined;
      if (entryFitid) {
        dedupWhere.OR = [
          { bankReference: entry.reference },
          { bankReference: { contains: entryFitid } },
        ];
      } else {
        dedupWhere.bankReference = entry.reference;
      }
      const existingEntry = await prisma.pJReconciliation.findFirst({
        where: dedupWhere,
        select: { id: true },
      });
      if (existingEntry) continue;

      const best = findBestMatch(absAmount, bankDate, entry.reference, pool, usedIds);

      let matchStatus = 'BANK_ONLY';
      let divergenceNote: string | null = null;
      let matchId: string | null = null;

      if (best) {
        const cls = classifyMatch(best.scored, absAmount, bankDate, best.record);
        matchStatus = cls.status;
        divergenceNote = cls.note;
        matchId = best.record.id;
        if (matchStatus === 'RECONCILED') usedIds.add(best.record.id);
      }

      const recon = await prisma.pJReconciliation.create({
        data: {
          companyId,
          type: matchType,
          accountId: matchId || 'N/A',
          bankConnectionId,
          bankName,
          importBatchId,
          bankReference: entry.reference,
          bankDate,
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
              details: { bankRef: entry.reference, matchedId: matchId },
              performedBy: session.user.id,
            },
          },
        },
        include: { logs: true },
      });

      if (matchStatus === 'RECONCILED' && matchId) {
        if (matchType === 'PAYABLE') {
          await prisma.accountsPayable.update({ where: { id: matchId }, data: { status: 'pago', paidAt: bankDate, amountPaid: absAmount } });
        } else {
          // Baixa via máquina de estados (mantém billingStatus consistente)
          const { transitionBillingStatus } = await import('@/lib/billing-state');
          try {
            await transitionBillingStatus(matchId, 'QUITADA', {
              userId: session.user.id,
              companyId,
              data: { receivedAt: bankDate, amountReceived: absAmount },
              notes: 'Conciliação PJ (CSV legado)',
            });
            await transitionBillingStatus(matchId, 'CONCILIADA', { userId: session.user.id, companyId });
          } catch {
            // fallback legado (recebível já quitado/conciliado)
            await prisma.accountsReceivable.update({ where: { id: matchId }, data: { status: 'recebido', receivedAt: bankDate, amountReceived: absAmount } }).catch(() => {});
          }
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
        logs: { create: { action: 'MANUAL_UPDATE', previousStatus: existing.status, newStatus, details: { notes }, performedBy: session.user.id } },
      },
      include: { logs: true },
    });
    return NextResponse.json(updated);
  }

  if (action === 'fetch-candidates') {
    const { type } = body;
    if (!type) return NextResponse.json({ error: 'Tipo obrigatório' }, { status: 400 });
    const reconciledIds = (await prisma.pJReconciliation.findMany({
      where: { companyId, status: 'RECONCILED', type },
      select: { accountId: true },
    })).map(i => i.accountId).filter((id): id is string => !!id && id !== 'N/A');

    const where: any = { companyId };
    if (reconciledIds.length) where.NOT = { id: { in: reconciledIds } };

    if (type === 'PAYABLE') {
      const candidates = await prisma.accountsPayable.findMany({
        where,
        select: { id: true, description: true, amount: true, dueDate: true, supplierName: true, status: true },
        orderBy: { dueDate: 'desc' },
        take: 300,
      });
      return NextResponse.json({ candidates });
    } else {
      const candidates = await prisma.accountsReceivable.findMany({
        where,
        select: { id: true, description: true, amount: true, dueDate: true, customerName: true, status: true },
        orderBy: { dueDate: 'desc' },
        take: 300,
      });
      return NextResponse.json({ candidates });
    }
  }

  if (action === 'create-and-link') {
    const { reconciliationId, description, amount, dueDate } = body;
    if (!reconciliationId || !description || !amount || !dueDate) return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    const rec = await prisma.pJReconciliation.findFirst({ where: { id: reconciliationId, companyId } });
    if (!rec) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    let accountId: string;
    if (rec.type === 'PAYABLE') {
      const newAcc = await prisma.accountsPayable.create({
        data: { companyId, description, amount: parseFloat(amount), dueDate: new Date(dueDate), status: 'pago', paidAt: rec.bankDate, amountPaid: rec.bankAmount || parseFloat(amount) },
      });
      accountId = newAcc.id;
    } else {
      const newAcc = await prisma.accountsReceivable.create({
        data: { companyId, description, amount: parseFloat(amount), dueDate: new Date(dueDate), status: 'recebido', receivedAt: rec.bankDate, amountReceived: rec.bankAmount || parseFloat(amount) },
      });
      accountId = newAcc.id;
    }
    const updated = await prisma.pJReconciliation.update({
      where: { id: reconciliationId },
      data: { accountId, status: 'RECONCILED', matchMethod: 'manual', reconciledAt: new Date(), reconciledBy: session.user.id,
        logs: { create: { action: 'CREATE_AND_LINK', previousStatus: rec.status, newStatus: 'RECONCILED', details: { createdAccountId: accountId }, performedBy: session.user.id } } },
      include: { logs: true },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}

// ── DELETE (excluir lote de importação) ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);

  // New batches: delete by importBatchId UUID
  const importBatchId = searchParams.get('importBatchId');
  if (importBatchId) {
    const { count } = await prisma.pJReconciliation.deleteMany({
      where: { importBatchId, companyId },
    });
    return NextResponse.json({ deleted: count });
  }

  // Legacy batches (no importBatchId): delete by createdAt minute window
  const createdAtMinute = searchParams.get('createdAtMinute');
  if (createdAtMinute) {
    const base = new Date(createdAtMinute);
    if (isNaN(base.getTime())) return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    const start = new Date(base);
    start.setSeconds(0, 0);
    const end = new Date(base);
    end.setSeconds(59, 999);
    const { count } = await prisma.pJReconciliation.deleteMany({
      where: { companyId, importBatchId: null, createdAt: { gte: start, lte: end } },
    });
    return NextResponse.json({ deleted: count });
  }

  return NextResponse.json({ error: 'importBatchId ou createdAtMinute obrigatório' }, { status: 400 });
}
