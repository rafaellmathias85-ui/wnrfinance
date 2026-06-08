export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { processAsaasWebhook, AsaasWebhookEvent } from '@/lib/boleto';

// POST /api/pj/cobrancas/webhook — receives Asaas payment events
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Basic validation
    if (!body.event || !body.payment?.id) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    await processAsaasWebhook(body as AsaasWebhookEvent);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
