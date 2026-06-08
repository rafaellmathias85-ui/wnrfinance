export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppText } from '@/lib/whatsapp';

// POST /api/whatsapp/send — manual send (for testing)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  const body = await req.json();
  const { to, message } = body;

  if (!to || !message) return NextResponse.json({ error: 'to e message são obrigatórios' }, { status: 400 });

  const wa = await prisma.whatsappSession.findFirst({
    where: {
      OR: [{ userId: session.user.id }, ...(companyId ? [{ companyId }] : [])],
      isActive: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!wa) return NextResponse.json({ error: 'Nenhuma sessão WhatsApp ativa' }, { status: 404 });

  const ok = await sendWhatsAppText(wa.id, to, message);

  if (ok) {
    await prisma.whatsappMessage.create({
      data: {
        sessionId: wa.id,
        direction: 'outbound',
        from: wa.phoneNumber || '',
        to,
        body: message,
        contextType: 'manual',
        processed: true,
      },
    });
  }

  return NextResponse.json({ ok });
}
