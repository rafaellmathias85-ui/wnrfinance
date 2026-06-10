export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bankingController } from '@/src/modules/banking/banking.controller';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const connection = await prisma.bankConnection.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!connection) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });

  return NextResponse.json({ connection });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const companyId =
    body.personType === 'PF'
      ? null
      : session.user.defaultEnv === 'pj'
        ? session.user.activeCompanyId || null
        : undefined;

  try {
    if (action === 'test') {
      const result = await bankingController.testConnection({
        userId: session.user.id,
        companyId,
        connectionId: params.id,
        request: req,
      });
      return NextResponse.json(result);
    }

    if (action === 'sync') {
      const result = await bankingController.syncConnection({
        userId: session.user.id,
        companyId,
        connectionId: params.id,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        request: req,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro na conexão bancária' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    await bankingController.removeConnection({
      userId: session.user.id,
      companyId: session.user.defaultEnv === 'pj' ? session.user.activeCompanyId || null : undefined,
      connectionId: params.id,
      request: req,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao remover conexão' }, { status: 500 });
  }
}
