import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Bank transactions (from Open Finance sync)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = { userId: session.user.id };
    if (provider) where.provider = provider;

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
    });

    return NextResponse.json(transactions);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar transações' }, { status: 500 });
  }
}

// Manual import of transactions (CSV-like)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();

    // Handle batch import
    if (Array.isArray(body.transactions)) {
      const results = { created: 0, skipped: 0 };

      for (const tx of body.transactions) {
        // Check for duplicates using externalId
        if (tx.externalId) {
          const existing = await prisma.transaction.findUnique({
            where: { externalId: tx.externalId },
          });
          if (existing) {
            results.skipped++;
            continue;
          }
        }

        await prisma.transaction.create({
          data: {
            userId: session.user.id,
            externalId: tx.externalId || null,
            provider: tx.provider || 'manual',
            description: tx.description,
            amount: parseFloat(tx.amount),
            type: tx.type || (parseFloat(tx.amount) >= 0 ? 'income' : 'expense'),
            category: tx.category || 'Outros',
            date: new Date(tx.date),
            notes: tx.notes,
          },
        });
        results.created++;
      }

      return NextResponse.json(results, { status: 201 });
    }

    // Single transaction
    const tx = await prisma.transaction.create({
      data: {
        userId: session.user.id,
        externalId: body.externalId || null,
        provider: body.provider || 'manual',
        description: body.description,
        amount: parseFloat(body.amount),
        type: body.type,
        category: body.category,
        date: new Date(body.date),
        notes: body.notes,
      },
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json({ error: 'Erro ao criar transação' }, { status: 500 });
  }
}
