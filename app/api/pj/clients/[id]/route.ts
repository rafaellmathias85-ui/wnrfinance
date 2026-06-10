export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

  const { id } = params;
  const client = await prisma.client.findFirst({
    where: { id, companyId },
    include: { addresses: { orderBy: { isPrimary: 'desc' } }, contacts: { orderBy: { isBilling: 'desc' } } },
  });
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

  const { id } = params;
  const exists = await prisma.client.findFirst({ where: { id, companyId } });
  if (!exists) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const client = await prisma.client.update({
    where: { id },
    data: {
      name: body.name ?? exists.name,
      document: body.document ?? exists.document,
      email: body.email ?? exists.email,
      phone: body.phone ?? exists.phone,
      address: body.address ?? exists.address,
      city: body.city ?? exists.city,
      state: body.state ?? exists.state,
      notes: body.notes ?? exists.notes,
      countryOrigin: body.countryOrigin ?? exists.countryOrigin,
      tradeName: body.tradeName ?? exists.tradeName,
      cnpj: body.cnpj ?? exists.cnpj,
      cpf: body.cpf ?? exists.cpf,
      clientType: body.clientType ?? exists.clientType,
      stateRegistration: body.stateRegistration ?? exists.stateRegistration,
      stateRegistrationUF: body.stateRegistrationUF ?? exists.stateRegistrationUF,
      municipalRegistration: body.municipalRegistration ?? exists.municipalRegistration,
      activityBranch: body.activityBranch ?? exists.activityBranch,
      simplesNacional: body.simplesNacional ?? exists.simplesNacional,
      ignoreIMNfse: body.ignoreIMNfse ?? exists.ignoreIMNfse,
      rating: body.rating != null ? Number(body.rating) : exists.rating,
      billingDaysAntecipation: body.billingDaysAntecipation != null ? Number(body.billingDaysAntecipation) : exists.billingDaysAntecipation,
      billingDay: body.billingDay != null ? Number(body.billingDay) : exists.billingDay,
      nfseEmissionMode: body.nfseEmissionMode ?? exists.nfseEmissionMode,
      portalSupportEnabled: body.portalSupportEnabled ?? exists.portalSupportEnabled,
      portalFinanceEnabled: body.portalFinanceEnabled ?? exists.portalFinanceEnabled,
    },
    include: { addresses: true, contacts: true },
  });
  return NextResponse.json(client);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;

  const { id } = params;
  await prisma.client.update({ where: { id, companyId } as any, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
