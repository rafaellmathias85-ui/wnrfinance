export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function verifyAccess(companyId: string, clientId: string) {
  return prisma.client.findFirst({ where: { id: clientId, companyId } });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; contactId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  const { id, contactId } = params;
  if (!(await verifyAccess(companyId, id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const contact = await prisma.clientContact.update({
    where: { id: contactId },
    data: { name: body.name, email: body.email || null, phone: body.phone || null, isBilling: body.isBilling ?? false },
  });
  return NextResponse.json(contact);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; contactId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  const { id, contactId } = params;
  if (!(await verifyAccess(companyId, id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.clientContact.delete({ where: { id: contactId } });
  return NextResponse.json({ ok: true });
}
