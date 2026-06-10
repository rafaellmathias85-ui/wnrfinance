import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runReconciliation } from '@/lib/reconciliation/engine';

export const dynamic = 'force-dynamic';

// GET: reconciliation dashboard data
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const bankId = req.nextUrl.searchParams.get('bankId');
  const statusFilter = req.nextUrl.searchParams.get('status');
  const unlinked = req.nextUrl.searchParams.get('unlinked');
  const search = req.nextUrl.searchParams.get('search');

  // === UNLINKED: Return expenses/incomes not linked to any reconciliation ===
  if (unlinked === 'true') {
    const startDate = req.nextUrl.searchParams.get('startDate');
    const endDate = req.nextUrl.searchParams.get('endDate');

    // Get all linked amounts grouped by internalId + internalType (for fractional reconciliation)
    const linkedReconciliations = await prisma.reconciliation.findMany({
      where: { userId: session.user.id, internalId: { not: null }, status: { not: 'PENDING' } },
      select: { internalId: true, internalType: true, bankTransaction: { select: { amount: true } } },
    });

    // Build map of linked amounts per internal entry
    const linkedAmounts: Record<string, number> = {};
    for (const r of linkedReconciliations) {
      if (!r.internalId) continue;
      const key = `${r.internalType}:${r.internalId}`;
      linkedAmounts[key] = (linkedAmounts[key] || 0) + Math.abs(r.bankTransaction?.amount || 0);
    }

    const expWhere: any = { userId: session.user.id, companyId: null };
    const incWhere: any = { userId: session.user.id, companyId: null };
    if (search) {
      expWhere.description = { contains: search, mode: 'insensitive' };
      incWhere.description = { contains: search, mode: 'insensitive' };
    }
    // Date filter
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
      expWhere.date = dateFilter;
      incWhere.date = dateFilter;
    }

    const [expenses, incomes] = await Promise.all([
      prisma.expense.findMany({
        where: expWhere,
        select: { id: true, description: true, amount: true, date: true, category: true, status: true },
        orderBy: { date: 'desc' },
        take: 150,
      }),
      prisma.income.findMany({
        where: incWhere,
        select: { id: true, description: true, amount: true, date: true, type: true, status: true },
        orderBy: { date: 'desc' },
        take: 150,
      }),
    ]);

    // Enrich with linked amounts and filter out fully reconciled
    const enrichedExpenses = expenses.map((e: any) => {
      const key = `expense:${e.id}`;
      const alreadyLinked = linkedAmounts[key] || 0;
      const remaining = e.amount - alreadyLinked;
      return { ...e, alreadyLinked, remaining, isPartial: alreadyLinked > 0 && remaining > 0.01 };
    }).filter((e: any) => e.remaining > 0.01); // Show items with remaining amount

    const enrichedIncomes = incomes.map((i: any) => {
      const key = `income:${i.id}`;
      const alreadyLinked = linkedAmounts[key] || 0;
      const remaining = i.amount - alreadyLinked;
      return { ...i, alreadyLinked, remaining, isPartial: alreadyLinked > 0 && remaining > 0.01 };
    }).filter((i: any) => i.remaining > 0.01); // Show items with remaining amount

    return NextResponse.json({ expenses: enrichedExpenses, incomes: enrichedIncomes });
  }

  // PF-only: only reconciliations whose bank transaction has no companyId
  const where: any = { userId: session.user.id, bankTransaction: { companyId: null } };
  if (bankId) where.bankTransaction = { companyId: null, bankConnectionId: bankId };

  const [stats, items] = await Promise.all([
    prisma.reconciliation.groupBy({
      by: ['status'],
      where: { ...where },
      _count: true,
    }),
    prisma.reconciliation.findMany({
      where: { ...where, ...(statusFilter ? { status: statusFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        bankTransaction: {
          select: { id: true, description: true, amount: true, date: true, type: true, importBatchId: true, createdAt: true, bankConnection: { select: { bankName: true } } },
        },
        logs: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    }),
  ]);

  // Enrich with internal transaction data
  const enriched = await Promise.all(
    items.map(async (item: any) => {
      let internal = null;
      if (item.internalId && item.internalType) {
        if (item.internalType === 'expense') {
          internal = await prisma.expense.findUnique({ where: { id: item.internalId }, select: { id: true, description: true, amount: true, date: true, category: true } });
        } else {
          internal = await prisma.income.findUnique({ where: { id: item.internalId }, select: { id: true, description: true, amount: true, date: true, type: true } });
        }
      }
      return { ...item, internal };
    })
  );

  const summary = {
    total: stats.reduce((a: number, s: any) => a + s._count, 0),
    reconciled: stats.find((s: any) => s.status === 'RECONCILED')?._count || 0,
    divergent: stats.find((s: any) => s.status === 'DIVERGENT')?._count || 0,
    bankOnly: stats.find((s: any) => s.status === 'BANK_ONLY')?._count || 0,
    suggested: stats.find((s: any) => s.status === 'SUGGESTED')?._count || 0,
    pending: stats.find((s: any) => s.status === 'PENDING')?._count || 0,
    ignored: stats.find((s: any) => s.status === 'IGNORED')?._count || 0,
  };

  // Group items by importBatchId for batch view
  const batches: Record<string, any> = {};
  for (const item of enriched) {
    const batchKey = item.bankTransaction?.importBatchId || 'sem_lote';
    if (!batches[batchKey]) {
      const firstTx = item.bankTransaction;
      batches[batchKey] = {
        id: batchKey,
        bankName: firstTx?.bankConnection?.bankName || 'Banco',
        importedAt: firstTx?.createdAt || item.createdAt,
        items: [],
        stats: { total: 0, reconciled: 0, divergent: 0, bankOnly: 0, suggested: 0, pending: 0, ignored: 0 },
        dateRange: { min: firstTx?.date, max: firstTx?.date },
      };
    }
    batches[batchKey].items.push(item);
    batches[batchKey].stats.total++;
    const st = item.status?.toLowerCase();
    if (st === 'reconciled') batches[batchKey].stats.reconciled++;
    else if (st === 'divergent') batches[batchKey].stats.divergent++;
    else if (st === 'bank_only') batches[batchKey].stats.bankOnly++;
    else if (st === 'suggested') batches[batchKey].stats.suggested++;
    else if (st === 'pending') batches[batchKey].stats.pending++;
    else if (st === 'ignored') batches[batchKey].stats.ignored++;
    // Update date range
    const txDate = item.bankTransaction?.date;
    if (txDate) {
      if (!batches[batchKey].dateRange.min || txDate < batches[batchKey].dateRange.min) batches[batchKey].dateRange.min = txDate;
      if (!batches[batchKey].dateRange.max || txDate > batches[batchKey].dateRange.max) batches[batchKey].dateRange.max = txDate;
    }
  }
  const batchList = Object.values(batches).sort((a: any, b: any) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());

  return NextResponse.json({ summary, items: enriched, batches: batchList });
}

// POST: run reconciliation engine
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { bankConnectionId } = await req.json().catch(() => ({}));

  try {
    const result = await runReconciliation(session.user.id, bankConnectionId);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('Reconciliation error:', e);
    return NextResponse.json({ error: e.message || 'Erro na conciliação' }, { status: 500 });
  }
}

// PATCH: manual reconciliation action
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { reconciliationId, action, internalId, internalType, notes, editData, ids, batchAction, entryData, linkId, linkType } = body;

    // === BATCH ACTION ===
    if (action === 'batch') {
      if (!Array.isArray(ids) || !ids.length || !batchAction) {
        return NextResponse.json({ error: 'ids e batchAction obrigatórios' }, { status: 400 });
      }
      const recons = await prisma.reconciliation.findMany({
        where: { id: { in: ids }, userId: session.user.id },
      });
      let processed = 0;
      for (const recon of recons) {
        const prev = recon.status;
        if (batchAction === 'approve' && recon.internalId && recon.internalType) {
          await prisma.$transaction([
            prisma.reconciliation.update({
              where: { id: recon.id },
              data: {
                status: 'RECONCILED', matchMethod: 'manual_batch', resolvedAt: new Date(), resolvedBy: session.user.id,
                logs: { create: { action: 'batch_approved', previousStatus: prev, newStatus: 'RECONCILED', performedBy: session.user.id, details: {} } },
              },
            }),
            prisma.bankTransaction.update({ where: { id: recon.bankTransactionId }, data: { status: 'RECONCILED' } }),
          ]);
          processed++;
        } else if (batchAction === 'ignore') {
          await prisma.$transaction([
            prisma.reconciliation.update({
              where: { id: recon.id },
              data: {
                status: 'IGNORED', resolvedAt: new Date(), resolvedBy: session.user.id,
                logs: { create: { action: 'batch_ignored', previousStatus: prev, newStatus: 'IGNORED', performedBy: session.user.id, details: {} } },
              },
            }),
            prisma.bankTransaction.update({ where: { id: recon.bankTransactionId }, data: { status: 'IGNORED' } }),
          ]);
          processed++;
        } else if (batchAction === 'reopen') {
          await prisma.$transaction([
            prisma.reconciliation.update({
              where: { id: recon.id },
              data: {
                status: 'PENDING', resolvedAt: null, resolvedBy: null,
                logs: { create: { action: 'batch_reopened', previousStatus: prev, newStatus: 'PENDING', performedBy: session.user.id, details: {} } },
              },
            }),
            prisma.bankTransaction.update({ where: { id: recon.bankTransactionId }, data: { status: 'PENDING' } }),
          ]);
          processed++;
        }
      }
      return NextResponse.json({ success: true, processed, total: ids.length });
    }

    // === SINGLE ACTIONS ===
    if (!reconciliationId || !action) {
      return NextResponse.json({ error: 'reconciliationId e action obrigatórios' }, { status: 400 });
    }

    const recon = await prisma.reconciliation.findFirst({
      where: { id: reconciliationId, userId: session.user.id },
      include: { bankTransaction: { select: { amount: true, id: true } } },
    });

    if (!recon) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const previousStatus = recon.status;
    let newStatus = recon.status;

    if (action === 'edit') {
      if (!recon.internalId || !recon.internalType) {
        return NextResponse.json({ error: 'Sem lançamento interno para editar' }, { status: 400 });
      }
      const updatePayload: any = {};
      if (editData?.amount !== undefined) updatePayload.amount = parseFloat(editData.amount);
      if (editData?.description !== undefined) updatePayload.description = editData.description;
      if (editData?.date !== undefined) updatePayload.date = new Date(editData.date);

      if (Object.keys(updatePayload).length === 0) {
        return NextResponse.json({ error: 'Nenhum campo para editar' }, { status: 400 });
      }

      const model = recon.internalType === 'expense' ? prisma.expense : prisma.income;
      await (model as any).update({ where: { id: recon.internalId }, data: updatePayload });

      await prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          notes: `Editado: ${JSON.stringify(updatePayload)}`,
          logs: {
            create: {
              action: 'edited',
              previousStatus,
              newStatus: previousStatus,
              performedBy: session.user.id,
              details: { editData: updatePayload },
            },
          },
        },
      });

      return NextResponse.json({ success: true, edited: updatePayload });
    }

    // === LINK_ENTRY: Link existing expense/income to BANK_ONLY reconciliation ===
    if (action === 'link_entry') {
      const { linkId, linkType } = body;
      if (!linkId || !linkType) return NextResponse.json({ error: 'linkId e linkType obrigatórios' }, { status: 400 });

      // Verify the entry exists
      let linkedEntry: any = null;
      if (linkType === 'expense') {
        linkedEntry = await prisma.expense.findUnique({ where: { id: linkId }, select: { id: true, description: true, amount: true } });
      } else {
        linkedEntry = await prisma.income.findUnique({ where: { id: linkId }, select: { id: true, description: true, amount: true } });
      }
      if (!linkedEntry) return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 });

      // Fractional reconciliation: allow multiple bank transactions to link to the same entry
      // Check total already linked to this entry
      const existingLinks = await prisma.reconciliation.findMany({
        where: { internalId: linkId, internalType: linkType, userId: session.user.id, id: { not: reconciliationId }, status: 'RECONCILED' },
        select: { bankTransaction: { select: { amount: true } } },
      });
      const alreadyLinkedAmount = existingLinks.reduce((sum: number, r: any) => sum + Math.abs(r.bankTransaction?.amount || 0), 0);
      const bankTxAmount = Math.abs(recon.bankTransaction?.amount || 0);
      const totalAfterLink = alreadyLinkedAmount + bankTxAmount;
      const isFractional = existingLinks.length > 0;

      await prisma.$transaction([
        prisma.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: 'RECONCILED',
            internalId: linkId,
            internalType: linkType,
            matchMethod: isFractional ? 'manual_fractional' : 'manual_linked',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            notes: isFractional
              ? `Vinculado (fracionado) a ${linkType === 'expense' ? 'despesa' : 'receita'}: ${linkedEntry.description} (${alreadyLinkedAmount.toFixed(2)} + ${bankTxAmount.toFixed(2)} de ${linkedEntry.amount.toFixed(2)})`
              : `Vinculado a ${linkType === 'expense' ? 'despesa' : 'receita'}: ${linkedEntry.description}`,
            logs: {
              create: {
                action: isFractional ? 'fractional_linked' : 'linked',
                previousStatus,
                newStatus: 'RECONCILED',
                performedBy: session.user.id,
                details: { linkId, linkType, description: linkedEntry.description, amount: linkedEntry.amount, isFractional, alreadyLinkedAmount, totalAfterLink },
              },
            },
          },
        }),
        prisma.bankTransaction.update({
          where: { id: recon.bankTransactionId },
          data: { status: 'RECONCILED' },
        }),
      ]);

      return NextResponse.json({ success: true, previousStatus, newStatus: 'RECONCILED', linkedEntry });
    }

    // === CREATE_ENTRY: Create expense/income from BANK_ONLY and auto-reconcile ===
    if (action === 'create_entry') {
      if (!entryData) return NextResponse.json({ error: 'entryData obrigatório' }, { status: 400 });

      const bankTx = await prisma.bankTransaction.findUnique({ where: { id: recon.bankTransactionId } });
      if (!bankTx) return NextResponse.json({ error: 'Transação bancária não encontrada' }, { status: 404 });

      const amount = parseFloat(entryData.amount);
      const date = new Date(entryData.date);
      const description = entryData.description || bankTx.description || '';
      const category = entryData.category || 'Outros';

      // Check if PJ context
      const isPJ = (session.user as any).defaultEnv === 'pj';
      const companyId = (session.user as any).activeCompanyId;

      let createdId: string;
      let createdType: string;

      if (entryData.type === 'expense') {
        if (isPJ && companyId) {
          // Create AccountsPayable for PJ
          const ap = await prisma.accountsPayable.create({
            data: {
              companyId,
              description,
              amount,
              dueDate: date,
              status: 'pago',
              paidAt: date,
              amountPaid: amount,
              supplierName: description,
            },
          });
          createdId = ap.id;
          createdType = 'expense'; // generic type for reconciliation
        } else {
          // Create Expense for PF
          const exp = await prisma.expense.create({
            data: {
              userId: session.user.id,
              description,
              amount,
              date,
              category,
              paymentMethod: 'PIX',
              status: 'pago',
              bankConnectionId: bankTx.bankConnectionId,
            },
          });
          createdId = exp.id;
          createdType = 'expense';
        }
      } else {
        if (isPJ && companyId) {
          // Create AccountsReceivable for PJ
          const ar = await prisma.accountsReceivable.create({
            data: {
              companyId,
              description,
              amount,
              dueDate: date,
              status: 'recebido',
              receivedAt: date,
              amountReceived: amount,
              customerName: description,
            },
          });
          createdId = ar.id;
          createdType = 'income';
        } else {
          // Create Income for PF
          const inc = await prisma.income.create({
            data: {
              userId: session.user.id,
              description,
              amount,
              date,
              type: category,
              status: 'recebido',
              bankConnectionId: bankTx.bankConnectionId,
            },
          });
          createdId = inc.id;
          createdType = 'income';
        }
      }

      // Auto-reconcile
      await prisma.$transaction([
        prisma.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: 'RECONCILED',
            internalId: createdId,
            internalType: createdType,
            matchMethod: 'manual_created',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            notes: `Lançamento criado: ${createdType === 'expense' ? 'Despesa' : 'Receita'} - ${description}`,
            logs: {
              create: {
                action: 'entry_created',
                previousStatus: previousStatus,
                newStatus: 'RECONCILED',
                performedBy: session.user.id,
                details: { createdId, createdType, amount, description },
              },
            },
          },
        }),
        prisma.bankTransaction.update({
          where: { id: recon.bankTransactionId },
          data: { status: 'RECONCILED' },
        }),
      ]);

      return NextResponse.json({ success: true, createdId, createdType, previousStatus, newStatus: 'RECONCILED' });
    }

    // === ACCEPT_BANK_VALUE: Update internal to match bank amount and reconcile ===
    if (action === 'accept_bank_value') {
      if (!recon.internalId || !recon.internalType) {
        return NextResponse.json({ error: 'Sem lançamento interno para ajustar' }, { status: 400 });
      }

      const bankTx = await prisma.bankTransaction.findUnique({ where: { id: recon.bankTransactionId } });
      if (!bankTx) return NextResponse.json({ error: 'Transação bancária não encontrada' }, { status: 404 });

      const bankAmount = Math.abs(bankTx.amount);
      const model = recon.internalType === 'expense' ? prisma.expense : prisma.income;
      const oldRecord = await (model as any).findUnique({ where: { id: recon.internalId } });
      const oldAmount = oldRecord?.amount || 0;

      // Update internal amount to match bank
      await (model as any).update({
        where: { id: recon.internalId },
        data: { amount: bankAmount },
      });

      // Auto-reconcile
      await prisma.$transaction([
        prisma.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: 'RECONCILED',
            matchMethod: 'manual_adjusted',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            notes: `Valor ajustado: ${oldAmount} → ${bankAmount} (aceito valor do banco)`,
            logs: {
              create: {
                action: 'bank_value_accepted',
                previousStatus,
                newStatus: 'RECONCILED',
                performedBy: session.user.id,
                details: { oldAmount, newAmount: bankAmount, bankTransactionId: bankTx.id },
              },
            },
          },
        }),
        prisma.bankTransaction.update({
          where: { id: recon.bankTransactionId },
          data: { status: 'RECONCILED' },
        }),
      ]);

      return NextResponse.json({ success: true, previousStatus, newStatus: 'RECONCILED', adjustedFrom: oldAmount, adjustedTo: bankAmount });
    }

    if (action === 'approve') {
      // Manual approve - mark as reconciled
      if (!internalId || !internalType) {
        return NextResponse.json({ error: 'internalId e internalType obrigatórios para aprovar' }, { status: 400 });
      }
      newStatus = 'RECONCILED';
      await prisma.$transaction([
        prisma.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: 'RECONCILED',
            internalId,
            internalType,
            matchMethod: 'manual',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            notes,
            logs: {
              create: {
                action: 'manual_matched',
                previousStatus,
                newStatus: 'RECONCILED',
                performedBy: session.user.id,
                details: { internalId, internalType, notes },
              },
            },
          },
        }),
        prisma.bankTransaction.update({
          where: { id: recon.bankTransactionId },
          data: { status: 'RECONCILED' },
        }),
      ]);
    } else if (action === 'ignore') {
      newStatus = 'IGNORED';
      await prisma.$transaction([
        prisma.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: 'IGNORED',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            notes,
            logs: {
              create: {
                action: 'ignored',
                previousStatus,
                newStatus: 'IGNORED',
                performedBy: session.user.id,
                details: { notes },
              },
            },
          },
        }),
        prisma.bankTransaction.update({
          where: { id: recon.bankTransactionId },
          data: { status: 'IGNORED' },
        }),
      ]);
    } else if (action === 'unlink' || action === 'reopen') {
      // Unlink clears the internal reference so user can re-link to the correct entry
      const wasLinked = recon.internalId != null;
      newStatus = 'BANK_ONLY';
      await prisma.$transaction([
        prisma.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: 'BANK_ONLY',
            internalId: null,
            internalType: null,
            matchScore: null,
            matchMethod: null,
            divergenceReason: null,
            resolvedAt: null,
            resolvedBy: null,
            notes: action === 'unlink' ? 'Desvinculado para reconciliar com outro lançamento' : null,
            logs: {
              create: {
                action: action === 'unlink' ? 'unlinked' : 'reopened',
                previousStatus,
                newStatus: 'BANK_ONLY',
                performedBy: session.user.id,
                details: { reason: action === 'unlink' ? 'Desvinculado manualmente' : 'Reaberto para revisão', wasLinked },
              },
            },
          },
        }),
        prisma.bankTransaction.update({
          where: { id: recon.bankTransactionId },
          data: { status: 'BANK_ONLY' },
        }),
      ]);
    } else if (action === 'force') {
      // Forced reconciliation - mark as reconciled without a matching internal record
      const reason = notes || 'Conciliacao forcada manualmente';
      newStatus = 'RECONCILED';
      await prisma.$transaction([
        prisma.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: 'RECONCILED',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            notes: reason,
            logs: {
              create: {
                action: 'forced',
                previousStatus,
                newStatus: 'RECONCILED',
                performedBy: session.user.id,
                details: { reason, forced: true },
              },
            },
          },
        }),
        prisma.bankTransaction.update({
          where: { id: recon.bankTransactionId },
          data: { status: 'RECONCILED' },
        }),
      ]);
    }

    return NextResponse.json({ success: true, previousStatus, newStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erro' }, { status: 500 });
  }
}
