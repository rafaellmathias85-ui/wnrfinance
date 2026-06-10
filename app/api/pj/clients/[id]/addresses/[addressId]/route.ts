export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function verifyAccess(companyId: string, clientId: string) {
  return prisma.client.findFirst({ where: { id: clientId, companyId } });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; addressId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  const { id, addressId } = params;
  if (!(await verifyAccess(companyId, id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  if (body.isPrimary) {
    await prisma.clientAddress.updateMany({ where: { clientId: id }, data: { isPrimary: false } });
  }
  const address = await prisma.clientAddress.update({
    where: { id: addressId },
    data: {
      cep: body.cep || null,
      logradouro: body.logradouro || null,
      numero: body.numero || null,
      complemento: body.complemento || null,
      bairro: body.bairro || null,
      cidade: body.cidade || null,
      estado: body.estado || null,
      isPrimary: body.isPrimary ?? false,
    },
  });
  return NextResponse.json(address);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; addressId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  const { id, addressId } = params;
  if (!(await verifyAccess(companyId, id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.clientAddress.delete({ where: { id: addressId } });
  return NextResponse.json({ ok: true });
}
