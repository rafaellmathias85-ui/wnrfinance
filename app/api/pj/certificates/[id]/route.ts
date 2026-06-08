export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const cert = await prisma.companyCertificate.findFirst({ where: { id: params.id, companyId } });
  if (!cert) return NextResponse.json({ error: 'Certificado nao encontrado' }, { status: 404 });

  await prisma.companyCertificate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const cert = await prisma.companyCertificate.findFirst({ where: { id: params.id, companyId } });
  if (!cert) return NextResponse.json({ error: 'Certificado nao encontrado' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.companyCertificate.update({
    where: { id: params.id },
    data: { metadata: body.metadata ?? cert.metadata },
  });

  return NextResponse.json(updated);
}