export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createCharge } from '@/lib/boleto';
import { createAuditLog } from '@/lib/audit-log';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = { companyId: session.user.activeCompanyId };
    if (status) where.status = status;
    if (type) where.type = type;

    const [charges, total] = await Promise.all([
      prisma.boletoCharge.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.boletoCharge.count({ where }),
    ]);

    return NextResponse.json({ charges, total, page, pages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: 'Erro ao buscar cobranças' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId;
    const body = await request.json();
    const { type, customerName, customerDoc, customerEmail, amount, dueDate, description, instructions, receivableId, emit } = body;

    if (!customerName || !customerDoc || !amount || !dueDate) {
      return NextResponse.json({ error: 'Campos obrigatórios: cliente, CPF/CNPJ, valor e vencimento' }, { status: 400 });
    }

    // ── Idempotência (previne dupla cobrança ao cliente final) ──────────────
    // 1) Header Idempotency-Key (retry de rede / duplo clique): retorna a cobrança já criada.
    const idempotencyKey = request.headers.get('idempotency-key') || null;
    if (idempotencyKey) {
      const existingByKey = await prisma.boletoCharge.findUnique({
        where: { idempotencyKey },
      });
      if (existingByKey) {
        return NextResponse.json({ ...existingByKey, idempotent: true }, { status: 200 });
      }
    }

    // 2) Guard por recebível: bloqueia segunda cobrança ativa para o mesmo receivableId.
    if (receivableId) {
      const existingForReceivable = await prisma.boletoCharge.findFirst({
        where: {
          companyId,
          receivableId,
          status: { in: ['pendente', 'pago'] },
        },
      });
      if (existingForReceivable) {
        return NextResponse.json(
          {
            error: 'Já existe uma cobrança ativa para este recebível.',
            existingChargeId: existingForReceivable.id,
            existingStatus: existingForReceivable.status,
          },
          { status: 409 }
        );
      }
    }

    // Create record
    let charge;
    try {
      charge = await prisma.boletoCharge.create({
        data: {
          companyId,
          receivableId: receivableId || null,
          type: type || 'boleto',
          status: 'pendente',
          customerName,
          customerDoc,
          customerEmail: customerEmail || null,
          amount: parseFloat(amount),
          dueDate: new Date(dueDate),
          description: description || null,
          instructions: instructions || null,
          createdBy: session.user.id,
          idempotencyKey,
        },
      });
    } catch (err: any) {
      // Corrida entre requisições com a mesma Idempotency-Key → retorna a vencedora
      if (err?.code === 'P2002' && idempotencyKey) {
        const winner = await prisma.boletoCharge.findUnique({ where: { idempotencyKey } });
        if (winner) return NextResponse.json({ ...winner, idempotent: true }, { status: 200 });
      }
      throw err;
    }

    if (emit) {
      const result = await createCharge(companyId, {
        type: type || 'boleto',
        customerName,
        customerDoc,
        customerEmail,
        amount: parseFloat(amount),
        dueDate,
        description,
        instructions,
        externalId: charge.id,
      });

      await prisma.boletoCharge.update({
        where: { id: charge.id },
        data: {
          providerChargeId: result.providerChargeId || null,
          boletoBarCode: result.boletoBarCode || null,
          boletoUrl: result.boletoUrl || null,
          pixCopiaECola: result.pixCopiaECola || null,
          pixQrCodeUrl: result.pixQrCodeUrl || null,
          pixExpiresAt: result.pixExpiresAt || null,
          status: result.success ? 'pendente' : 'cancelado',
        },
      });

      await createAuditLog({ userId: session.user.id, companyId, action: 'SEND', entity: 'boleto', entityId: charge.id, request });

      if (!result.success) {
        return NextResponse.json({ ...charge, errorMessage: result.errorMessage }, { status: 422 });
      }
      return NextResponse.json({ ...charge, ...result }, { status: 201 });
    }

    await createAuditLog({ userId: session.user.id, companyId, action: 'CREATE', entity: 'boleto', entityId: charge.id, request });
    return NextResponse.json(charge, { status: 201 });
  } catch (error: any) {
    console.error('POST cobrança error:', error);
    return NextResponse.json({ error: 'Erro ao criar cobrança' }, { status: 500 });
  }
}
