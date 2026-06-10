export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseOFX, parseCSV } from '@/lib/ofx-parser';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const confirm = searchParams.get('confirm') === 'true';
  const importType = searchParams.get('importType') || 'expense'; // expense | income

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });

  const content = await file.text();
  const filename = file.name.toLowerCase();

  let parsed;
  try {
    if (filename.endsWith('.ofx') || filename.endsWith('.qfx') || content.includes('<OFX>') || content.includes('<ofx>')) {
      parsed = parseOFX(content);
    } else {
      parsed = parseCSV(content);
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Erro ao processar arquivo: ${err.message}` }, { status: 400 });
  }

  const transactions = parsed.transactions;
  const totalEntradas = transactions.filter((t) => t.type === 'credit').length;
  const totalSaidas = transactions.filter((t) => t.type === 'debit').length;
  const totalEntradas$ = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalSaidas$ = transactions.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

  // Get category IDs from body (form data)
  const categoryMappingRaw = formData.get('categoryMapping') as string | null;
  const categoryMapping: Record<string, string> = categoryMappingRaw ? JSON.parse(categoryMappingRaw) : {};

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      source: parsed.source,
      totalEntradas,
      totalSaidas,
      totalEntradas$,
      totalSaidas$,
      total: transactions.length,
      transactions: transactions.slice(0, 100).map((t) => ({
        externalId: t.externalId,
        type: t.type,
        amount: t.amount,
        date: t.date,
        description: t.description,
      })),
    });
  }

  // Save transactions
  let saved = 0;
  let skipped = 0;
  const today = new Date().toISOString();

  for (const tx of transactions) {
    try {
      const categoryId = categoryMapping[tx.externalId] || null;
      const description = tx.description || tx.memo || 'Lançamento importado';
      const dueDate = tx.date;

      if (tx.type === 'credit' && importType !== 'expense') {
        await prisma.accountsReceivable.create({
          data: {
            companyId,
            description,
            amount: tx.amount,
            dueDate,
            receivedAt: dueDate,
            status: 'recebido',
            categoryId,
            sourceType: 'import',
            sourceId: tx.externalId,
          },
        });
        saved++;
      } else if (tx.type === 'debit' && importType !== 'income') {
        await prisma.accountsPayable.create({
          data: {
            companyId,
            description,
            amount: tx.amount,
            dueDate,
            paidAt: dueDate,
            status: 'pago',
            categoryId,
            createdBy: session.user.id,
          },
        });
        saved++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, saved, skipped, total: transactions.length });
}
