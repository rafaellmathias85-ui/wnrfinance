export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH: Upgrade/downgrade PJ Full
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  // Verify user is OWNER or ADMIN of company
  const membership = await prisma.userCompany.findFirst({
    where: { userId: session.user.id, companyId: params.id, role: { in: ['OWNER', 'ADMIN'] } },
  });
  if (!membership && !['admin', 'master'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Sem permissão. Apenas OWNER ou ADMIN.' }, { status: 403 });
  }

  const body = await request.json();
  const { activate, plan, reason } = body;

  const company = await prisma.company.findUnique({ where: { id: params.id } });
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });

  const previousState = {
    isPjFull: company.isPjFull,
    pjFullPlan: company.pjFullPlan,
    pjFullActivatedAt: company.pjFullActivatedAt,
  };

  const updated = await prisma.company.update({
    where: { id: params.id },
    data: {
      isPjFull: activate === true,
      pjFullPlan: activate ? (plan || 'PJ_FULL_PRO') : null,
      pjFullActivatedAt: activate ? new Date() : null,
    },
  });

  // Log the upgrade
  await prisma.companyUpgradeLog.create({
    data: {
      companyId: params.id,
      previousState,
      newState: {
        isPjFull: updated.isPjFull,
        pjFullPlan: updated.pjFullPlan,
        pjFullActivatedAt: updated.pjFullActivatedAt,
      },
      changedBy: session.user.id,
      reason: reason || (activate ? 'Upgrade para PJ Full' : 'Downgrade de PJ Full'),
    },
  });

  return NextResponse.json(updated);
}

// GET: Upgrade logs
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const logs = await prisma.companyUpgradeLog.findMany({
    where: { companyId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(logs);
}
