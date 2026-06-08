export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processIncomingMessage } from '@/lib/whatsapp-bot';
import { updateDeliveryStatus } from '@/lib/whatsapp-financial';

// GET: webhook verification (Meta Cloud API uses this)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && challenge) {
    // Find session with matching webhook token
    const session = await prisma.whatsappSession.findFirst({
      where: { webhookToken: token || '', provider: 'meta' },
    });
    if (session) return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST: receive messages from Evolution API or Meta Cloud API
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Evolution API format ──────────────────────────────────────
    if (body.event === 'messages.upsert' || body.data?.messages) {
      await handleEvolutionWebhook(body);
      return NextResponse.json({ ok: true });
    }

    // ── Meta Cloud API format ─────────────────────────────────────
    if (body.object === 'whatsapp_business_account') {
      await handleMetaWebhook(body);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('WhatsApp webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Evolution API message handler
// ─────────────────────────────────────────────────────────────────────────────
async function handleEvolutionWebhook(body: any) {
  const instanceName = body.instance || body.data?.instance;
  if (!instanceName) return;

  const session = await prisma.whatsappSession.findFirst({
    where: { instanceName, provider: 'evolution' },
  });
  if (!session) return;

  // Handle connection status update
  if (body.event === 'connection.update') {
    const state = body.data?.state;
    const qr = body.data?.qrcode?.base64;
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        status: state === 'open' ? 'connected' : state === 'close' ? 'disconnected' : 'qr_pending',
        isActive: state === 'open',
        qrCode: qr || null,
        lastConnectedAt: state === 'open' ? new Date() : undefined,
      },
    });
    return;
  }

  // Handle incoming messages
  const messages = body.data?.messages || (Array.isArray(body.data) ? body.data : []);
  for (const msg of messages) {
    if (msg.key?.fromMe) continue; // Skip own messages

    const from = msg.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const imageMsg = msg.message?.imageMessage;
    const docMsg = msg.message?.documentMessage;
    const mediaUrl = imageMsg?.url || docMsg?.url || undefined;
    const mediaType = imageMsg ? 'image' : docMsg ? 'document' : undefined;

    if (!from) continue;

    await processIncomingMessage({
      sessionId: session.id,
      from,
      body: text,
      mediaUrl,
      mediaType,
      messageId: msg.key?.id || '',
      timestamp: msg.messageTimestamp || Date.now() / 1000,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Cloud API message handler
// ─────────────────────────────────────────────────────────────────────────────
async function handleMetaWebhook(body: any) {
  const entry = body.entry?.[0];
  if (!entry) return;

  const phoneNumberId = entry.changes?.[0]?.value?.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const session = await prisma.whatsappSession.findFirst({
    where: { phoneNumberId, provider: 'meta' },
  });
  if (!session) return;

  const change = entry.changes?.[0]?.value;

  // ── Delivery status updates (statuses array) ──────────────────────────────
  const statuses = change?.statuses || [];
  for (const statusObj of statuses) {
    const msgId = statusObj.id;
    const status = statusObj.status; // sent, delivered, read, failed
    if (!msgId || !status) continue;

    const mapped = status === 'sent' ? 'sent'
      : status === 'delivered' ? 'delivered'
      : status === 'read' ? 'read'
      : status === 'failed' ? 'failed'
      : null;

    if (mapped) {
      const errMsg = statusObj.errors?.[0]?.title;
      await updateDeliveryStatus(msgId, mapped as any, errMsg);
    }
  }

  // ── Incoming messages ──────────────────────────────────────────────────────
  const messages = change?.messages || [];
  for (const msg of messages) {
    const from = msg.from || '';
    const text = msg.text?.body || '';
    const image = msg.image;
    const document = msg.document;
    const mediaId = image?.id || document?.id;
    const mediaType = image ? 'image' : document ? 'document' : undefined;

    const mediaUrl = mediaId ? `meta_media:${mediaId}` : undefined;

    await processIncomingMessage({
      sessionId: session.id,
      from,
      body: text,
      mediaUrl,
      mediaType,
      messageId: msg.id || '',
      timestamp: parseInt(msg.timestamp) || Date.now() / 1000,
    });
  }
}
