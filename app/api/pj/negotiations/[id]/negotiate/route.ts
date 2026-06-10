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

    const { id: clientId } = params;
    const body = await req.json();
    const { receivableId, penalty = 0, interest = 0, discount = 0, totalAmount, paymentMethod, bankConnectionId, forecastDate, nextContactAt, notes } = body;

    const negotiation = await prisma.debtNegotiation.create({
      data: {
        companyId,
        clientId: clientId || null,
        receivableId: receivableId || null,
        userId: session.user.id,
        type: 'renegotiated',
        penalty: parseFloat(penalty) || 0,
        interest: parseFloat(interest) || 0,
        discount: parseFloat(discount) || 0,
        totalAmount: totalAmount ? parseFloat(totalAmount) : null,
        paymentMethod: paymentMethod || null,
        bankConnectionId: bankConnectionId || null,
        forecastDate: forecastDate ? new Date(forecastDate) : null,
        nextContactAt: nextContactAt ? new Date(nextContactAt) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json(negotiation, { status: 201 });
  } catch (error: any) {
    console.error('[negotiations/negotiate POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
