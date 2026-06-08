export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const isPJ = session.user.defaultEnv === 'pj' && session.user.activeCompanyId;
    const ownerWhere = isPJ
      ? { id: params.id, companyId: session.user.activeCompanyId }
      : { id: params.id, userId: session.user.id };

    const existing = await prisma.expense.findFirst({ where: ownerWhere });
    if (!existing) return NextResponse.json({ error: 'Despesa não encontrada' }, { status: 404 });

    const body = await request.json();
    const updateData: any = {};

    if (body.description !== undefined) updateData.description = body.description;
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount);
    if (body.category !== undefined) updateData.category = body.category;
    if (body.date !== undefined) updateData.date = new Date(body.date);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.bankConnectionId !== undefined) updateData.bankConnectionId = body.bankConnectionId || null;
    if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod || null;
    if (body.boletoCode !== undefined) updateData.boletoCode = body.paymentMethod === 'BOLETO' ? (body.boletoCode || null) : null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.isRecurring !== undefined) {
      updateData.isRecurring = body.isRecurring;
      updateData.recurrenceType = body.isRecurring ? (body.recurrenceType || 'mensal') : null;
    }

    if (body.attachmentUrl !== undefined) updateData.attachmentUrl = body.attachmentUrl || null;

    await prisma.expense.update({ where: { id: params.id }, data: updateData });

    // Se pediu para atualizar banco em futuros recorrentes
    if (body.updateFutureBank && existing.isRecurring && updateData.bankConnectionId !== undefined) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const baseWhere: any = isPJ
        ? { companyId: session.user.activeCompanyId }
        : { userId: session.user.id };

      await prisma.expense.updateMany({
        where: {
          ...baseWhere,
          description: existing.description,
          category: existing.category,
          isRecurring: true,
          date: { gt: existing.date },
          status: { in: ['pendente', 'agendado'] },
        },
        data: { bankConnectionId: updateData.bankConnectionId },
      });
    }

    // Vincular tags se fornecidas
    if (body.tags !== undefined && Array.isArray(body.tags)) {
      await prisma.expenseTag.deleteMany({ where: { expenseId: params.id } });
      if (body.tags.length > 0) {
        await prisma.expenseTag.createMany({
          data: body.tags.map((tagId: string) => ({ expenseId: params.id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PUT expense error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar despesa' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const isPJ = session.user.defaultEnv === 'pj' && session.user.activeCompanyId;
    const ownerWhere = isPJ
      ? { id: params.id, companyId: session.user.activeCompanyId }
      : { id: params.id, userId: session.user.id };

    const expense = await prisma.expense.findFirst({ where: ownerWhere });
    if (!expense) return NextResponse.json({ error: 'Despesa não encontrada' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const deleteFuture = searchParams.get('deleteFuture') === 'true';

    // Se é recorrente e pediu pra deletar futuras, exclui todas com mesma descrição/categoria pendentes do mês atual em diante
    if (deleteFuture && expense.isRecurring) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const baseWhere: any = isPJ
        ? { companyId: session.user.activeCompanyId }
        : { userId: session.user.id };

      await prisma.expense.deleteMany({
        where: {
          ...baseWhere,
          description: expense.description,
          category: expense.category,
          isRecurring: true,
          date: { gte: startOfMonth },
          status: { in: ['pendente', 'agendado'] },
        },
      });
      return NextResponse.json({ success: true, deletedFuture: true });
    }

    // Se é parcelamento e pediu pra deletar futuras, exclui todas do grupo
    if (deleteFuture && expense.installmentGroupId) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      await prisma.expense.deleteMany({
        where: {
          installmentGroupId: expense.installmentGroupId,
          date: { gte: startOfMonth },
          status: { in: ['pendente', 'agendado'] },
        },
      });
      return NextResponse.json({ success: true, deletedFuture: true });
    }

    // Exclusão simples
    await prisma.expense.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE expense error:', error);
    return NextResponse.json({ error: 'Erro ao excluir despesa' }, { status: 500 });
  }
}
