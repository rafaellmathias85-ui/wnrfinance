export const dynamic = 'force-dynamic';

// Reajuste de contrato (paridade BomControle: histórico data/usuário/índice/antes→depois).
// POST /api/pj/contracts/[id]/adjust  { percent, index?, notes? }
// - Atualiza o valor do contrato
// - Reajusta SOMENTE parcelas PREVISTAS (faturadas/quitadas são imutáveis)
// - Registra ContractAdjustmentLog e avança nextAdjustmentDate
// GET → histórico de reajustes

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit-log';
import { applyPercent, sumMoney } from '@/lib/money';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.activeCompanyId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const logs = await prisma.contractAdjustmentLog.findMany({
    where: { contractId: params.id, contract: { companyId: session.user.activeCompanyId } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.activeCompanyId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const companyId = session.user.activeCompanyId;

  try {
    const body = await req.json();
    const percent = Number(body.percent);
    if (!Number.isFinite(percent) || percent === 0 || Math.abs(percent) > 100) {
      return NextResponse.json({ error: 'Percentual de reajuste inválido (−100 a 100, ≠ 0)' }, { status: 400 });
    }

    const contract = await prisma.contract.findFirst({ where: { id: params.id, companyId } });
    if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    if (contract.status !== 'ativo') {
      return NextResponse.json({ error: 'Apenas contratos ativos podem ser reajustados' }, { status: 422 });
    }

    const valueBefore = contract.value;
    const valueAfter = sumMoney(valueBefore, applyPercent(valueBefore, percent));

    // Próxima data de reajuste conforme o período configurado
    const nextAdjustment = new Date();
    if ((contract.adjustmentPeriod || 'ANUAL') === 'MENSAL') nextAdjustment.setMonth(nextAdjustment.getMonth() + 1);
    else nextAdjustment.setFullYear(nextAdjustment.getFullYear() + 1);

    const result = await prisma.$transaction(async (trx) => {
      // 1. Valor novo no contrato
      await trx.contract.update({
        where: { id: contract.id },
        data: { value: valueAfter, nextAdjustmentDate: nextAdjustment },
      });

      // 2. Reajusta SOMENTE parcelas futuras não faturadas
      const previstas = await trx.accountsReceivable.findMany({
        where: {
          companyId,
          sourceType: 'contract',
          sourceId: contract.id,
          billingStatus: 'PREVISTA',
        },
        select: { id: true, amount: true },
      });
      for (const p of previstas) {
        const newAmount = sumMoney(p.amount, applyPercent(p.amount, percent));
        await trx.accountsReceivable.update({ where: { id: p.id }, data: { amount: newAmount } });
      }

      // 3. Histórico de reajuste (antes → depois)
      const log = await trx.contractAdjustmentLog.create({
        data: {
          contractId: contract.id,
          appliedBy: session.user.id,
          indexUsed: body.index || 'MANUAL',
          percentApplied: percent,
          valueBefore,
          valueAfter,
          installmentsAffected: previstas.length,
          notes: body.notes || null,
        },
      });

      return { log, installmentsAffected: previstas.length };
    });

    await createAuditLog({
      userId: session.user.id,
      companyId,
      action: 'UPDATE',
      entity: 'receivable',
      entityId: contract.id,
      metadata: {
        event: 'contract_adjustment',
        percent,
        valueBefore,
        valueAfter,
        installmentsAffected: result.installmentsAffected,
      },
      request: req,
    });

    return NextResponse.json({
      ok: true,
      valueBefore,
      valueAfter,
      installmentsAffected: result.installmentsAffected,
      log: result.log,
    });
  } catch (error: any) {
    console.error('POST contract adjust error:', error);
    return NextResponse.json({ error: 'Erro ao reajustar contrato' }, { status: 500 });
  }
}
