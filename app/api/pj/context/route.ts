export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const body = await req.json();
  const { action, env, companyId } = body;

  if (action === 'switchEnv') {
    await prisma.user.update({ where: { id: session.user.id }, data: { defaultEnv: env } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'switchCompany') {
    const uc = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
      select: { role: true },
    });
    if (!uc) return NextResponse.json({ error: 'Sem acesso à empresa' }, { status: 403 });
    await prisma.user.update({ where: { id: session.user.id }, data: { activeCompanyId: companyId } });
    return NextResponse.json({ ok: true, role: uc.role });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
