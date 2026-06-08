export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Normalized token similarity (0–1): how many words from bankRef match description
function tokenSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove accents
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/).filter(Boolean);

  const tokensA = normalize(a);
  const tokensB = normalize(b);
  if (!tokensA.length || !tokensB.length) return 0;

  let matches = 0;
  for (const t of tokensA) {
    if (tokensB.some(tb => tb.includes(t) || t.includes(tb))) matches++;
  }
  return matches / Math.max(tokensA.length, tokensB.length);
}

function amountScore(bankAmount: number, billAmount: number): number {
  const diff = Math.abs(bankAmount - billAmount);
  if (diff < 0.01) return 1;
  const pct = diff / Math.max(bankAmount, billAmount);
  if (pct < 0.01) return 0.95;
  if (pct < 0.05) return 0.75;
  if (pct < 0.10) return 0.50;
  return 0;
}

function dateScore(bankDate: string, billDate: string): number {
  const diff = Math.abs(new Date(bankDate).getTime() - new Date(billDate).getTime()) / 86_400_000;
  if (diff === 0) return 1;
  if (diff <= 1) return 0.90;
  if (diff <= 3) return 0.75;
  if (diff <= 5) return 0.60;
  if (diff <= 7) return 0.40;
  return 0;
}

// POST /api/pj/reconciliation/suggest
// Body: { bankEntries: [{reference, date, amount, type}] }
// Returns: { suggestions: [{bankEntry, matches: [{bill, confidence, reason}]}] }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const bankEntries: Array<{ reference: string; date: string; amount: number; type: string }> = body.bankEntries || [];

  if (!bankEntries.length) return NextResponse.json({ error: 'bankEntries vazio' }, { status: 400 });

  const [payables, receivables] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: { companyId, status: { in: ['pendente', 'vencido'] } },
      include: { category: true },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: { in: ['pendente', 'vencido'] } },
      include: { category: true },
    }),
  ]);

  const suggestions = bankEntries.map(entry => {
    const absAmount = Math.abs(entry.amount);
    const pool = entry.type === 'DEBIT' ? payables : receivables;
    const billType = entry.type === 'DEBIT' ? 'payable' : 'receivable';

    const scored = pool.map(bill => {
      const aScore = amountScore(absAmount, Number(bill.amount));
      const dScore = dateScore(entry.date, new Date(bill.dueDate).toISOString().split('T')[0]);
      const tScore = tokenSimilarity(entry.reference, bill.description);

      // Weighted confidence
      const confidence = Math.round((aScore * 0.50 + dScore * 0.30 + tScore * 0.20) * 100);

      const reasons: string[] = [];
      if (aScore >= 0.95) reasons.push('valor exato');
      else if (aScore >= 0.75) reasons.push('valor aproximado');
      else if (aScore > 0) reasons.push('valor divergente');
      if (dScore >= 0.90) reasons.push('data coincide');
      else if (dScore >= 0.60) reasons.push('data próxima');
      else if (dScore > 0) reasons.push('data distante');
      if (tScore >= 0.5) reasons.push('descrição similar');

      return {
        bill: {
          id: bill.id,
          description: bill.description,
          amount: Number(bill.amount),
          dueDate: new Date(bill.dueDate).toISOString().split('T')[0],
          type: billType,
          category: (bill as any).category?.name || null,
        },
        confidence,
        reason: reasons.join(', ') || 'correspondência parcial',
        scores: { amount: Math.round(aScore * 100), date: Math.round(dScore * 100), description: Math.round(tScore * 100) },
      };
    })
      .filter(s => s.confidence >= 30) // minimum threshold
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3); // top 3 matches per entry

    return { bankEntry: entry, matches: scored };
  });

  return NextResponse.json({ suggestions });
}
