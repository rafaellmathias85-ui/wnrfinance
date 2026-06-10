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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  const where: any = { companyId, type: 'nfce' };
  if (status) where.status = status;

  const [nfces, total] = await Promise.all([
    prisma.nFe.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.nFe.count({ where }),
  ]);

  return NextResponse.json({ nfces, total, page, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const { customerName, customerDoc, items, observations, paymentMethod, emit } = body;

  if (!items?.length) {
    return NextResponse.json({ error: 'Ao menos um item é obrigatório' }, { status: 400 });
  }

  const totalItems: number = items.reduce(
    (s: number, i: any) => s + (i.valorTotal ?? i.valorUnitario * i.quantidade),
    0
  );

  const nfce = await prisma.nFe.create({
    data: {
      companyId,
      type: 'nfce',
      series: '65',
      status: 'rascunho',
      customerName: customerName || null,
      customerDoc: customerDoc || null,
      items,
      totals: { totalProdutos: totalItems, totalImpostos: 0, totalNota: totalItems },
      paymentMethod: paymentMethod || null,
      observations: observations || null,
      createdBy: session.user.id,
    },
  });

  if (emit) {
    try {
      const { emitNFe } = await import('@/lib/nfe');
      const payload = {
        naturezaOperacao: 'Venda a consumidor',
        destinatarioNome: customerName || 'Consumidor Final',
        destinatarioDoc: customerDoc || '000.000.000-00',
        items: (items as any[]).map((i: any) => ({
          codigo: i.codigo || '000',
          descricao: i.descricao,
          unidade: i.unidade || 'UN',
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          valorTotal: i.valorTotal ?? i.quantidade * i.valorUnitario,
        })),
      };
      const result = await emitNFe(companyId, payload);
      await prisma.nFe.update({
        where: { id: nfce.id },
        data: {
          status: result.success ? 'enviada' : 'rejeitada',
          providerNFeId: result.providerNFeId ?? undefined,
          accessKey: result.accessKey ?? undefined,
          pdfUrl: result.pdfUrl ?? undefined,
          errorMessage: result.errorMessage ?? null,
          issuedAt: result.success ? new Date() : undefined,
        },
      });
    } catch { /* provider not configured — stays as draft */ }
  }

  return NextResponse.json(nfce, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const existing = await prisma.nFe.findFirst({ where: { id, companyId, type: 'nfce' } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();

  if (body.action === 'cancel') {
    await prisma.nFe.update({
      where: { id },
      data: { status: 'cancelada', cancelReason: body.reason || null, canceledAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'emit') {
    try {
      const { emitNFe } = await import('@/lib/nfe');
      const items = existing.items as any[];
      const payload = {
        naturezaOperacao: 'Venda a consumidor',
        destinatarioNome: existing.customerName || 'Consumidor Final',
        destinatarioDoc: existing.customerDoc || '000.000.000-00',
        items: items.map((i: any) => ({
          codigo: i.codigo || '000',
          descricao: i.descricao,
          unidade: i.unidade || 'UN',
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          valorTotal: i.valorTotal ?? i.quantidade * i.valorUnitario,
        })),
      };
      const result = await emitNFe(companyId, payload);
      await prisma.nFe.update({
        where: { id },
        data: {
          status: result.success ? 'enviada' : 'rejeitada',
          providerNFeId: result.providerNFeId ?? undefined,
          accessKey: result.accessKey ?? undefined,
          pdfUrl: result.pdfUrl ?? undefined,
          errorMessage: result.errorMessage ?? null,
          issuedAt: result.success ? new Date() : undefined,
        },
      });
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Erro ao emitir' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
