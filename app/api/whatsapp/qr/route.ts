export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEvolutionQR } from '@/lib/whatsapp';

// GET /api/whatsapp/qr — fetch latest QR code for Evolution API
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  const wa = await prisma.whatsappSession.findFirst({
    where: {
      OR: [{ userId: session.user.id }, ...(companyId ? [{ companyId }] : [])],
      provider: 'evolution',
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!wa) return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });

  const result = await getEvolutionQR(wa.id);
  return NextResponse.json(result);
}
