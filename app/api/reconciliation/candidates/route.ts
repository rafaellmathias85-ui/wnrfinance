export const dynamic = 'force-dynamic';

// Conciliação V2 — busca de candidatos para vínculo manual (campo "Vincular")
// GET /api/reconciliation/candidates?scope=pj&type=credit&q=texto&amount=123.45&date=2026-06-05

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { moneyDiffCents } from '@/lib/money';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'pj';
    const txType = searchParams.get('type') || 'credit'; // credit → receitas, debit → despesas
    const q = (searchParams.get('q') || '').trim();
    const amount = searchParams.get('amount') ? parseFloat(searchParams.get('amount')!) : null;
    const dateStr = searchParams.get('date');
    const refDate = dateStr ? new Date(dateStr) : null;

    const companyId = scope === 'pj' ? session.user.activeCompanyId : null;
    if (scope === 'pj' && !companyId) {
      return NextResponse.json({ error: 'Empresa ativa não selecionada' }, { status: 400 });
    }

    // Janela de busca: ±45 dias da data da transação (ou últimos 90 dias)
    const windowStart = refDate ? new Date(refDate.getTime() - 45 * 86400000) : new Date(Date.now() - 90 * 86400000);
    const windowEnd = refDate ? new Date(refDate.getTime() + 45 * 86400000) : new Date(Date.now() + 45 * 86400000);

    const results: any[] = [];

    if (companyId) {
      if (txType === 'credit') {
        const receivables = await prisma.accountsReceivable.findMany({
          where: {
            companyId,
            billingStatus: { in: ['FATURADA', 'VENCIDA', 'PREVISTA'] },
            dueDate: { gte: windowStart, lte: windowEnd },
            ...(q
              ? {
                  OR: [
                    { description: { contains: q, mode: 'insensitive' } },
                    { customerName: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: { id: true, description: true, customerName: true, amount: true, dueDate: true, billingStatus: true },
          orderBy: { dueDate: 'asc' },
          take: 50,
        });
        results.push(
          ...receivables.map((r) => ({
            id: r.id,
            internalType: 'income',
            kind: 'receivable',
            label: `${r.customerName || r.description}`,
            description: r.description,
            amount: r.amount,
            date: r.dueDate,
            status: r.billingStatus,
          })),
        );
      } else {
        const payables = await prisma.accountsPayable.findMany({
          where: {
            companyId,
            status: { in: ['pendente', 'vencido', 'aprovado'] },
            dueDate: { gte: windowStart, lte: windowEnd },
            ...(q
              ? {
                  OR: [
                    { description: { contains: q, mode: 'insensitive' } },
                    { supplierName: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: { id: true, description: true, supplierName: true, amount: true, dueDate: true, status: true },
          orderBy: { dueDate: 'asc' },
          take: 50,
        });
        results.push(
          ...payables.map((p) => ({
            id: p.id,
            internalType: 'expense',
            kind: 'payable',
            label: `${p.supplierName || p.description}`,
            description: p.description,
            amount: p.amount,
            date: p.dueDate,
            status: p.status,
          })),
        );
      }
    } else {
      // PF: Income/Expense sem conciliação confirmada
      if (txType === 'credit') {
        const incomes = await prisma.income.findMany({
          where: {
            userId: session.user.id,
            companyId: null,
            date: { gte: windowStart, lte: windowEnd },
            ...(q ? { description: { contains: q, mode: 'insensitive' } } : {}),
          },
          select: { id: true, description: true, amount: true, date: true },
          orderBy: { date: 'desc' },
          take: 50,
        });
        results.push(...incomes.map((i) => ({ id: i.id, internalType: 'income', kind: 'income', label: i.description, description: i.description, amount: i.amount, date: i.date })));
      } else {
        const expenses = await prisma.expense.findMany({
          where: {
            userId: session.user.id,
            companyId: null,
            date: { gte: windowStart, lte: windowEnd },
            ...(q ? { description: { contains: q, mode: 'insensitive' } } : {}),
          },
          select: { id: true, description: true, amount: true, date: true },
          orderBy: { date: 'desc' },
          take: 50,
        });
        results.push(...expenses.map((e) => ({ id: e.id, internalType: 'expense', kind: 'expense', label: e.description, description: e.description, amount: e.amount, date: e.date })));
      }
    }

    // Ordena por proximidade de valor (igualdade de centavos primeiro)
    if (amount != null) {
      results.sort((a, b) => moneyDiffCents(a.amount, amount) - moneyDiffCents(b.amount, amount));
    }

    return NextResponse.json({ candidates: results.slice(0, 20) });
  } catch (error: any) {
    console.error('GET candidates error:', error);
    return NextResponse.json({ error: 'Erro ao buscar candidatos' }, { status: 500 });
  }
}
