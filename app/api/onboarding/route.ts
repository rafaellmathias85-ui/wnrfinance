export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const progress = await prisma.onboardingProgress.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json(progress || { currentStep: 0, completedAt: null, dismissed: false, stepsData: {} });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar progresso' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const { currentStep, dismissed, stepsData, completed } = body;

    const data: any = {};
    if (currentStep !== undefined) data.currentStep = currentStep;
    if (dismissed !== undefined) data.dismissed = dismissed;
    if (stepsData !== undefined) data.stepsData = stepsData;
    if (completed) data.completedAt = new Date();

    const progress = await prisma.onboardingProgress.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, env: session.user.defaultEnv || 'pf', ...data },
      update: data,
    });

    return NextResponse.json(progress);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar progresso' }, { status: 500 });
  }
}
