export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendSmartWeeklySummary } from '@/lib/whatsapp-bot';

// POST /api/cron/whatsapp-smart-summary
// Schedule: every Monday at 8:00 BRT (11:00 UTC)
// Also callable via GET for testing
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendSmartWeeklySummary();
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';

  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendSmartWeeklySummary();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
