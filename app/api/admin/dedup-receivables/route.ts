export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/admin/dedup-receivables
 * Remove duplicatas de contas a receber recorrentes pendentes.
 * Para cada combinação (companyId, customerDoc, amount, dueDate) com mais de 1 entrada
 * pendente e recorrente, mantém a mais antiga e exclui as demais.
 * Restrito a administradores.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if ((session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Restrito a administradores' }, { status: 403 });
  }

  // Busca todos os pendentes recorrentes agrupáveis
  const candidates = await prisma.accountsReceivable.findMany({
    where: { status: 'pendente', isRecurring: true },
    select: {
      id: true,
      companyId: true,
      customerDoc: true,
      customerName: true,
      amount: true,
      dueDate: true,
      createdAt: true,
      recurrenceId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Agrupa por chave canônica
  const groups = new Map<string, typeof candidates>();
  for (const r of candidates) {
    const dueDateDay = r.dueDate.toISOString().slice(0, 10);
    const key = `${r.companyId}|${r.customerDoc ?? r.customerName ?? ''}|${r.amount}|${dueDateDay}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  const toDelete: string[] = [];
  let dupGroups = 0;

  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    dupGroups++;
    // Mantém o mais antigo (index 0, já ordenado por createdAt asc)
    const [, ...extras] = group;
    toDelete.push(...extras.map(e => e.id));
  }

  if (toDelete.length === 0) {
    return NextResponse.json({ deleted: 0, dupGroups: 0, message: 'Nenhuma duplicata encontrada.' });
  }

  const { count } = await prisma.accountsReceivable.deleteMany({
    where: { id: { in: toDelete }, status: 'pendente' },
  });

  return NextResponse.json({
    deleted: count,
    dupGroups,
    message: `${count} duplicata(s) removida(s) em ${dupGroups} grupo(s).`,
  });
}
