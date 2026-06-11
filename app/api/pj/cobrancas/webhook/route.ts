export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { processAsaasWebhook, AsaasWebhookEvent } from '@/lib/boleto';
import {
  verifyWebhookToken,
  registerWebhookEvent,
  deterministicEventId,
} from '@/lib/webhook-security';

// POST /api/pj/cobrancas/webhook — recebe eventos de pagamento do Asaas.
// Segurança: token `asaas-access-token` validado de forma fail-closed em produção.
// Idempotência: cada evento (id ou hash determinístico) é processado uma única vez.
export async function POST(request: NextRequest) {
  try {
    const token =
      request.headers.get('asaas-access-token') || request.headers.get('access-token');
    const auth = verifyWebhookToken(token, process.env.ASAAS_WEBHOOK_TOKEN, 'Asaas (pj/cobrancas)');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    }

    const body = await request.json();

    if (!body.event || !body.payment?.id) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    // Asaas envia `id` do evento no payload raiz; fallback determinístico se ausente
    const eventId: string =
      body.id || deterministicEventId('asaas', body.event, body.payment.id, body.payment.paymentDate);

    const isNew = await registerWebhookEvent({
      provider: 'asaas',
      eventId,
      eventType: body.event,
      payload: { event: body.event, paymentId: body.payment.id, value: body.payment.value },
    });
    if (!isNew) {
      // Reentrega do provedor — confirma recebimento sem reprocessar
      return NextResponse.json({ received: true, duplicate: true });
    }

    await processAsaasWebhook(body as AsaasWebhookEvent);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
