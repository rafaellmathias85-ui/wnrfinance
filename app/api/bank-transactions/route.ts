import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: list bank transactions with filters
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const url = req.nextUrl.searchParams;
  const bankId = url.get('bankId');
  const status = url.get('status');
  const page = parseInt(url.get('page') || '1');
  const limit = 50;

  const where: any = { userId: session.user.id, companyId: null };
  if (bankId) where.bankConnectionId = bankId;
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        bankConnection: { select: { bankName: true, bankLogo: true } },
        reconciliation: { select: { id: true, status: true, matchScore: true, internalType: true, internalId: true } },
      },
    }),
    prisma.bankTransaction.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}

// POST: import bank transactions (manual CSV/JSON or from provider)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { transactions, bankConnectionId, closingBalance } = body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'Lista de transações vazia' }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    const { importBatchService } = await import('@/src/modules/reconciliation/import-batch.service');
    const batch = await importBatchService.createBatch({
      userId: session.user.id,
      companyId: null,
      bankConnectionId: bankConnectionId || null,
      source: 'MANUAL',
      type: 'MANUAL',
    });
    const importBatchId = batch.id;

    for (const tx of transactions) {
      if (!tx.description || tx.amount === undefined || !tx.date || !tx.type) {
        skipped++;
        continue;
      }

      const externalId = tx.externalId || `manual_${session.user.id}_${tx.date}_${tx.amount}_${tx.description.slice(0, 20)}`;

      try {
        await prisma.bankTransaction.upsert({
          where: { userId_externalId: { userId: session.user.id, externalId } },
          update: {
            description: tx.description,
            amount: Math.abs(parseFloat(tx.amount)),
            type: parseFloat(tx.amount) < 0 ? 'debit' : tx.type,
            date: new Date(tx.date),
            category: tx.category || null,
            balanceAfter: tx.balanceAfter ? parseFloat(tx.balanceAfter) : null,
          },
          create: {
            userId: session.user.id,
            bankConnectionId: bankConnectionId || null,
            externalId,
            description: tx.description,
            amount: Math.abs(parseFloat(tx.amount)),
            type: parseFloat(tx.amount) < 0 ? 'debit' : tx.type,
            date: new Date(tx.date),
            category: tx.category || null,
            balanceAfter: tx.balanceAfter ? parseFloat(tx.balanceAfter) : null,
            status: 'PENDING',
            importBatchId,
          },
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    // Update bank connection balance if closingBalance provided
    if (bankConnectionId && closingBalance != null && !isNaN(closingBalance)) {
      try {
        await prisma.bankConnection.update({
          where: { id: bankConnectionId },
          data: { currentBalance: parseFloat(String(closingBalance)) },
        });
      } catch { /* bank connection may not exist */ }
    }

    return NextResponse.json({ imported, skipped, total: transactions.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erro ao importar' }, { status: 500 });
  }
}
