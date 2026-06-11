export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { processAsaasWebhook, AsaasWebhookEvent } from '@/lib/boleto';
import {
  verifyWebhookToken,
  registerWebhookEvent,
  deterministicEventId,
} from '@/lib/webhook-security';

// Asaas envia eventos de mudança de status de pagamento.
// Segurança: token `asaas-access-token` (configurado no painel Asaas) validado
// de forma fail-closed em produção via ASAAS_WEBHOOK_TOKEN.
// Idempotência: eventos registrados em WebhookEvent — reentregas não reprocessam.
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('asaas-access-token') || req.headers.get('access-token');
    const auth = verifyWebhookToken(token, process.env.ASAAS_WEBHOOK_TOKEN, 'Asaas (webhooks/asaas)');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    }

    const body = await req.json();
    const { event, payment } = body;

    if (!event || !payment?.id) {
      return NextResponse.json({ ok: true });
    }

    const eventId: string =
      body.id || deterministicEventId('asaas', event, payment.id, payment.paymentDate);

    const isNew = await registerWebhookEvent({
      provider: 'asaas',
      eventId,
      eventType: event,
      payload: { event, paymentId: payment.id, value: payment.value },
    });
    if (!isNew) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Lógica única e transacional (lib/boleto): localiza por providerChargeId
    // ou externalReference e dá baixa atômica em BoletoCharge + AccountsReceivable.
    await processAsaasWebhook(body as AsaasWebhookEvent);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Asaas webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
