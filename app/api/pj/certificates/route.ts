export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET: list certificates for company
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const certificates = await prisma.companyCertificate.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(certificates);
}

// POST: upload certificate metadata (file goes to cloud storage separately)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await request.json();
  const { fileName, thumbprint, expiresAt, cnpj, cloudPath, metadata } = body;

  if (!fileName) {
    return NextResponse.json({ error: 'fileName é obrigatório' }, { status: 400 });
  }

  const certificate = await prisma.companyCertificate.create({
    data: {
      companyId,
      fileName,
      thumbprint: thumbprint || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      cnpj: cnpj || null,
      cloudPath: cloudPath || null,
      metadata: metadata || {},
      uploadedBy: session.user.id,
    },
  });

  return NextResponse.json(certificate, { status: 201 });
}
