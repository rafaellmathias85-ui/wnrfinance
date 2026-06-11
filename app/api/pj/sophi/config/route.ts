export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getCompanyId(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { activeCompanyId: true } });
  return user?.activeCompanyId ?? null;
}

async function checkAccess(userId: string, companyId: string) {
  return prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = await getCompanyId(session.user.id);
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const uc = await checkAccess(session.user.id, companyId);
  if (!uc) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { features: true },
  });

  const config = ((company?.features as any)?.sophi) || {
    extraInstructions: '',
    dailyTasks: [],
    reminders: [],
    alertRules: [],
  };

  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = await getCompanyId(session.user.id);
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const uc = await checkAccess(session.user.id, companyId);
  if (!uc || !['OWNER', 'ADMIN', 'FINANCE'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json();
  const { extraInstructions, dailyTasks, reminders, alertRules } = body;

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { features: true } });
  const existingFeatures = (company?.features as any) || {};

  await prisma.company.update({
    where: { id: companyId },
    data: {
      features: {
        ...existingFeatures,
        sophi: {
          extraInstructions: extraInstructions ?? existingFeatures.sophi?.extraInstructions ?? '',
          dailyTasks: dailyTasks ?? existingFeatures.sophi?.dailyTasks ?? [],
          reminders: reminders ?? existingFeatures.sophi?.reminders ?? [],
          alertRules: alertRules ?? existingFeatures.sophi?.alertRules ?? [],
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
