import { prisma } from '@/lib/prisma';

interface MatchCandidate {
  id: string;
  type: 'expense' | 'income';
  description: string;
  amount: number;
  date: Date;
}

const DATE_WINDOW_DAYS = 5;
const MIN_SCORE = 0.4;
const AUTO_THRESHOLD = 0.70;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function textSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function dateDistance(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function computeScore(bankTx: { amount: number; date: Date; description: string }, candidate: MatchCandidate): number {
  // Amount match (45% weight) - exact amount match is very strong signal
  const amountDiff = Math.abs(Math.abs(bankTx.amount) - candidate.amount);
  const amountRatio = amountDiff / Math.max(Math.abs(bankTx.amount), candidate.amount, 0.01);
  const amountScore = amountRatio < 0.001 ? 1 : amountRatio < 0.02 ? 0.9 : amountRatio < 0.05 ? 0.7 : amountRatio < 0.1 ? 0.4 : 0;

  // Date match (20% weight) - more lenient to allow cross-month matching
  const days = dateDistance(new Date(bankTx.date), new Date(candidate.date));
  const dateScore = days === 0 ? 1 : days <= 1 ? 0.95 : days <= 3 ? 0.8 : days <= DATE_WINDOW_DAYS ? 0.5 : days <= 10 ? 0.3 : 0;

  // Description match (35% weight) - name matching is important
  const descScore = textSimilarity(bankTx.description, candidate.description);

  // Bonus: if amount is exact AND description has any word match, boost score
  const exactAmountAndSomeName = amountScore >= 0.9 && descScore >= 0.2;
  const bonus = exactAmountAndSomeName ? 0.1 : 0;

  return Math.min(1, amountScore * 0.45 + dateScore * 0.2 + descScore * 0.35 + bonus);
}

export async function runReconciliation(userId: string, bankConnectionId?: string) {
  // 1. Get unreconciled PF bank transactions only (companyId: null = PF context)
  const where: any = { userId, companyId: null, status: { in: ['PENDING', 'BANK_ONLY'] } };
  if (bankConnectionId) where.bankConnectionId = bankConnectionId;

  const bankTxs = await prisma.bankTransaction.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { reconciliation: true },
  });

  if (bankTxs.length === 0) return { processed: 0, matched: 0, divergent: 0, bankOnly: 0 };

  // 2. Get date range - expand window to 15 days to catch cross-month entries
  const dates = bankTxs.map((t: any) => new Date(t.date).getTime());
  const minDate = new Date(Math.min(...dates) - 15 * 86400000);
  const maxDate = new Date(Math.max(...dates) + 15 * 86400000);

  // 3. Get internal transactions in range
  const [expenses, incomes] = await Promise.all([
    prisma.expense.findMany({
      where: { userId, companyId: null, date: { gte: minDate, lte: maxDate } },
      select: { id: true, description: true, amount: true, date: true },
    }),
    prisma.income.findMany({
      where: { userId, companyId: null, date: { gte: minDate, lte: maxDate } },
      select: { id: true, description: true, amount: true, date: true },
    }),
  ]);

  // 4. Get already reconciled internal IDs
  const reconciledIds = new Set(
    (await prisma.reconciliation.findMany({
      where: { userId, status: 'RECONCILED', internalId: { not: null } },
      select: { internalId: true },
    })).map((r: any) => r.internalId)
  );

  const candidates: MatchCandidate[] = [
    ...expenses.filter((e: any) => !reconciledIds.has(e.id)).map((e: any) => ({ ...e, type: 'expense' as const, amount: e.amount })),
    ...incomes.filter((i: any) => !reconciledIds.has(i.id)).map((i: any) => ({ ...i, type: 'income' as const, amount: i.amount })),
  ];

  let matched = 0, divergent = 0, bankOnly = 0;

  for (const bankTx of bankTxs) {
    // Skip if already reconciled with an internal entry
    if (bankTx.reconciliation && bankTx.reconciliation.internalId && bankTx.reconciliation.status === 'RECONCILED') continue;
    const existingRecon = bankTx.reconciliation;

    // Match debit bank tx -> expenses, credit bank tx -> incomes
    const relevantCandidates = candidates.filter(c =>
      (bankTx.type === 'debit' && c.type === 'expense') ||
      (bankTx.type === 'credit' && c.type === 'income')
    );

    let bestMatch: MatchCandidate | null = null;
    let bestScore = 0;

    for (const c of relevantCandidates) {
      const score = computeScore(bankTx, c);
      if (score > bestScore && score >= MIN_SCORE) {
        bestScore = score;
        bestMatch = c;
      }
    }

    if (bestMatch && bestScore >= AUTO_THRESHOLD) {
      // Auto reconcile
      if (existingRecon) {
        await prisma.$transaction([
          prisma.reconciliation.update({
            where: { id: existingRecon.id },
            data: {
              internalType: bestMatch.type, internalId: bestMatch.id,
              status: 'RECONCILED', matchScore: bestScore, matchMethod: 'auto', resolvedAt: new Date(),
              logs: { create: { action: 'auto_matched', previousStatus: existingRecon.status, newStatus: 'RECONCILED', details: { score: bestScore, internalId: bestMatch.id, internalType: bestMatch.type } } },
            },
          }),
          prisma.bankTransaction.update({ where: { id: bankTx.id }, data: { status: 'RECONCILED' } }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.reconciliation.create({
            data: {
              userId, bankTransactionId: bankTx.id, internalType: bestMatch.type, internalId: bestMatch.id,
              status: 'RECONCILED', matchScore: bestScore, matchMethod: 'auto', resolvedAt: new Date(),
              logs: { create: { action: 'auto_matched', previousStatus: 'PENDING', newStatus: 'RECONCILED', details: { score: bestScore, internalId: bestMatch.id, internalType: bestMatch.type } } },
            },
          }),
          prisma.bankTransaction.update({ where: { id: bankTx.id }, data: { status: 'RECONCILED' } }),
        ]);
      }
      const idx = candidates.findIndex(c => c.id === bestMatch!.id);
      if (idx >= 0) candidates.splice(idx, 1);
      matched++;
    } else if (bestMatch && bestScore >= MIN_SCORE) {
      if (existingRecon) {
        await prisma.$transaction([
          prisma.reconciliation.update({
            where: { id: existingRecon.id },
            data: {
              internalType: bestMatch.type, internalId: bestMatch.id,
              status: 'DIVERGENT', matchScore: bestScore, matchMethod: 'auto',
              divergenceReason: `Score ${(bestScore * 100).toFixed(0)}% - requer revisão manual`,
              logs: { create: { action: 'divergent', previousStatus: existingRecon.status, newStatus: 'DIVERGENT', details: { score: bestScore, internalId: bestMatch.id } } },
            },
          }),
          prisma.bankTransaction.update({ where: { id: bankTx.id }, data: { status: 'PENDING' } }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.reconciliation.create({
            data: {
              userId, bankTransactionId: bankTx.id, internalType: bestMatch.type, internalId: bestMatch.id,
              status: 'DIVERGENT', matchScore: bestScore, matchMethod: 'auto',
              divergenceReason: `Score ${(bestScore * 100).toFixed(0)}% - requer revisão manual`,
              logs: { create: { action: 'divergent', previousStatus: 'PENDING', newStatus: 'DIVERGENT', details: { score: bestScore, internalId: bestMatch.id } } },
            },
          }),
          prisma.bankTransaction.update({ where: { id: bankTx.id }, data: { status: 'PENDING' } }),
        ]);
      }
      divergent++;
    } else {
      if (!existingRecon) {
        await prisma.$transaction([
          prisma.reconciliation.create({
            data: {
              userId, bankTransactionId: bankTx.id, status: 'BANK_ONLY', matchMethod: 'auto',
              logs: { create: { action: 'unmatched', previousStatus: 'PENDING', newStatus: 'BANK_ONLY', details: { message: 'Nenhum lançamento interno compatível' } } },
            },
          }),
          prisma.bankTransaction.update({ where: { id: bankTx.id }, data: { status: 'BANK_ONLY' } }),
        ]);
      }
      bankOnly++;
    }
  }

  return { processed: bankTxs.length, matched, divergent, bankOnly };
}
