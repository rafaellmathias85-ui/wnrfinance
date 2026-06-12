export const dynamic = 'force-dynamic';

// Regras de conciliação por conta bancária (paridade BomControle:
// "Texto Conciliação" no cadastro da conta). CRUD completo.
// GET    /api/reconciliation/rules?connectionId=
// POST   /api/reconciliation/rules        { type, matchText, exactMatch, ... }
// PUT    /api/reconciliation/rules        { id, ...campos }
// DELETE /api/reconciliation/rules?id=

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit-log';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope') || 'pj';
  const companyId = scope === 'pj' ? session.user.activeCompanyId : null;

  const rules = await prisma.bankReconciliationRule.findMany({
    where: {
      userId: session.user.id,
      companyId,
      ...(searchParams.get('connectionId') ? { bankConnectionId: searchParams.get('connectionId') } : {}),
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { type, matchText } = body;
    if (!type || !['RECEITA', 'DESPESA'].includes(type) || !matchText?.trim()) {
      return NextResponse.json({ error: 'type (RECEITA/DESPESA) e matchText são obrigatórios' }, { status: 400 });
    }

    const scope = body.scope || 'pj';
    const companyId = scope === 'pj' ? session.user.activeCompanyId : null;

    const rule = await prisma.bankReconciliationRule.create({
      data: {
        userId: session.user.id,
        companyId,
        bankConnectionId: body.bankConnectionId || null,
        type,
        matchText: matchText.trim(),
        exactMatch: !!body.exactMatch,
        categoryId: body.categoryId || null,
        clientId: body.clientId || null,
        supplierId: body.supplierId || null,
        costCenterId: body.costCenterId || null,
        paymentMethod: body.paymentMethod || null,
        priority: body.priority ?? 0,
        createdBy: session.user.id,
      },
    });

    await createAuditLog({
      userId: session.user.id,
      companyId,
      action: 'CREATE',
      entity: 'reconciliation',
      entityId: rule.id,
      metadata: { event: 'rule_created', matchText: rule.matchText, type: rule.type },
      request: req,
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error: any) {
    console.error('POST reconciliation rule error:', error);
    return NextResponse.json({ error: 'Erro ao criar regra' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const existing = await prisma.bankReconciliationRule.findFirst({
      where: { id: body.id, userId: session.user.id },
    });
    if (!existing) return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 });

    const rule = await prisma.bankReconciliationRule.update({
      where: { id: existing.id },
      data: {
        ...(body.type ? { type: body.type } : {}),
        ...(body.matchText !== undefined ? { matchText: String(body.matchText).trim() } : {}),
        ...(body.exactMatch !== undefined ? { exactMatch: !!body.exactMatch } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId || null } : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId || null } : {}),
        ...(body.supplierId !== undefined ? { supplierId: body.supplierId || null } : {}),
        ...(body.costCenterId !== undefined ? { costCenterId: body.costCenterId || null } : {}),
        ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod || null } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
        ...(body.bankConnectionId !== undefined ? { bankConnectionId: body.bankConnectionId || null } : {}),
      },
    });
    return NextResponse.json(rule);
  } catch (error: any) {
    console.error('PUT reconciliation rule error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar regra' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  await prisma.bankReconciliationRule.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
