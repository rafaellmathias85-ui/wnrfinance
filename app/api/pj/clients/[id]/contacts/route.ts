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
  const contacts = await prisma.clientContact.findMany({ where: { clientId: id }, orderBy: { isBilling: 'desc' } });
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  const { id } = params;
  const client = await prisma.client.findFirst({ where: { id, companyId } });
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const contact = await prisma.clientContact.create({
    data: {
      clientId: id,
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      isBilling: body.isBilling ?? false,
    },
  });
  return NextResponse.json(contact, { status: 201 });
}
