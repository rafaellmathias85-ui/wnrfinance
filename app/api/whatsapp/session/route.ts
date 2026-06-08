export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createEvolutionSession, createMetaSession, getEvolutionQR, decryptField } from '@/lib/whatsapp';

// GET: current session status
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  const wa = await prisma.whatsappSession.findFirst({
    where: { OR: [{ userId: session.user.id }, ...(companyId ? [{ companyId }] : [])] },
    orderBy: { updatedAt: 'desc' },
  });

  if (!wa) return NextResponse.json({ configured: false });

  return NextResponse.json({
    configured: true,
    id: wa.id,
    provider: wa.provider,
    status: wa.status,
    isActive: wa.isActive,
    phoneNumber: wa.phoneNumber,
    instanceName: wa.instanceName,
    qrCode: wa.qrCode,
    lastConnectedAt: wa.lastConnectedAt,
  });
}

// POST: create/update session
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  const body = await req.json();
  const { provider } = body;

  const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/whatsapp`;

  try {
    let sessionId: string;

    if (provider === 'evolution') {
      const { apiUrl, apiKey, instanceName } = body;
      if (!apiUrl || !apiKey || !instanceName) {
        return NextResponse.json({ error: 'apiUrl, apiKey e instanceName são obrigatórios' }, { status: 400 });
      }
      sessionId = await createEvolutionSession({
        userId: session.user.id,
        companyId: companyId || undefined,
        apiUrl,
        apiKey,
        instanceName,
        webhookUrl,
      });
    } else if (provider === 'meta') {
      const { phoneNumberId, accessToken, webhookToken } = body;
      if (!phoneNumberId || !accessToken) {
        return NextResponse.json({ error: 'phoneNumberId e accessToken são obrigatórios' }, { status: 400 });
      }
      sessionId = await createMetaSession({
        userId: session.user.id,
        companyId: companyId || undefined,
        phoneNumberId,
        accessToken,
        webhookToken: webhookToken || process.env.WHATSAPP_WEBHOOK_TOKEN || 'wnr_webhook',
      });
    } else {
      return NextResponse.json({ error: 'provider inválido (evolution ou meta)' }, { status: 400 });
    }

    return NextResponse.json({ sessionId, webhookUrl });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE: disconnect session
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  await prisma.whatsappSession.updateMany({
    where: { OR: [{ userId: session.user.id }, ...(companyId ? [{ companyId }] : [])] },
    data: { isActive: false, status: 'disconnected' },
  });

  return NextResponse.json({ ok: true });
}
