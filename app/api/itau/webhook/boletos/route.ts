export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { itauWebhookHandler } from '@/lib/itau';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? undefined;
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const result = await itauWebhookHandler.handleNotificacao(authHeader, payload);
  return NextResponse.json(result.body, { status: result.status });
}
