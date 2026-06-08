// Feature Gating Engine - WNR Finance SaaS
// Controls what each plan can access

export type PlanId = 'free' | 'pro' | 'premium';

export interface PlanLimits {
  maxBanks: number;
  maxCards: number;
  maxMonthlyTransactions: number;
  maxSavingsBoxes: number;
  advancedReports: boolean;
  autoReconciliation: boolean;
  aiAssistant: boolean;
  exportPdf: boolean;
  pushNotifications: boolean;
  customCategories: boolean;
  multiCurrency: boolean;
  prioritySupport: boolean;
}

export const PLAN_CONFIG: Record<PlanId, { name: string; price: number; limits: PlanLimits }> = {
  free: {
    name: 'Gratuito',
    price: 0,
    limits: {
      maxBanks: 1,
      maxCards: 2,
      maxMonthlyTransactions: 50,
      maxSavingsBoxes: 3,
      advancedReports: false,
      autoReconciliation: false,
      aiAssistant: false,
      exportPdf: false,
      pushNotifications: false,
      customCategories: false,
      multiCurrency: false,
      prioritySupport: false,
    },
  },
  pro: {
    name: 'Pro',
    price: 19.90,
    limits: {
      maxBanks: 5,
      maxCards: 10,
      maxMonthlyTransactions: 500,
      maxSavingsBoxes: 15,
      advancedReports: true,
      autoReconciliation: true,
      aiAssistant: true,
      exportPdf: true,
      pushNotifications: true,
      customCategories: true,
      multiCurrency: false,
      prioritySupport: false,
    },
  },
  premium: {
    name: 'Premium',
    price: 49.90,
    limits: {
      maxBanks: -1, // unlimited
      maxCards: -1,
      maxMonthlyTransactions: -1,
      maxSavingsBoxes: -1,
      advancedReports: true,
      autoReconciliation: true,
      aiAssistant: true,
      exportPdf: true,
      pushNotifications: true,
      customCategories: true,
      multiCurrency: true,
      prioritySupport: true,
    },
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_CONFIG[(plan as PlanId) || 'free']?.limits || PLAN_CONFIG.free.limits;
}

export function checkFeature(plan: string, feature: keyof PlanLimits): boolean {
  const limits = getPlanLimits(plan);
  const value = limits[feature];
  if (typeof value === 'boolean') return value;
  return true; // numeric limits checked separately
}

export function checkLimit(plan: string, feature: keyof PlanLimits, currentCount: number): { allowed: boolean; limit: number; remaining: number } {
  const limits = getPlanLimits(plan);
  const limit = limits[feature] as number;
  if (limit === -1) return { allowed: true, limit: -1, remaining: -1 };
  return { allowed: currentCount < limit, limit, remaining: Math.max(0, limit - currentCount) };
}

// Server-side entitlement check for API routes
export async function getUserPlan(userId: string): Promise<string> {
  const { prisma } = await import('@/lib/prisma');
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  return sub?.plan || 'free';
}

export async function checkEntitlement(
  userId: string,
  feature: keyof PlanLimits
): Promise<{ allowed: boolean; plan: string; upgrade?: string }> {
  const plan = await getUserPlan(userId);
  const allowed = checkFeature(plan, feature);
  return {
    allowed,
    plan,
    upgrade: !allowed ? (plan === 'free' ? 'pro' : 'premium') : undefined,
  };
}

export async function checkCountEntitlement(
  userId: string,
  feature: keyof PlanLimits,
  currentCount: number
): Promise<{ allowed: boolean; plan: string; limit: number; remaining: number; upgrade?: string }> {
  const plan = await getUserPlan(userId);
  const result = checkLimit(plan, feature, currentCount);
  return {
    ...result,
    plan,
    upgrade: !result.allowed ? (plan === 'free' ? 'pro' : 'premium') : undefined,
  };
}
