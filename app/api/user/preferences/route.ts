export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { hideAmounts: true },
    });
    return NextResponse.json({ hideAmounts: user?.hideAmounts ?? false });
  } catch (error) {
    console.error('Get preferences error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const body = await req.json();
    const updateData: any = {};
    if (typeof body.hideAmounts === 'boolean') updateData.hideAmounts = body.hideAmounts;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: { hideAmounts: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
