export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runReceivableAutomation } from '@/lib/receivable-automation';

// POST /api/pj/accounts-receivable/[id]/automate
// Body: { nfe?: boolean, boleto?: boolean }
// Dispara geração manual de NF-e e/ou Boleto para uma conta a receber
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const receivable = await prisma.accountsReceivable.findFirst({
    where: { id: params.id, companyId },
  });
  if (!receivable) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const opts = {
    nfe: body.nfe === true,
    boleto: body.boleto === true,
  };

  // Atualiza flags na conta se solicitado
  if (opts.nfe && !receivable.autoNfe) {
    await prisma.accountsReceivable.update({
      where: { id: params.id },
      data: { autoNfe: true },
    });
  }
  if (opts.boleto && !receivable.autoBoleto) {
    await prisma.accountsReceivable.update({
      where: { id: params.id },
      data: { autoBoleto: true },
    });
  }

  const result = await runReceivableAutomation(params.id, companyId, opts);
  if (result.nfe?.status === 'bloqueada') {
    return NextResponse.json({
      ok: false,
      error: result.nfe.errorMessage || 'NFS-e bloqueada por validacao fiscal',
      result,
    }, { status: 422 });
  }

  return NextResponse.json({ ok: true, result });
}
