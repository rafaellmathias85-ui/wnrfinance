export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function checkAccess(userId: string, companyId: string) {
  return prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
}

export async function GET(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await checkAccess(session.user.id, id);
  if (!uc) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });

  const certificates = await prisma.companyCertificate.findMany({
    where: { companyId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ certificates });
}

export async function POST(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await checkAccess(session.user.id, id);
  if (!uc || !['OWNER', 'ADMIN'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json();
  const cert = await prisma.companyCertificate.create({
    data: {
      companyId: id,
      fileName: body.fileName || 'certificado.pfx',
      thumbprint: body.thumbprint || null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      cnpj: body.cnpj || null,
      uploadedBy: body.uploadedBy || session.user.id,
      isActive: true,
    },
  });
  return NextResponse.json({ certificate: cert }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await checkAccess(session.user.id, id);
  if (!uc || !['OWNER', 'ADMIN'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const certId = new URL(req.url).searchParams.get('certId');
  if (!certId) return NextResponse.json({ error: 'certId obrigatório' }, { status: 400 });

  await prisma.companyCertificate.deleteMany({
    where: { id: certId, companyId: id },
  });
  return NextResponse.json({ ok: true });
}
