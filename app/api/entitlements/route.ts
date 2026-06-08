import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlanLimits, PLAN_CONFIG, type PlanId } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

// GET: return user's plan, limits, and current usage
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userId = session.user.id;
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = (sub?.plan || 'free') as PlanId;
  const limits = getPlanLimits(plan);

  // Get current counts
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [bankCount, cardCount, monthlyTxCount, savingsCount] = await Promise.all([
    prisma.bankConnection.count({ where: { userId, status: 'active' } }),
    prisma.creditCard.count({ where: { userId, isActive: true } }),
    prisma.expense.count({ where: { userId, createdAt: { gte: monthStart } } }).then(async (e: number) => {
      const i = await prisma.income.count({ where: { userId, createdAt: { gte: monthStart } } });
      return e + i;
    }),
    prisma.savingsBox.count({ where: { userId } }),
  ]);

  const usage = {
    banks: { current: bankCount, limit: limits.maxBanks, pct: limits.maxBanks === -1 ? 0 : (bankCount / limits.maxBanks) * 100 },
    cards: { current: cardCount, limit: limits.maxCards, pct: limits.maxCards === -1 ? 0 : (cardCount / limits.maxCards) * 100 },
    monthlyTransactions: { current: monthlyTxCount, limit: limits.maxMonthlyTransactions, pct: limits.maxMonthlyTransactions === -1 ? 0 : (monthlyTxCount / limits.maxMonthlyTransactions) * 100 },
    savingsBoxes: { current: savingsCount, limit: limits.maxSavingsBoxes, pct: limits.maxSavingsBoxes === -1 ? 0 : (savingsCount / limits.maxSavingsBoxes) * 100 },
  };

  return NextResponse.json({
    plan,
    planName: PLAN_CONFIG[plan].name,
    price: PLAN_CONFIG[plan].price,
    limits,
    usage,
    subscription: sub,
    plans: Object.entries(PLAN_CONFIG).map(([id, cfg]) => ({ id, ...cfg })),
  });
}
