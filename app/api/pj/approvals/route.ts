export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const where: any = { companyId };
  if (status && status !== 'all') where.status = status;

  const approvals = await prisma.financialApproval.findMany({
    where,
    include: {
      requester: { select: { id: true, name: true, email: true } },
      approver: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ approvals });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const { type, referenceId, amount, description } = body;

  if (!type || !amount || !description) {
    return NextResponse.json({ error: 'type, amount e description são obrigatórios' }, { status: 400 });
  }

  const approval = await prisma.financialApproval.create({
    data: {
      companyId,
      type,
      referenceId: referenceId || '',
      requesterId: session.user.id,
      amount: parseFloat(amount),
      description,
      status: 'pending',
    },
  });

  return NextResponse.json(approval, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  // Only OWNER/ADMIN/FINANCE with "aprovar" permission
  const uc = await prisma.userCompany.findFirst({
    where: { userId: session.user.id, companyId },
  });
  if (!uc || !['OWNER', 'ADMIN', 'FINANCE'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão para aprovar' }, { status: 403 });
  }

  const body = await req.json();
  const { id, status, notes } = body;

  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'id e status (approved|rejected) obrigatórios' }, { status: 400 });
  }

  const updated = await prisma.financialApproval.updateMany({
    where: { id, companyId },
    data: { status, approverId: session.user.id, notes: notes || null },
  });

  if (updated.count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
