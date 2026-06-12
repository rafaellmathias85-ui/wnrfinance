export const dynamic = 'force-dynamic';

// Conciliação V2 — detalhe do lote (tela duas colunas, paridade BomControle)
// GET  /api/reconciliation/batches/[batchId]            → pares extrato × candidatos
// POST /api/reconciliation/batches/[batchId]            → ações:
//   { action: 'match',  transactionId, internalType, internalId }   vincular manual
//   { action: 'unmatch', transactionId }                            desfazer vínculo/sugestão
//   { action: 'ignore', transactionId }                             ignorar linha do extrato
//   { action: 'confirm' }                                           confirma todas as sugestões do lote
//   { action: 'create-entry', transactionId, payload }              cria lançamento a partir do extrato (botão "+")

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit-log';
import { importBatchService } from '@/src/modules/reconciliation/import-batch.service';
import { transitionBillingStatus } from '@/lib/billing-state';

async function getBatchForUser(batchId: string, userId: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, userId } });
  if (!batch) return null;
  return batch;
}

export async function GET(req: NextRequest, { params }: { params: { batchId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const batch = await getBatchForUser(params.batchId, session.user.id);
    if (!batch) return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status'); // PENDING, SUGGESTED, RECONCILED, IGNORED
    const typeFilter = searchParams.get('type'); // credit, debit
    const search = searchParams.get('q');

    const where: any = { importBatchId: batch.id };
    if (statusFilter) where.status = statusFilter;
    if (typeFilter) where.type = typeFilter;
    if (search) where.description = { contains: search, mode: 'insensitive' };

    const transactions = await prisma.bankTransaction.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { reconciliation: true },
    });

    // Resolve os lançamentos internos vinculados/sugeridos
    const receivableIds: string[] = [];
    const payableIds: string[] = [];
    const expenseIds: string[] = [];
    const incomeIds: string[] = [];
    for (const tx of transactions) {
      const r = tx.reconciliation;
      if (!r?.internalId) continue;
      if (batch.companyId) {
        if (r.internalType === 'income') receivableIds.push(r.internalId);
        else if (r.internalType === 'expense') payableIds.push(r.internalId);
      } else {
        if (r.internalType === 'income') incomeIds.push(r.internalId);
        else if (r.internalType === 'expense') expenseIds.push(r.internalId);
      }
    }

    const [receivables, payables, incomes, expenses] = await Promise.all([
      receivableIds.length
        ? prisma.accountsReceivable.findMany({
            where: { id: { in: receivableIds } },
            select: { id: true, description: true, customerName: true, amount: true, dueDate: true, billingStatus: true, isRecurring: true, recurrenceId: true },
          })
        : [],
      payableIds.length
        ? prisma.accountsPayable.findMany({
            where: { id: { in: payableIds } },
            select: { id: true, description: true, supplierName: true, amount: true, dueDate: true, status: true },
          })
        : [],
      incomeIds.length
        ? prisma.income.findMany({ where: { id: { in: incomeIds } }, select: { id: true, description: true, amount: true, date: true } })
        : [],
      expenseIds.length
        ? prisma.expense.findMany({ where: { id: { in: expenseIds } }, select: { id: true, description: true, amount: true, date: true } })
        : [],
    ]);

    const internalMap = new Map<string, any>();
    receivables.forEach((r) =>
      internalMap.set(r.id, {
        id: r.id,
        kind: 'receivable',
        label: `Recebimento DO(A) ${r.customerName || r.description} NO VALOR R$ ${r.amount.toFixed(2)}${r.isRecurring ? ' (PARCELA RECORRENTE)' : ''}`,
        amount: r.amount,
        date: r.dueDate,
        status: r.billingStatus,
      }),
    );
    payables.forEach((p) =>
      internalMap.set(p.id, {
        id: p.id,
        kind: 'payable',
        label: `Pagamento DO(A) ${p.supplierName || p.description} NO VALOR R$ ${p.amount.toFixed(2)}`,
        amount: p.amount,
        date: p.dueDate,
        status: p.status,
      }),
    );
    incomes.forEach((i) => internalMap.set(i.id, { id: i.id, kind: 'income', label: i.description, amount: i.amount, date: i.date }));
    expenses.forEach((e) => internalMap.set(e.id, { id: e.id, kind: 'expense', label: e.description, amount: e.amount, date: e.date }));

    return NextResponse.json({
      batch,
      pairs: transactions.map((tx) => ({
        transaction: {
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          date: tx.date,
          status: tx.status,
          category: tx.category,
          documentNumber: tx.documentNumber,
          payerName: tx.payerName,
        },
        reconciliation: tx.reconciliation
          ? {
              id: tx.reconciliation.id,
              status: tx.reconciliation.status,
              matchScore: tx.reconciliation.matchScore,
              matchMethod: tx.reconciliation.matchMethod,
              internal: tx.reconciliation.internalId ? internalMap.get(tx.reconciliation.internalId) || null : null,
            }
          : null,
      })),
    });
  } catch (error: any) {
    console.error('GET batch detail error:', error);
    return NextResponse.json({ error: 'Erro ao carregar lote' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { batchId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const batch = await getBatchForUser(params.batchId, session.user.id);
    if (!batch) return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });

    const body = await req.json();
    const action = body.action as string;

    // ── Vincular manualmente ─────────────────────────────────────────────
    if (action === 'match') {
      const { transactionId, internalType, internalId } = body;
      if (!transactionId || !internalType || !internalId) {
        return NextResponse.json({ error: 'transactionId, internalType e internalId são obrigatórios' }, { status: 400 });
      }
      const tx = await prisma.bankTransaction.findFirst({
        where: { id: transactionId, importBatchId: batch.id },
      });
      if (!tx) return NextResponse.json({ error: 'Transação não pertence ao lote' }, { status: 404 });

      await prisma.$transaction(async (trx) => {
        await trx.reconciliation.upsert({
          where: { bankTransactionId: tx.id },
          update: {
            internalType,
            internalId,
            status: 'RECONCILED',
            matchMethod: 'manual',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            logs: { create: { action: 'manual_link', previousStatus: 'PENDING', newStatus: 'RECONCILED', details: { internalId, internalType } } },
          },
          create: {
            userId: session.user.id,
            bankTransactionId: tx.id,
            internalType,
            internalId,
            status: 'RECONCILED',
            matchMethod: 'manual',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            logs: { create: { action: 'manual_link', previousStatus: 'PENDING', newStatus: 'RECONCILED', details: { internalId, internalType } } },
          },
        });
        await trx.bankTransaction.update({ where: { id: tx.id }, data: { status: 'RECONCILED' } });
      });

      // Receita PJ → quitar + conciliar via máquina de estados
      if (internalType === 'income' && batch.companyId) {
        try {
          const rec = await prisma.accountsReceivable.findUnique({ where: { id: internalId }, select: { billingStatus: true } });
          if (rec && (rec.billingStatus === 'FATURADA' || rec.billingStatus === 'VENCIDA')) {
            await transitionBillingStatus(internalId, 'QUITADA', {
              userId: session.user.id,
              companyId: batch.companyId,
              data: { receivedAt: tx.date, amountReceived: tx.amount },
              notes: 'Vínculo manual na conciliação',
            });
          }
          const after = await prisma.accountsReceivable.findUnique({ where: { id: internalId }, select: { billingStatus: true } });
          if (after?.billingStatus === 'QUITADA') {
            await transitionBillingStatus(internalId, 'CONCILIADA', { userId: session.user.id, companyId: batch.companyId });
          }
        } catch (e: any) {
          console.error('match transition error:', e?.message);
        }
      }

      await importBatchService.refreshCounters(batch.id);
      return NextResponse.json({ ok: true });
    }

    // ── Desfazer vínculo / sugestão ──────────────────────────────────────
    if (action === 'unmatch') {
      const { transactionId } = body;
      const tx = await prisma.bankTransaction.findFirst({ where: { id: transactionId, importBatchId: batch.id }, include: { reconciliation: true } });
      if (!tx) return NextResponse.json({ error: 'Transação não pertence ao lote' }, { status: 404 });

      await prisma.$transaction(async (trx) => {
        if (tx.reconciliation) {
          await trx.reconciliation.update({
            where: { id: tx.reconciliation.id },
            data: {
              internalType: null,
              internalId: null,
              status: 'PENDING',
              matchScore: null,
              resolvedAt: null,
              logs: { create: { action: 'unmatch', previousStatus: tx.reconciliation.status, newStatus: 'PENDING', details: {} } },
            },
          });
        }
        await trx.bankTransaction.update({ where: { id: tx.id }, data: { status: 'PENDING' } });
      });

      await importBatchService.refreshCounters(batch.id);
      return NextResponse.json({ ok: true });
    }

    // ── Ignorar linha do extrato ─────────────────────────────────────────
    if (action === 'ignore') {
      const { transactionId } = body;
      const tx = await prisma.bankTransaction.findFirst({ where: { id: transactionId, importBatchId: batch.id } });
      if (!tx) return NextResponse.json({ error: 'Transação não pertence ao lote' }, { status: 404 });
      await prisma.bankTransaction.update({ where: { id: tx.id }, data: { status: 'IGNORED' } });
      await importBatchService.refreshCounters(batch.id);
      return NextResponse.json({ ok: true });
    }

    // ── Confirmar lote (todas as sugestões aceitas) ─────────────────────
    if (action === 'confirm') {
      const suggested = await prisma.bankTransaction.findMany({
        where: { importBatchId: batch.id, status: 'SUGGESTED' },
        include: { reconciliation: true },
      });

      let confirmed = 0;
      for (const tx of suggested) {
        if (!tx.reconciliation?.internalId) continue;
        await prisma.$transaction(async (trx) => {
          await trx.reconciliation.update({
            where: { id: tx.reconciliation!.id },
            data: {
              status: 'RECONCILED',
              resolvedAt: new Date(),
              resolvedBy: session.user.id,
              logs: { create: { action: 'batch_confirm', previousStatus: 'SUGGESTED', newStatus: 'RECONCILED', details: {} } },
            },
          });
          await trx.bankTransaction.update({ where: { id: tx.id }, data: { status: 'RECONCILED' } });
        });

        if (tx.reconciliation.internalType === 'income' && batch.companyId) {
          try {
            const rec = await prisma.accountsReceivable.findUnique({ where: { id: tx.reconciliation.internalId }, select: { billingStatus: true } });
            if (rec && (rec.billingStatus === 'FATURADA' || rec.billingStatus === 'VENCIDA')) {
              await transitionBillingStatus(tx.reconciliation.internalId, 'QUITADA', {
                userId: session.user.id,
                companyId: batch.companyId,
                data: { receivedAt: tx.date, amountReceived: tx.amount },
                notes: 'Confirmação de lote de conciliação',
              });
            }
            const after = await prisma.accountsReceivable.findUnique({ where: { id: tx.reconciliation.internalId }, select: { billingStatus: true } });
            if (after?.billingStatus === 'QUITADA') {
              await transitionBillingStatus(tx.reconciliation.internalId, 'CONCILIADA', { userId: session.user.id, companyId: batch.companyId });
            }
          } catch (e: any) {
            console.error('confirm transition error:', e?.message);
          }
        }
        confirmed++;
      }

      await importBatchService.refreshCounters(batch.id);
      await createAuditLog({
        userId: session.user.id,
        companyId: batch.companyId,
        action: 'UPDATE',
        entity: 'reconciliation',
        entityId: batch.id,
        metadata: { event: 'batch_confirm', confirmed },
        request: req,
      });
      return NextResponse.json({ ok: true, confirmed });
    }

    // ── Criar lançamento a partir da linha do extrato (botão "+") ───────
    if (action === 'create-entry') {
      const { transactionId, payload } = body;
      const tx = await prisma.bankTransaction.findFirst({ where: { id: transactionId, importBatchId: batch.id } });
      if (!tx) return NextResponse.json({ error: 'Transação não pertence ao lote' }, { status: 404 });
      if (tx.status === 'RECONCILED') return NextResponse.json({ error: 'Linha já conciliada' }, { status: 409 });

      let internalType: 'income' | 'expense';
      let internalId: string;

      if (batch.companyId) {
        if (tx.type === 'credit') {
          const rec = await prisma.accountsReceivable.create({
            data: {
              companyId: batch.companyId,
              description: payload?.description || tx.description,
              customerName: payload?.customerName || tx.payerName || null,
              categoryId: payload?.categoryId || null,
              dueDate: tx.date,
              amount: tx.amount,
              status: 'recebido',
              billingStatus: 'CONCILIADA',
              billedAt: tx.date,
              receivedAt: tx.date,
              amountReceived: tx.amount,
              reconciledAt: new Date(),
              sourceType: 'manual',
              createdBy: session.user.id,
              generateBoleto: false,
              generatePix: false,
              generateNfe: false,
            },
          });
          internalType = 'income';
          internalId = rec.id;
        } else {
          const pay = await prisma.accountsPayable.create({
            data: {
              companyId: batch.companyId,
              description: payload?.description || tx.description,
              supplierName: payload?.supplierName || tx.payerName || null,
              categoryId: payload?.categoryId || null,
              dueDate: tx.date,
              amount: tx.amount,
              status: 'pago',
              paidAt: tx.date,
              amountPaid: tx.amount,
              createdBy: session.user.id,
            } as any,
          });
          internalType = 'expense';
          internalId = pay.id;
        }
      } else {
        if (tx.type === 'credit') {
          const inc = await prisma.income.create({
            data: {
              userId: session.user.id,
              description: payload?.description || tx.description,
              amount: tx.amount,
              date: tx.date,
              category: payload?.category || tx.category || 'Outros',
            } as any,
          });
          internalType = 'income';
          internalId = inc.id;
        } else {
          const exp = await prisma.expense.create({
            data: {
              userId: session.user.id,
              description: payload?.description || tx.description,
              amount: tx.amount,
              date: tx.date,
              category: payload?.category || tx.category || 'Outros',
            } as any,
          });
          internalType = 'expense';
          internalId = exp.id;
        }
      }

      await prisma.$transaction(async (trx) => {
        await trx.reconciliation.upsert({
          where: { bankTransactionId: tx.id },
          update: {
            internalType,
            internalId,
            status: 'RECONCILED',
            matchMethod: 'manual',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            logs: { create: { action: 'created_from_statement', previousStatus: 'PENDING', newStatus: 'RECONCILED', details: { internalId } } },
          },
          create: {
            userId: session.user.id,
            bankTransactionId: tx.id,
            internalType,
            internalId,
            status: 'RECONCILED',
            matchMethod: 'manual',
            resolvedAt: new Date(),
            resolvedBy: session.user.id,
            logs: { create: { action: 'created_from_statement', previousStatus: 'PENDING', newStatus: 'RECONCILED', details: { internalId } } },
          },
        });
        await trx.bankTransaction.update({ where: { id: tx.id }, data: { status: 'RECONCILED' } });
      });

      await importBatchService.refreshCounters(batch.id);
      await createAuditLog({
        userId: session.user.id,
        companyId: batch.companyId,
        action: 'CREATE',
        entity: 'reconciliation',
        entityId: internalId,
        metadata: { event: 'create_entry_from_statement', transactionId: tx.id, internalType },
        request: req,
      });
      return NextResponse.json({ ok: true, internalType, internalId });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('POST batch action error:', error);
    return NextResponse.json({ error: 'Erro ao executar ação no lote' }, { status: 500 });
  }
}
