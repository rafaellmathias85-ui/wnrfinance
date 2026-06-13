export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { itauWebhookHandler } from '@/lib/itau';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? undefined;
  const result = itauWebhookHandler.handleAuth(authHeader);
  return NextResponse.json(result.body, { status: result.status });
}
