export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

    const centers = await prisma.costCenter.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });

    const metrics = await Promise.all(
      centers.map(async (center) => {
        const [payAgg, recAgg, payCount, recCount] = await Promise.all([
          prisma.accountsPayable.aggregate({
            where: { companyId, costCenterId: center.id },
            _sum: { amount: true },
          }),
          prisma.accountsReceivable.aggregate({
            where: { companyId, costCenterId: center.id },
            _sum: { amount: true },
          }),
          prisma.accountsPayable.count({
            where: { companyId, costCenterId: center.id },
          }),
          prisma.accountsReceivable.count({
            where: { companyId, costCenterId: center.id },
          }),
        ]);

        const totalPayables = payAgg._sum.amount || 0;
        const totalReceivables = recAgg._sum.amount || 0;

        return {
          centerId: center.id,
          name: center.name,
          code: center.code,
          totalPayables,
          totalReceivables,
          balance: totalReceivables - totalPayables,
          payableCount: payCount,
          receivableCount: recCount,
        };
      })
    );

    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('Cost center metrics error:', error);
    return NextResponse.json({ error: 'Erro ao calcular metricas' }, { status: 500 });
  }
}
