export const dynamic = 'force-dynamic';

// Endpoint unificado de importação de extrato bancário (PJ)
// Cria simultaneamente:
//   • ImportBatch + BankTransaction  → alimenta "Conciliação por Lotes" (V2)
//   • PJReconciliation               → alimenta "Conciliação" (V1, retrocompatibilidade)
// Executa matching automático via V2 engine e sincroniza resultados em ambas as tabelas.
//
// POST /api/pj/reconciliation/import
// Body: {
//   entries: [{date, reference, amount, type, fitid?, trntype?, payerName?}],
//   bankConnectionId?: string,
//   bankName?: string,
//   fileName?: string,
// }

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { importBatchService } from '@/src/modules/reconciliation/import-batch.service';
import { reconciliationService } from '@/src/modules/reconciliation/reconciliation.service';
import { classifyTransaction } from '@/lib/transaction-classifier';

interface ParsedEntry {
  date: string;
  reference: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT' | string;
  fitid?: string;
  trntype?: string;
  payerName?: string;
}

function makeHash(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function absAmount(entry: ParsedEntry): number {
  return Math.abs(entry.amount);
}

function direction(entry: ParsedEntry): 'credit' | 'debit' {
  const t = (entry.type || '').toUpperCase();
  if (t === 'CREDIT') return 'credit';
  if (t === 'DEBIT') return 'debit';
  return entry.amount >= 0 ? 'credit' : 'debit';
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = (session.user as any).activeCompanyId as string | null;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  let body: {
    entries: ParsedEntry[];
    bankConnectionId?: string | null;
    bankName?: string;
    fileName?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  const { entries = [], bankConnectionId = null, bankName = 'Extrato PJ', fileName = null } = body;

  if (!entries.length) {
    return NextResponse.json({ error: 'Nenhuma transação fornecida' }, { status: 400 });
  }

  // ── 1. Criar lote de importação (V2) ──────────────────────────────────────
  const dates = entries.map(e => new Date(e.date)).filter(d => !isNaN(d.getTime()));
  const periodStart = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
  const periodEnd   = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

  const ext = (fileName || '').split('.').pop()?.toUpperCase() || 'MANUAL';
  const source = ['OFX', 'OFC'].includes(ext) ? 'OFX' : ext === 'CSV' || ext === 'TXT' ? 'CSV' : ext === 'PDF' ? 'PDF' : 'MANUAL';

  const batch = await importBatchService.createBatch({
    userId: session.user.id,
    companyId,
    bankConnectionId,
    source,
    type: 'MANUAL',
    periodStart,
    periodEnd,
    fileName,
  });

  const importBatchId = batch.id;

  // ── 2. Pré-carregar hashes/IDs já existentes (dedup inteligente) ───────────
  // Janela: ±45 dias em volta do período do arquivo (igual à janela de matching)
  const windowStart = new Date((periodStart || new Date()).getTime() - 45 * 86400000);
  const windowEnd   = new Date((periodEnd   || new Date()).getTime() + 45 * 86400000);

  const [existingBankTxs, existingPJRecs] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { companyId, date: { gte: windowStart, lte: windowEnd } },
      select: { transactionHash: true, externalId: true },
    }),
    prisma.pJReconciliation.findMany({
      where: { companyId, bankDate: { gte: windowStart, lte: windowEnd } },
      select: { type: true, bankDate: true, bankAmount: true, bankReference: true },
    }),
  ]);

  // Sets para lookup O(1): hash SHA-256 e FITID para BankTransaction
  const existingHashSet  = new Set<string>(
    existingBankTxs.map(t => t.transactionHash).filter(Boolean) as string[]
  );
  const existingFITIDSet = new Set<string>(
    existingBankTxs.map(t => t.externalId).filter(Boolean) as string[]
  );

  // Chave composta para PJReconciliation: tipo|data|valor|referência(50 chars)
  function pjKey(type: string, date: Date, amount: number, reference: string): string {
    return [type, date.toISOString().slice(0, 10), String(amount), reference.slice(0, 50)].join('|');
  }
  const pjDedupSet = new Set<string>(
    existingPJRecs
      .filter(r => r.bankDate != null)
      .map(r => pjKey(r.type, r.bankDate as Date, r.bankAmount, r.bankReference || ''))
  );

  // ── 3. Criar BankTransaction + PJReconciliation por entrada ──────────────
  const createdTxIds: string[] = [];
  let skippedDupes = 0;

  for (const entry of entries) {
    const amt = absAmount(entry);
    const dir = direction(entry);
    const txDate = new Date(entry.date);
    if (isNaN(txDate.getTime()) || amt === 0) continue;

    // ── Dedup por FITID (OFX) ────────────────────────────────────────────────
    if (entry.fitid && existingFITIDSet.has(entry.fitid)) {
      skippedDupes++;
      continue;
    }

    // ── Dedup por hash SHA-256 (todos os formatos) ────────────────────────────
    // Hash inclui companyId para isolar empresas e usa 'manual' como sentinela
    // quando não há bankConnectionId (evita NULL != NULL do SQL)
    const txHash = makeHash([
      companyId,
      bankConnectionId || 'manual',
      entry.date,
      dir,
      String(amt),
      (entry.reference || '').slice(0, 100),
    ]);

    if (existingHashSet.has(txHash)) {
      skippedDupes++;
      continue;
    }

    const classification = classifyTransaction(entry.reference || '', entry.trntype);

    // ── BankTransaction (V2) ──────────────────────────────────────────────────
    let bankTx: { id: string } | null = null;
    try {
      bankTx = await prisma.bankTransaction.create({
        data: {
          userId: session.user.id,
          companyId,
          personType: 'PJ',
          bankConnectionId,
          externalId: entry.fitid || null,
          transactionHash: txHash,
          description: entry.reference || 'SEM DESCRIÇÃO',
          amount: amt,
          type: dir,
          date: txDate,
          category: classification.corporateCategory,
          payerName: entry.payerName || classification.counterpartyHint || null,
          rawData: entry as any,
          status: 'PENDING',
          importBatchId,
        },
        select: { id: true },
      });
      createdTxIds.push(bankTx.id);

      // Adiciona ao set para deduplicar dentro do próprio lote (arquivo com linhas repetidas)
      existingHashSet.add(txHash);
      if (entry.fitid) existingFITIDSet.add(entry.fitid);
    } catch (err: any) {
      // P2002 = unique constraint (camada de segurança adicional além do set)
      if (err?.code === 'P2002') { skippedDupes++; continue; }
      console.error('[import] BankTransaction create error:', err?.message);
      continue;
    }

    // ── PJReconciliation (V1, retrocompatibilidade) ────────────────────────────
    const pjType = dir === 'debit' ? 'PAYABLE' : 'RECEIVABLE';
    const key = pjKey(pjType, txDate, amt, entry.reference || '');

    if (!pjDedupSet.has(key)) {
      await prisma.pJReconciliation.create({
        data: {
          companyId,
          type: pjType,
          accountId: 'N/A',
          bankConnectionId,
          bankName,
          importBatchId,
          bankReference: (entry.reference || '').slice(0, 500),
          bankDate: txDate,
          bankAmount: amt,
          status: 'PENDING',
          matchMethod: 'auto',
        },
      }).catch((e: any) => console.error('[import] PJReconciliation create error:', e?.message));

      pjDedupSet.add(key);
    }
  }

  // ── 4. Lote vazio: todas as transações já existiam → apaga o lote criado ───
  if (createdTxIds.length === 0) {
    await importBatchService.deleteEmptyBatch(importBatchId, session.user.id).catch(() => {});
    return NextResponse.json({
      summary: {
        total: skippedDupes,
        imported: 0,
        skippedDuplicates: skippedDupes,
        reconciled: 0,
        suggested: 0,
        bankOnly: 0,
        allDuplicates: true,
      },
      message: 'Todas as transações deste arquivo já foram importadas anteriormente.',
    }, { status: 200 });
  }

  // ── 5. Executar matching automático V2 ───────────────────────────────────
  let matchSummary = { processed: 0, reconciled: 0, suggested: 0, pending: 0 };
  try {
    matchSummary = await reconciliationService.reconcileBankTransactions({
      userId: session.user.id,
      companyId,
      bankTransactionIds: createdTxIds,
    });
  } catch (err: any) {
    console.error('[import] reconcile error:', err?.message);
  }

  // ── 6. Sincronizar resultados do V2 com PJReconciliation (V1) ────────────
  try {
    const reconciledTxs = await prisma.bankTransaction.findMany({
      where: {
        id: { in: createdTxIds },
        status: { in: ['RECONCILED', 'SUGGESTED'] },
      },
      include: { reconciliation: true },
    });

    for (const tx of reconciledTxs) {
      if (!tx.reconciliation?.internalId) continue;
      const pjStatus = tx.reconciliation.status === 'RECONCILED' ? 'RECONCILED' : 'SUGGESTED';
      const pjAccountId = tx.reconciliation.internalId;

      await prisma.pJReconciliation.updateMany({
        where: {
          companyId,
          importBatchId,
          bankDate: tx.date,
          bankAmount: (tx as any).amount,
          status: 'PENDING',
        },
        data: {
          accountId: pjAccountId,
          status: pjStatus,
          matchMethod: 'auto',
          ...(pjStatus === 'RECONCILED' ? { reconciledAt: new Date(), reconciledBy: session.user.id } : {}),
        },
      });

      if (pjStatus === 'RECONCILED') {
        if ((tx as any).type === 'debit') {
          await prisma.accountsPayable.update({
            where: { id: pjAccountId },
            data: { status: 'pago', paidAt: tx.date, amountPaid: (tx as any).amount },
          }).catch(() => {});
        } else {
          await prisma.accountsReceivable.update({
            where: { id: pjAccountId },
            data: { status: 'recebido', receivedAt: tx.date, amountReceived: (tx as any).amount },
          }).catch(() => {});
        }
      }
    }
  } catch (err: any) {
    console.error('[import] sync V1 error:', err?.message);
  }

  // ── 7. Atualizar contadores do lote (V2) ──────────────────────────────────
  await importBatchService.refreshCounters(importBatchId).catch(() => {});

  // ── 8. Retornar resumo ────────────────────────────────────────────────────
  const totalImported = createdTxIds.length;
  return NextResponse.json({
    batchId: importBatchId,
    summary: {
      total: totalImported + skippedDupes,
      imported: totalImported,
      skippedDuplicates: skippedDupes,
      reconciled: matchSummary.reconciled,
      suggested: matchSummary.suggested,
      bankOnly: matchSummary.pending,
    },
  }, { status: 201 });
}
