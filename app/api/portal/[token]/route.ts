export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: any) {
  const { token } = await params;

  const portalToken = await prisma.clientPortalToken.findUnique({
    where: { token },
    include: {
      client: {
        include: { company: { select: { name: true, tradeName: true, email: true, phone: true } } },
      },
    },
  });

  if (!portalToken || !portalToken.isActive) {
    return NextResponse.json({ error: 'Link de acesso inválido ou expirado' }, { status: 404 });
  }
  if (portalToken.expiresAt && portalToken.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link de acesso expirado' }, { status: 410 });
  }

  const { clientId, companyId } = portalToken;

  // Load receivables for this client
  const receivables = await prisma.accountsReceivable.findMany({
    where: { companyId, customerName: portalToken.client.name },
    orderBy: { dueDate: 'desc' },
    take: 50,
    select: {
      id: true,
      description: true,
      amount: true,
      amountReceived: true,
      dueDate: true,
      receivedAt: true,
      status: true,
      notes: true,
    },
  });

  return NextResponse.json({
    client: {
      id: portalToken.client.id,
      name: portalToken.client.name,
      email: portalToken.client.email,
      phone: portalToken.client.phone,
    },
    company: portalToken.client.company,
    receivables,
  });
}
