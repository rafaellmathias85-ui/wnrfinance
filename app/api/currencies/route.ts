export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getExchangeRate, refreshAllRates, convertCurrency, SUPPORTED_CURRENCIES } from '@/lib/currency';
import { prisma } from '@/lib/prisma';

// GET /api/currencies?action=rates|convert&from=USD&to=BRL&amount=100
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'rates';
    const from = searchParams.get('from') || 'USD';
    const to = searchParams.get('to') || 'BRL';
    const amount = parseFloat(searchParams.get('amount') || '1');

    if (action === 'convert') {
      const result = await convertCurrency(amount, from, to);
      const rateInfo = await getExchangeRate(from, to);
      return NextResponse.json({ from, to, amount, converted: result, rate: rateInfo.rate, source: rateInfo.source });
    }

    if (action === 'refresh') {
      const rates = await refreshAllRates();
      return NextResponse.json({ rates, currencies: SUPPORTED_CURRENCIES });
    }

    // List latest rates for all currencies
    const since = new Date();
    since.setDate(since.getDate() - 2); // last 2 days

    const rates = await prisma.exchangeRate.findMany({
      where: { toCurrency: 'BRL', date: { gte: since } },
      orderBy: { date: 'desc' },
      distinct: ['fromCurrency'],
    });

    const rateMap: Record<string, { rate: number; date: Date; source: string | null }> = { BRL: { rate: 1, date: new Date(), source: 'identity' } };
    for (const r of rates) {
      rateMap[r.fromCurrency] = { rate: r.rate, date: r.date, source: r.source };
    }

    return NextResponse.json({
      currencies: SUPPORTED_CURRENCIES,
      rates: rateMap,
      updatedAt: rates[0]?.date || null,
    });
  } catch (error: any) {
    console.error('currencies error:', error);
    return NextResponse.json({ error: 'Erro ao buscar câmbio' }, { status: 500 });
  }
}
