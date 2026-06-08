export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runRecurringContractBilling } from '@/lib/billing-automation';

function authorize(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

async function handler(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get('companyId') || undefined;
  const limit = Number(url.searchParams.get('limit') || 100);

  try {
    const result = await runRecurringContractBilling({
      companyId,
      limit: Number.isFinite(limit) ? limit : 100,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao processar faturamento recorrente' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handler(req);
}

export async function GET(req: NextRequest) {
  return handler(req);
}
