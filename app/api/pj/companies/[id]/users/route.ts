export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId: id } },
  });
  if (!uc) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });

  const users = await prisma.userCompany.findMany({
    where: { companyId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(users.map(u => ({ ...u.user, role: u.role, joinedAt: u.createdAt })));
}

export async function POST(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const uc = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId: id } },
  });
  if (!uc || !['OWNER', 'ADMIN'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão para convidar' }, { status: 403 });
  }

  const { email, role } = await req.json();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !role) return NextResponse.json({ error: 'Email e cargo são obrigatórios' }, { status: 400 });

  const targetUser = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });
  if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const existing = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: targetUser.id, companyId: id } },
  });
  if (existing) return NextResponse.json({ error: 'Usuário já pertence à empresa' }, { status: 409 });

  await prisma.userCompany.create({
    data: { userId: targetUser.id, companyId: id, role },
  });
  await prisma.user.update({ where: { id: targetUser.id }, data: { hasPJ: true } });

  return NextResponse.json({ ok: true }, { status: 201 });
}
