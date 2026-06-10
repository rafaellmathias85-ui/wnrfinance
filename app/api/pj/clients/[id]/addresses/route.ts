export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  const { id } = params;
  const client = await prisma.client.findFirst({ where: { id, companyId } });
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const addresses = await prisma.clientAddress.findMany({ where: { clientId: id }, orderBy: { isPrimary: 'desc' } });
  return NextResponse.json(addresses);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  const { id } = params;
  const client = await prisma.client.findFirst({ where: { id, companyId } });
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  if (body.isPrimary) {
    await prisma.clientAddress.updateMany({ where: { clientId: id }, data: { isPrimary: false } });
  }
  const address = await prisma.clientAddress.create({
    data: {
      clientId: id,
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
  return NextResponse.json(address, { status: 201 });
}
