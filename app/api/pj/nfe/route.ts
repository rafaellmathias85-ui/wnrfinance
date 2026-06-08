export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { emitNFe, NFePayload } from '@/lib/nfe';
import { createAuditLog } from '@/lib/audit-log';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = { companyId: session.user.activeCompanyId };
    if (status) where.status = status;

    const [nfes, total] = await Promise.all([
      prisma.nFe.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.nFe.count({ where }),
    ]);

    return NextResponse.json({ nfes, total, page, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error('GET NF-e error:', error);
    return NextResponse.json({ error: 'Erro ao buscar notas fiscais' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const companyId = session.user.activeCompanyId;
    const body = await request.json();
    const { receivableId, customerName, customerDoc, customerEmail, customerAddress, items, observations, paymentMethod, naturezaOperacao, emit } = body;

    if (!customerName || !customerDoc || !items?.length) {
      return NextResponse.json({ error: 'Campos obrigatórios: destinatário, CPF/CNPJ e itens' }, { status: 400 });
    }

    const totalItems = items.reduce((s: number, i: any) => s + (i.valorTotal || i.valorUnitario * i.quantidade), 0);

    // Create NF-e record in draft
    const nfe = await prisma.nFe.create({
      data: {
        companyId,
        receivableId: receivableId || null,
        type: 'nfe',
        status: 'rascunho',
        customerName,
        customerDoc,
        customerEmail: customerEmail || null,
        customerAddress: customerAddress ? JSON.stringify(customerAddress) : null,
        items: items as any,
        totals: {
          totalProdutos: totalItems,
          totalImpostos: 0,
          totalNota: totalItems,
        } as any,
        paymentMethod: paymentMethod || null,
        observations: observations || null,
        createdBy: session.user.id,
      },
    });

    // If emit=true, try to emit right away
    if (emit) {
      const payload: NFePayload = {
        naturezaOperacao: naturezaOperacao || 'Venda de mercadorias',
        destinatarioNome: customerName,
        destinatarioDoc: customerDoc,
        destinatarioEmail: customerEmail,
        destinatarioEndereco: customerAddress,
        items: items.map((i: any) => ({
          codigo: i.codigo || '000',
          descricao: i.descricao || i.productName,
          unidade: i.unidade || 'UN',
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          valorTotal: i.valorTotal || i.valorUnitario * i.quantidade,
          ncm: i.ncm,
          cfop: i.cfop,
        })),
        formaPagamento: paymentMethod === 'PIX' ? 17 : paymentMethod === 'CARTAO' ? 3 : 1,
        informacoesAdicionais: observations,
      };

      const result = await emitNFe(companyId, payload);

      await prisma.nFe.update({
        where: { id: nfe.id },
        data: {
          status: result.success ? 'enviada' : 'rejeitada',
          providerNFeId: result.providerNFeId || null,
          accessKey: result.accessKey || null,
          xmlUrl: result.xmlUrl || null,
          pdfUrl: result.pdfUrl || null,
          errorMessage: result.errorMessage || null,
          issuedAt: result.success ? new Date() : null,
        },
      });

      if (!result.success) {
        await createAuditLog({ userId: session.user.id, companyId, action: 'SEND', entity: 'nfe', entityId: nfe.id, metadata: { error: result.errorMessage }, request });
        return NextResponse.json({ ...nfe, status: 'rejeitada', errorMessage: result.errorMessage }, { status: 422 });
      }

      await createAuditLog({ userId: session.user.id, companyId, action: 'SEND', entity: 'nfe', entityId: nfe.id, request });
      return NextResponse.json({ ...nfe, status: 'enviada', providerNFeId: result.providerNFeId, pdfUrl: result.pdfUrl }, { status: 201 });
    }

    await createAuditLog({ userId: session.user.id, companyId, action: 'CREATE', entity: 'nfe', entityId: nfe.id, request });
    return NextResponse.json(nfe, { status: 201 });
  } catch (error: any) {
    console.error('POST NF-e error:', error);
    return NextResponse.json({ error: 'Erro ao criar nota fiscal' }, { status: 500 });
  }
}
