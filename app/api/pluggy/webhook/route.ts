import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pluggy } from '@/lib/open-finance';

export const dynamic = 'force-dynamic';

/**
 * Pluggy webhook handler.
 * Events: item/created, item/updated, item/error, item/login_succeeded, item/waiting_user_input, etc.
 * Docs: https://docs.pluggy.ai/docs/webhooks
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, itemId } = body || {};
    if (!event || !itemId) return NextResponse.json({ ok: true });

    const conn = await prisma.bankConnection.findFirst({ where: { connectionId: itemId } });
    if (!conn) return NextResponse.json({ ok: true });

    // Fetch latest item status using the company credentials tied to the connection.
    let item: any = null;
    try {
      item = await pluggy.getItem(itemId, conn.companyId);
    } catch { /* noop */ }

    let status = conn.status;
    if (event.includes('error') || item?.status === 'LOGIN_ERROR') status = 'error';
    else if (event.includes('updated') || item?.status === 'UPDATED') status = 'active';
    else if (event.includes('created') || item?.status === 'UPDATING') status = 'syncing';

    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: {
        status,
        syncError: item?.error?.message || null,
        lastSyncAt: item?.lastUpdatedAt ? new Date(item.lastUpdatedAt) : new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[pluggy/webhook]', error);
    return NextResponse.json({ ok: true });
  }
}
