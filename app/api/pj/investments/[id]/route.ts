export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const existing = await prisma.pJInvestment.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Investimento não encontrado' }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.institutionName !== undefined) data.institutionName = body.institutionName;
  if (body.productName !== undefined) data.productName = body.productName;
  if (body.investmentType !== undefined) data.investmentType = body.investmentType;
  if (body.amountInvested !== undefined) data.amountInvested = parseFloat(body.amountInvested);
  if (body.currentValue !== undefined) data.currentValue = parseFloat(body.currentValue);
  if (body.profitability !== undefined) data.profitability = body.profitability ? parseFloat(body.profitability) : null;
  if (body.applicationDate !== undefined) data.applicationDate = new Date(body.applicationDate);
  if (body.maturityDate !== undefined) data.maturityDate = body.maturityDate ? new Date(body.maturityDate) : null;
  if (body.liquidity !== undefined) data.liquidity = body.liquidity;
  if (body.indexer !== undefined) data.indexer = body.indexer;
  if (body.riskLevel !== undefined) data.riskLevel = body.riskLevel;
  if (body.status !== undefined) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes;

  const result = await prisma.pJInvestment.updateMany({ where: { id, companyId }, data });
  if (result.count === 0) return NextResponse.json({ error: 'Investimento não encontrado' }, { status: 404 });
  const updated = await prisma.pJInvestment.findFirst({ where: { id, companyId } });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const existing = await prisma.pJInvestment.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Investimento não encontrado' }, { status: 404 });

  await prisma.pJInvestment.deleteMany({ where: { id, companyId } });
  return NextResponse.json({ ok: true });
}
