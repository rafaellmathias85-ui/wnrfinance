export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { id } = await params;
  const client = await prisma.client.findFirst({ where: { id, companyId } });
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

  // Upsert portal token
  const token = await prisma.clientPortalToken.upsert({
    where: { clientId: id },
    update: { isActive: true },
    create: { clientId: id, companyId },
  });

  return NextResponse.json({ token: token.token });
}

export async function DELETE(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { id } = await params;
  await prisma.clientPortalToken.updateMany({
    where: { clientId: id, companyId },
    data: { isActive: false },
  });
  return NextResponse.json({ ok: true });
}
