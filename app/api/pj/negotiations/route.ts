import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json([]);

    const { searchParams } = new URL(req.url);
    const customer = searchParams.get('customer');
    const receivableId = searchParams.get('receivableId');

    const where: any = { companyId };
    if (customer) where.customerName = customer;
    if (receivableId) where.receivableId = receivableId;

    const negotiations = await prisma.receivableNegotiation.findMany({
      where,
      include: { receivable: { select: { id: true, description: true, amount: true, dueDate: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(negotiations);
  } catch (error) {
    console.error('Error fetching negotiations:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });

    const body = await req.json();
    const {
      receivableId,
      customerName,
      customerDoc,
      contactName,
      contactPhone,
      contactEmail,
      originalAmount,
      newAmount,
      newDueDate,
      installments,
      interestRate,
      discount,
      notes,
      nextContact,
      status,
    } = body;

    if (!customerName || !newAmount || !newDueDate) {
      return NextResponse.json({ error: 'Cliente, novo valor e nova data são obrigatórios' }, { status: 400 });
    }

    // Validate receivable belongs to company if provided
    if (receivableId) {
      const r = await prisma.accountsReceivable.findFirst({ where: { id: receivableId, companyId } });
      if (!r) return NextResponse.json({ error: 'Título não encontrado' }, { status: 404 });
    }

    const negotiation = await prisma.receivableNegotiation.create({
      data: {
        companyId,
        receivableId: receivableId || null,
        customerName,
        customerDoc: customerDoc || null,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        originalAmount: parseFloat(originalAmount),
        newAmount: parseFloat(newAmount),
        newDueDate: new Date(newDueDate),
        installments: parseInt(installments || '1'),
        interestRate: interestRate ? parseFloat(interestRate) : 0,
        discount: discount ? parseFloat(discount) : 0,
        status: status || 'negociado',
        notes: notes || null,
        nextContact: nextContact ? new Date(nextContact) : null,
        createdBy: session.user.id,
      },
    });

    // If a receivable is linked, update its due date and amount
    if (receivableId) {
      await prisma.accountsReceivable.update({
        where: { id: receivableId },
        data: {
          dueDate: new Date(newDueDate),
          amount: parseFloat(newAmount),
          notes: notes || undefined,
        },
      });
    }

    return NextResponse.json(negotiation, { status: 201 });
  } catch (error) {
    console.error('Error creating negotiation:', error);
    return NextResponse.json({ error: 'Erro ao criar negociação' }, { status: 500 });
  }
}
