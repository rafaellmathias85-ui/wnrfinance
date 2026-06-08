export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Pluggy sends webhook events when items/accounts are updated.
// Verify HMAC-SHA256 signature using PLUGGY_WEBHOOK_SECRET env var.
function verifyPluggySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return !secret;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature.toLowerCase()),
    Buffer.from(expected.toLowerCase())
  );
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-pluggy-signature');
    const secret = process.env.PLUGGY_WEBHOOK_SECRET || '';

    if (secret && !verifyPluggySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
