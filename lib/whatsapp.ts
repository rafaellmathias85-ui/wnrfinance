// WhatsApp Integration — dual provider: Evolution API (self-hosted) + Meta Cloud API
// Evolution API: https://github.com/EvolutionAPI/evolution-api (free, self-hosted)
// Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api

import { prisma } from '@/lib/prisma';
import { safeDecrypt, encrypt } from '@/lib/encrypt';

export type WhatsAppProvider = 'evolution' | 'meta';

export interface SendTextOptions {
  to: string;       // phone number with country code, e.g. "5511999990000"
  text: string;
}

export interface SendMediaOptions {
  to: string;
  mediaUrl: string;
  caption?: string;
  mediaType: 'image' | 'document' | 'audio';
}

export interface WhatsAppMessage {
  from: string;
  body?: string;
  mediaUrl?: string;
  mediaType?: string;
  messageId: string;
  timestamp: number;
}

export interface ConnectionStatus {
  connected: boolean;
  qrCode?: string;
  phoneNumber?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get session from DB
// ─────────────────────────────────────────────────────────────────────────────
export async function getSession(userId?: string, companyId?: string) {
  return prisma.whatsappSession.findFirst({
    where: {
      OR: [
        userId ? { userId } : {},
        companyId ? { companyId } : {},
      ],
      isActive: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  return safeDecrypt(value) ?? value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evolution API adapter
// ─────────────────────────────────────────────────────────────────────────────
class EvolutionClient {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor(baseUrl: string, apiKey: string, instance: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.instance = instance;
  }

  private headers() {
    return { 'Content-Type': 'application/json', apikey: this.apiKey };
  }

  async createInstance(): Promise<{ instance: string; qrcode?: string }> {
    const res = await fetch(`${this.baseUrl}/instance/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        instanceName: this.instance,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });
    return res.json();
  }

  async getQR(): Promise<{ qrcode?: { base64?: string; code?: string } }> {
    const res = await fetch(`${this.baseUrl}/instance/connect/${this.instance}`, {
      headers: this.headers(),
    });
    return res.json();
  }

  async getStatus(): Promise<{ instance?: { state?: string; profileName?: string } }> {
    const res = await fetch(`${this.baseUrl}/instance/fetchInstances`, {
      headers: this.headers(),
    });
    const data = await res.json();
    const found = Array.isArray(data) ? data.find((i: any) => i.instance?.instanceName === this.instance) : data;
    return found || {};
  }

  async sendText(to: string, text: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/message/sendText/${this.instance}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        number: to.replace(/\D/g, ''),
        text,
        delay: 1000,
      }),
    });
    return res.ok;
  }

  async sendMedia(to: string, mediaUrl: string, caption: string, type: string): Promise<boolean> {
    const endpoint = type === 'image' ? 'sendMedia' : type === 'document' ? 'sendMedia' : 'sendMedia';
    const res = await fetch(`${this.baseUrl}/message/${endpoint}/${this.instance}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        number: to.replace(/\D/g, ''),
        mediatype: type.toUpperCase(),
        media: mediaUrl,
        caption,
      }),
    });
    return res.ok;
  }

  async setWebhook(webhookUrl: string, token: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/webhook/set/${this.instance}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      }),
    });
    return res.ok;
  }

  async downloadMedia(messageId: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instance}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ message: { key: { id: messageId } } }),
      });
      const data = await res.json();
      return data.base64 ? `data:${data.mimetype};base64,${data.base64}` : null;
    } catch { return null; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Cloud API adapter
// ─────────────────────────────────────────────────────────────────────────────
class MetaClient {
  private phoneNumberId: string;
  private accessToken: string;
  private baseUrl = 'https://graph.facebook.com/v19.0';

  constructor(phoneNumberId: string, accessToken: string) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
  }

  private headers() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.accessToken}` };
  }

  async sendText(to: string, text: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });
    return res.ok;
  }

  async sendMedia(to: string, mediaUrl: string, caption: string, type: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
        type,
        [type]: { link: mediaUrl, caption },
      }),
    });
    return res.ok;
  }

  async downloadMedia(mediaId: string): Promise<string | null> {
    try {
      const urlRes = await fetch(`${this.baseUrl}/${mediaId}`, { headers: this.headers() });
      const { url } = await urlRes.json();
      const mediaRes = await fetch(url, { headers: this.headers() });
      const buffer = await mediaRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const ct = mediaRes.headers.get('content-type') || 'image/jpeg';
      return `data:${ct};base64,${base64}`;
    } catch { return null; }
  }

  // Meta doesn't need QR - uses Facebook Business login
  async getStatus(): Promise<{ connected: boolean; phoneNumber?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}`, { headers: this.headers() });
      const data = await res.json();
      return { connected: res.ok, phoneNumber: data.display_phone_number };
    } catch { return { connected: false }; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified send function — picks the right client automatically
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWhatsAppText(sessionId: string, to: string, text: string): Promise<boolean> {
  const session = await prisma.whatsappSession.findUnique({ where: { id: sessionId } });
  if (!session?.isActive) return false;

  try {
    if (session.provider === 'evolution') {
      const client = new EvolutionClient(
        session.apiUrl!,
        decryptField(session.apiKey)!,
        session.instanceName!,
      );
      return client.sendText(to, text);
    } else {
      const client = new MetaClient(
        session.phoneNumberId!,
        decryptField(session.accessToken)!,
      );
      return client.sendText(to, text);
    }
  } catch { return false; }
}

export async function sendWhatsAppMedia(sessionId: string, to: string, mediaUrl: string, caption: string, type: 'image' | 'document' = 'image'): Promise<boolean> {
  const session = await prisma.whatsappSession.findUnique({ where: { id: sessionId } });
  if (!session?.isActive) return false;

  try {
    if (session.provider === 'evolution') {
      const client = new EvolutionClient(session.apiUrl!, decryptField(session.apiKey)!, session.instanceName!);
      return client.sendMedia(to, mediaUrl, caption, type);
    } else {
      const client = new MetaClient(session.phoneNumberId!, decryptField(session.accessToken)!);
      return client.sendMedia(to, mediaUrl, caption, type);
    }
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// QR Code / Connection Status
// ─────────────────────────────────────────────────────────────────────────────
export async function getEvolutionQR(sessionId: string): Promise<{ qr?: string; status: string }> {
  const session = await prisma.whatsappSession.findUnique({ where: { id: sessionId } });
  if (!session || session.provider !== 'evolution') return { status: 'not_evolution' };

  const client = new EvolutionClient(session.apiUrl!, decryptField(session.apiKey)!, session.instanceName!);

  try {
    // Try to create instance first (idempotent)
    await client.createInstance().catch(() => {});
    const qrData = await client.getQR();
    const qr = qrData?.qrcode?.base64 || qrData?.qrcode?.code;

    const statusData = await client.getStatus();
    const state = statusData?.instance?.state || 'qr_pending';
    const connected = state === 'open';

    await prisma.whatsappSession.update({
      where: { id: sessionId },
      data: {
        status: connected ? 'connected' : 'qr_pending',
        qrCode: qr || null,
        isActive: connected,
        lastConnectedAt: connected ? new Date() : undefined,
        phoneNumber: statusData?.instance?.profileName || session.phoneNumber,
      },
    });

    return { qr, status: state };
  } catch (e: any) {
    return { status: 'error' };
  }
}

export async function createEvolutionSession(params: {
  userId?: string;
  companyId?: string;
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
}): Promise<string> {
  const existing = await prisma.whatsappSession.findFirst({
    where: { OR: [params.userId ? { userId: params.userId } : {}, params.companyId ? { companyId: params.companyId } : {}] },
  });

  const webhookToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  const data = {
    provider: 'evolution' as const,
    apiUrl: params.apiUrl,
    apiKey: encrypt(params.apiKey),
    instanceName: params.instanceName,
    webhookToken,
    status: 'qr_pending',
    isActive: false,
    userId: params.userId || null,
    companyId: params.companyId || null,
  };

  let session;
  if (existing) {
    session = await prisma.whatsappSession.update({ where: { id: existing.id }, data });
  } else {
    session = await prisma.whatsappSession.create({ data });
  }

  // Register webhook on Evolution API
  try {
    const client = new EvolutionClient(params.apiUrl, params.apiKey, params.instanceName);
    await client.createInstance().catch(() => {});
    await client.setWebhook(params.webhookUrl, webhookToken);
  } catch {}

  return session.id;
}

export async function createMetaSession(params: {
  userId?: string;
  companyId?: string;
  phoneNumberId: string;
  accessToken: string;
  webhookToken: string;
}): Promise<string> {
  const existing = await prisma.whatsappSession.findFirst({
    where: { OR: [params.userId ? { userId: params.userId } : {}, params.companyId ? { companyId: params.companyId } : {}] },
  });

  const data = {
    provider: 'meta' as const,
    phoneNumberId: params.phoneNumberId,
    accessToken: encrypt(params.accessToken),
    webhookToken: params.webhookToken,
    status: 'connected',
    isActive: true,
    userId: params.userId || null,
    companyId: params.companyId || null,
  };

  let session;
  if (existing) {
    session = await prisma.whatsappSession.update({ where: { id: existing.id }, data });
  } else {
    session = await prisma.whatsappSession.create({ data });
  }

  return session.id;
}

// Export EvolutionClient for internal use
export { EvolutionClient, MetaClient, decryptField };
