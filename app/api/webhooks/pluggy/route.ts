export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWebhookHmac } from '@/lib/webhook-security';

// Pluggy envia eventos quando items/contas são atualizados.
// Segurança: HMAC-SHA256 (x-pluggy-signature) fail-closed em produção
// via PLUGGY_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-pluggy-signature');

    const auth = verifyWebhookHmac(
      rawBody,
      signature?.toLowerCase() || null,
      process.env.PLUGGY_WEBHOOK_SECRET,
      'Pluggy',
      'sha256',
    );
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    }

    const body = JSON.parse(rawBody);
    const { event, itemId } = body;

    if (!itemId) return NextResponse.json({ ok: true });

    if (event === 'item/updated' || event === 'item/created') {
      // Mark the bank connection as needing sync
      await prisma.bankConnection.updateMany({
        where: { connectionId: itemId },
        data: {
          status: 'syncing',
          syncError: null,
        },
      });

      // Trigger a sync via internal API (fire-and-forget)
      const connection = await prisma.bankConnection.findFirst({
        where: { connectionId: itemId },
        select: { id: true, companyId: true, userId: true },
      });

      if (connection) {
        // Queue a background sync — in production use a job queue here
        fetch(`${process.env.NEXTAUTH_URL}/api/pluggy/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
          body: JSON.stringify({ connectionId: connection.id }),
        }).catch(() => {});
      }
    } else if (event === 'item/error') {
      await prisma.bankConnection.updateMany({
        where: { connectionId: itemId },
        data: {
          status: 'error',
          syncError: body.error?.message || 'Pluggy sync error',
        },
      });
    } else if (event === 'item/deleted') {
      await prisma.bankConnection.updateMany({
        where: { connectionId: itemId },
        data: { status: 'disconnected' },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Pluggy webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
