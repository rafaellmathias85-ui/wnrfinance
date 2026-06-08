export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { suggestCategory } from '@/lib/ai-categorize';
import { prisma } from '@/lib/prisma';

// POST /api/ai/categorize
// Body: { description, type?: 'INCOME' | 'EXPENSE' | 'auto' }
// Returns: { categoryName, categoryType, confidence, reasoning }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  const body = await req.json();
  const { description, type } = body;

  if (!description) return NextResponse.json({ error: 'description obrigatório' }, { status: 400 });

  // Load existing categories for better AI suggestions
  let existingCategories: string[] = [];
  if (companyId) {
    const cats = await prisma.businessCategory.findMany({
      where: { companyId },
      select: { name: true },
      take: 50,
    }).catch(() => []);
    existingCategories = cats.map(c => c.name);
  }

  const suggestion = await suggestCategory(description, existingCategories, type || 'auto');
  if (!suggestion) return NextResponse.json({ suggestion: null });

  // Try to find matching existing category
  let matchedCategoryId: string | null = null;
  if (companyId && suggestion) {
    const match = await prisma.businessCategory.findFirst({
      where: {
        companyId,
        name: { contains: suggestion.categoryName, mode: 'insensitive' },
      },
    }).catch(() => null);
    matchedCategoryId = match?.id || null;
  }

  return NextResponse.json({
    suggestion: {
      ...suggestion,
      matchedCategoryId,
    },
  });
}
