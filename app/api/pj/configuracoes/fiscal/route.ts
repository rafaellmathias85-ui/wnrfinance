export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { features: true },
  });

  const features = (company?.features as Record<string, any>) ?? {};
  return NextResponse.json(features.fiscal ?? {});
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const uc = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId } },
  });
  if (!uc || !['OWNER', 'ADMIN'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { features: true },
  });
  const existingFeatures = (company?.features as Record<string, any>) ?? {};

  const fiscal = {
    regimeTributario: body.regimeTributario ?? null,
    inscricaoEstadual: body.inscricaoEstadual ?? null,
    inscricaoMunicipal: body.inscricaoMunicipal ?? null,
    cnae: body.cnae ?? null,
    aliquotaDas: body.aliquotaDas ?? null,
    nfeSerie: body.nfeSerie ?? '1',
    nfceSerie: body.nfceSerie ?? '65',
    nfceCsc: body.nfceCsc ?? null,
    nfceCscId: body.nfceCscId ?? null,
    sefazEnvironment: body.sefazEnvironment ?? 'producao',
  };

  await prisma.company.update({
    where: { id: companyId },
    data: { features: { ...existingFeatures, fiscal } },
  });

  return NextResponse.json(fiscal);
}
