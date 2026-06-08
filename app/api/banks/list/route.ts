import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Lightweight endpoint for bank filter dropdowns
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const isPJ = session.user.defaultEnv === 'pj';
    const companyId = session.user.activeCompanyId;

    const where: any = isPJ
      ? (companyId ? { companyId, scope: 'PJ', status: 'active' } : { id: '__none__' })
      : { userId: session.user.id, scope: 'PF', status: 'active' };

    const connections = await prisma.bankConnection.findMany({
      where,
      select: { id: true, bankName: true },
      orderBy: { bankName: 'asc' },
    });

    return NextResponse.json(connections);
  } catch (error) {
    console.error('Error fetching bank list:', error);
    return NextResponse.json([], { status: 500 });
  }
}
