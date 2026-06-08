export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendDailyReminders } from '@/lib/whatsapp-bot';

// POST /api/cron/whatsapp-reminders
// Called by: Vercel Cron Job (vercel.json) or any external scheduler
// Schedule: daily at 8:00 BRT (11:00 UTC)
// Also callable manually for testing
export async function POST(req: NextRequest) {
  // Verify internal secret or cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendDailyReminders();
    return NextResponse.json({
      ok: true,
      sent: result.sent,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// GET: allow manual trigger from browser for testing
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';

  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendDailyReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
