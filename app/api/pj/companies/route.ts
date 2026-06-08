export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userCompanies = await prisma.userCompany.findMany({
    where: { userId: session.user.id },
    include: { company: true },
  });

  const companies = userCompanies.map(uc => ({
    id: uc.company.id,
    name: uc.company.name,
    cnpj: uc.company.cnpj,
    tradeName: uc.company.tradeName,
    role: uc.role,
  }));

  return NextResponse.json(companies);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const body = await req.json();
  const { name, cnpj, tradeName, address, phone, email: companyEmail } = body;

  if (!name || !cnpj) return NextResponse.json({ error: 'Nome e CNPJ são obrigatórios' }, { status: 400 });

  const existing = await prisma.company.findUnique({ where: { cnpj } });
  if (existing) return NextResponse.json({ error: 'CNPJ já cadastrado' }, { status: 409 });

  const company = await prisma.company.create({
    data: {
      name,
      cnpj,
      tradeName: tradeName || null,
      address: address || null,
      phone: phone || null,
      email: companyEmail || null,
      users: {
        create: {
          userId: session.user.id,
          role: 'OWNER',
        },
      },
    },
  });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { hasPJ: true, activeCompanyId: company.id, defaultEnv: 'pj' },
  });

  return NextResponse.json(company, { status: 201 });
}
