export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');

  const where: any = { companyId };
  if (status) where.status = status;
  if (type) where.investmentType = type;

  const items = await prisma.pJInvestment.findMany({ where, orderBy: { applicationDate: 'desc' } });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const uc = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: session.user.id, companyId } } });
  if (!uc || !['OWNER', 'ADMIN', 'FINANCE'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json();
  const item = await prisma.pJInvestment.create({
    data: {
      companyId,
      institutionName: body.institutionName,
      productName: body.productName,
      investmentType: body.investmentType,
      amountInvested: parseFloat(body.amountInvested),
      currentValue: parseFloat(body.currentValue || body.amountInvested),
      profitability: body.profitability ? parseFloat(body.profitability) : null,
      applicationDate: new Date(body.applicationDate),
      maturityDate: body.maturityDate ? new Date(body.maturityDate) : null,
      liquidity: body.liquidity || null,
      indexer: body.indexer || null,
      riskLevel: body.riskLevel || null,
      status: body.status || 'ativo',
      notes: body.notes || null,
      createdBy: session.user.id,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
