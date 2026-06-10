export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const { id } = params;
    const original = await prisma.accountsReceivable.findFirst({ where: { id, companyId } });
    if (!original) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const { id: _id, createdAt: _c, updatedAt: _u, receivedAt: _r, amountReceived: _ar, ...rest } = original;

    const duplicated = await prisma.accountsReceivable.create({
      data: {
        ...rest,
        status: 'pendente',
        createdBy: session.user.id,
        notes: original.notes ? `[Cópia] ${original.notes}` : '[Cópia]',
      },
    });

    return NextResponse.json(duplicated, { status: 201 });
  } catch (error: any) {
    console.error('[faturamento/[id]/duplicate POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
