export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Focus NFe sends webhook events when NF-e status changes.
// Verify HMAC-SHA1 signature using FOCUSNFE_WEBHOOK_SECRET env var.
function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return !secret; // if no secret configured, skip verification
  const expected = crypto.createHmac('sha1', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature');
    const secret = process.env.FOCUSNFE_WEBHOOK_SECRET || '';

    if (secret && !verifySignature(rawBody, signature?.replace('sha1=', '') || null, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const { event, nota_fiscal } = body;

    if (!nota_fiscal?.ref) {
      return NextResponse.json({ ok: true });
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
