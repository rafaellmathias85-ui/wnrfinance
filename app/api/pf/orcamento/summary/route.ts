export const dynamic = 'force-dynamic';

/**
 * GET /api/pf/orcamento/summary?year=2026&month=6
 *
 * Retorna comparativo Planejado vs Realizado por grupo/subgrupo
 * e os KPIs: Resultado, Poupança, Pocket Margin e Taxa de Poupança.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const month = Number(searchParams.get('month')) || new Date().getMonth() + 1;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const [budgets, transactions] = await Promise.all([
    prisma.pfBudget.findMany({
      where: { userId: session.user.id, year, month },
    }),
    prisma.pfTransaction.findMany({
      where: { userId: session.user.id, date: { gte: startDate, lte: endDate } },
    }),
  ]);

  // Agrupa realizado por group+subgroup
  const realizedMap = new Map<string, number>();
  for (const tx of transactions) {
    const key = `${tx.group}||${tx.subgroup}`;
    realizedMap.set(key, (realizedMap.get(key) ?? 0) + Number(tx.amount));
  }

  // Monta linhas do orçamento
  const rows = budgets.map((b) => {
    const key = `${b.group}||${b.subgroup}`;
    const realized = realizedMap.get(key) ?? 0;
    const planned = Number(b.planned);
    const diff = realized - planned;
    const diffPct = planned !== 0 ? (diff / Math.abs(planned)) * 100 : 0;
    return {
      id: b.id,
      group: b.group,
      subgroup: b.subgroup,
      type: b.type,
      planned,
      realized,
      diff,
      diffPct: Math.round(diffPct * 10) / 10,
    };
  });

  // Subgrupos realizados sem orçamento planejado
  for (const [key, realized] of realizedMap.entries()) {
    const [group, subgroup] = key.split('||');
    const exists = rows.find((r) => r.group === group && r.subgroup === subgroup);
    if (!exists) {
      const type = group === 'Receita' ? 'income' : group === 'Poupança' ? 'savings' : 'expense';
      rows.push({ id: '', group, subgroup, type, planned: 0, realized, diff: realized, diffPct: 0 });
    }
  }

  // KPIs
  const incomeRealized = transactions
    .filter((t) => t.group === 'Receita')
    .reduce((s, t) => s + Number(t.amount), 0);

  const expenseRealized = transactions
    .filter((t) => t.group !== 'Receita' && t.group !== 'Poupança')
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const savingsRealized = transactions
    .filter((t) => t.group === 'Poupança')
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const resultado = incomeRealized - expenseRealized;
  const pocketMargin = resultado - savingsRealized;
  const savingsRate = incomeRealized > 0 ? (savingsRealized / incomeRealized) * 100 : 0;

  const incomePlanned = budgets
    .filter((b) => b.type === 'income')
    .reduce((s, b) => s + Number(b.planned), 0);

  const expensePlanned = budgets
    .filter((b) => b.type === 'expense')
    .reduce((s, b) => s + Number(b.planned), 0);

  const savingsPlanned = budgets
    .filter((b) => b.type === 'savings')
    .reduce((s, b) => s + Number(b.planned), 0);

  return NextResponse.json({
    year,
    month,
    rows,
    kpis: {
      incomeRealized,
      incomePlanned,
      expenseRealized,
      expensePlanned,
      savingsRealized,
      savingsPlanned,
      resultado,
      pocketMargin,
      savingsRate: Math.round(savingsRate * 10) / 10,
    },
  });
}
