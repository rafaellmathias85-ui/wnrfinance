export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyWebhookHmac,
  registerWebhookEvent,
  deterministicEventId,
} from '@/lib/webhook-security';

// Focus NFe envia eventos quando o status da NF-e muda.
// Segurança: assinatura HMAC-SHA1 (x-hub-signature) validada de forma
// fail-closed em produção via FOCUSNFE_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature');

    const auth = verifyWebhookHmac(
      rawBody,
      signature,
      process.env.FOCUSNFE_WEBHOOK_SECRET,
      'Focus NFe',
      'sha1',
    );
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    }

    const body = JSON.parse(rawBody);
    const { event, nota_fiscal } = body;

    if (!nota_fiscal?.ref) {
      return NextResponse.json({ ok: true });
    }

    // Idempotência: status é o discriminador de efeito por nota
    const eventId = deterministicEventId('focusnfe', nota_fiscal.ref, nota_fiscal.status, event);
    const isNew = await registerWebhookEvent({
      provider: 'focusnfe',
      eventId,
      eventType: `${event || 'status'}:${nota_fiscal.status}`,
      payload: { ref: nota_fiscal.ref, status: nota_fiscal.status },
    });
    if (!isNew) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // ref is stored as providerNFeId when creating the NF-e
    const ref = nota_fiscal.ref;

    const statusMap: Record<string, string> = {
      'emitida': 'autorizada',
      'cancelada': 'cancelada',
      'erro_autorizacao': 'rejeitada',
      'rejeitada': 'rejeitada',
      'denegada': 'rejeitada',
      'em_processamento': 'enviada',
    };

    const newStatus = statusMap[nota_fiscal.status] || nota_fiscal.status;

    await prisma.nFe.updateMany({
      where: { providerNFeId: ref },
      data: {
        status: newStatus,
        accessKey: nota_fiscal.chave_nfe || undefined,
        pdfUrl: nota_fiscal.caminho_danfe || undefined,
        xmlUrl: nota_fiscal.caminho_xml_nota_fiscal || undefined,
        errorMessage: nota_fiscal.mensagem_sefaz || undefined,
        ...(newStatus === 'autorizada' ? { issuedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('FocusNFe webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
