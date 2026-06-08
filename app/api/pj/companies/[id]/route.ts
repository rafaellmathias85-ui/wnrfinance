export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getCompanyAccess(userId: string, companyId: string) {
  return prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: { company: true },
  });
}

export async function GET(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await getCompanyAccess(session.user.id, id);
  if (!uc) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });
  return NextResponse.json(uc.company);
}

export async function PUT(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await getCompanyAccess(session.user.id, id);
  if (!uc || !['OWNER', 'ADMIN'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }
  const body = await req.json();
  const updated = await prisma.company.update({
    where: { id },
    data: {
      name: body.name,
      tradeName: body.tradeName,
      address: body.address,
      phone: body.phone,
      email: body.email,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await getCompanyAccess(session.user.id, id);
  if (!uc || uc.role !== 'OWNER') {
    return NextResponse.json({ error: 'Apenas o proprietário pode excluir' }, { status: 403 });
  }
  // Soft delete - remove all user associations
  await prisma.userCompany.deleteMany({ where: { companyId: id } });
  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
