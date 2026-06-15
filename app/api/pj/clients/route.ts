export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json([]);

  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const clientType = url.searchParams.get('clientType');

  const clients = await prisma.client.findMany({
    where: {
      companyId,
      isActive: true,
      ...(clientType ? { clientType } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { cnpj: { contains: search, mode: 'insensitive' } },
              { cpf: { contains: search, mode: 'insensitive' } },
              { document: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { contacts: { orderBy: { isBilling: 'desc' } }, addresses: { orderBy: { isPrimary: 'desc' } } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });
  const body = await req.json();
  const client = await prisma.client.create({
    data: {
      companyId,
      name: body.name,
      document: body.document || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      notes: body.notes || null,
      clientType: body.clientType || 'PJ',
      cnpj: body.cnpj || null,
      cpf: body.cpf || null,
      tradeName: body.tradeName || null,
      countryOrigin: body.countryOrigin || 'BR',
      stateRegistration: body.stateRegistration || null,
      stateRegistrationUF: body.stateRegistrationUF || null,
      municipalRegistration: body.municipalRegistration || null,
      activityBranch: body.activityBranch || null,
      simplesNacional: body.simplesNacional ?? false,
      ignoreIMNfse: body.ignoreIMNfse ?? false,
      rating: body.rating != null ? Number(body.rating) : 3,
      billingDaysAntecipation: body.billingDaysAntecipation ? Number(body.billingDaysAntecipation) : null,
      billingDay: body.billingDay ? Number(body.billingDay) : null,
      nfseEmissionMode: body.nfseEmissionMode || 'company',
      portalSupportEnabled: body.portalSupportEnabled ?? true,
      portalFinanceEnabled: body.portalFinanceEnabled ?? true,
    },
    include: { contacts: true, addresses: true },
  });
  return NextResponse.json(client, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 });
  await prisma.client.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
