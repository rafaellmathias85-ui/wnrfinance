export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type NFeRow = {
  id: string;
  receivableId: string | null;
  number: string | null;
  type: string;
  status: string;
  pdfUrl: string | null;
  xmlUrl: string | null;
  issuedAt: Date | null;
  errorMessage: string | null;
};

type BoletoRow = {
  id: string;
  receivableId: string | null;
  type: string;
  status: string;
  paidAt: Date | null;
  boletoUrl: string | null;
  pixQrCodeUrl: string | null;
  nossoNumero: number | null;
  providerKey: string | null;
  errorMessage: string | null;
};

type EmailRow = {
  id: string;
  contextId: string | null;
  to: string;
  subject: string;
  status: string;
  sentAt: Date;
  openedAt: Date | null;
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '20'));

    // Filtros básicos
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const sourceType = searchParams.get('sourceType') || '';

    // Filtros avançados
    const clienteSearch = searchParams.get('cliente') || '';
    const tipo = searchParams.get('tipo') || ''; // faturamento | recorrente | unico
    const situacaoParcela = searchParams.get('situacaoParcela') || ''; // em_dia | vencido | pago
    const tipoValor = searchParams.get('tipoValor') || ''; // definitivo | previsao
    const departamento = searchParams.get('departamento') || '';
    const categoriaId = searchParams.get('categoriaId') || '';
    const contaId = searchParams.get('contaId') || '';

    const where: any = { companyId };

    if (status) where.status = status;
    if (sourceType) where.sourceType = sourceType;

    // Filtro de tipo mapeado para sourceType
    if (tipo === 'recorrente') where.isRecurring = true;
    if (tipo === 'unico') where.isRecurring = false;
    if (tipo === 'faturamento') where.sourceType = 'contract';

    if (categoriaId) where.categoryId = categoriaId;
    if (departamento) where.costCenterId = departamento;

    const orClauses: any[] = [];
    if (search) {
      orClauses.push(
        { customerName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      );
    }
    if (clienteSearch) {
      orClauses.push(
        { customerName: { contains: clienteSearch, mode: 'insensitive' } },
        { customerDoc: { contains: clienteSearch, mode: 'insensitive' } }
      );
    }
    if (orClauses.length > 0) where.OR = orClauses;

    if (from || to) {
      where.dueDate = {} as any;
      if (from) where.dueDate.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.dueDate.lte = toDate;
      }
    }

    // Situação da parcela
    if (situacaoParcela === 'pago') {
      where.status = 'recebido';
    } else if (situacaoParcela === 'vencido') {
      where.status = 'pendente';
      if (!where.dueDate) where.dueDate = {};
      where.dueDate.lt = new Date();
    } else if (situacaoParcela === 'em_dia') {
      where.status = 'pendente';
      if (!where.dueDate) where.dueDate = {};
      where.dueDate.gte = new Date();
    }

    const [total, rows] = await Promise.all([
      prisma.accountsReceivable.count({ where }),
      prisma.accountsReceivable.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          costCenter: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const ids = rows.map(r => r.id);

    const [rawNfes, rawBoletos, rawEmails] = await Promise.all([
      prisma.nFe.findMany({
        where: { receivableId: { in: ids } },
        select: { id: true, receivableId: true, number: true, type: true, status: true, pdfUrl: true, xmlUrl: true, issuedAt: true, errorMessage: true },
      }),
      prisma.boletoCharge.findMany({
        where: { receivableId: { in: ids } },
        select: { id: true, receivableId: true, type: true, status: true, paidAt: true, boletoUrl: true, pixQrCodeUrl: true, nossoNumero: true, providerKey: true, errorMessage: true },
      }),
      prisma.emailLog.findMany({
        where: { contextType: 'receivable', contextId: { in: ids } },
        select: { id: true, contextId: true, to: true, subject: true, status: true, sentAt: true, openedAt: true },
      }),
    ]);

    const nfes = rawNfes as NFeRow[];
    const boletos = rawBoletos as BoletoRow[];
    const emails = rawEmails as EmailRow[];

    const nfeMap = new Map<string, NFeRow>();
    for (const n of nfes) {
      if (n.receivableId && !nfeMap.has(n.receivableId)) nfeMap.set(n.receivableId, n);
    }

    const boletoMap = new Map<string, BoletoRow>();
    for (const b of boletos) {
      if (b.receivableId && !boletoMap.has(b.receivableId)) boletoMap.set(b.receivableId, b);
    }

    const emailMap = new Map<string, EmailRow[]>();
    for (const e of emails) {
      if (!e.contextId) continue;
      const existing = emailMap.get(e.contextId);
      if (existing) existing.push(e);
      else emailMap.set(e.contextId, [e]);
    }

    const items = rows.map(row => {
      const nfe = nfeMap.get(row.id) ?? null;
      const boleto = boletoMap.get(row.id) ?? null;
      const logs = emailMap.get(row.id) ?? [];

      return {
        ...row,
        nfe: nfe ? { id: nfe.id, number: nfe.number, type: nfe.type, status: nfe.status, pdfUrl: nfe.pdfUrl, xmlUrl: nfe.xmlUrl, issuedAt: nfe.issuedAt, errorMessage: nfe.errorMessage } : null,
        boleto: boleto ? { id: boleto.id, type: boleto.type, status: boleto.status, paidAt: boleto.paidAt, boletoUrl: boleto.boletoUrl, pixQrCodeUrl: boleto.pixQrCodeUrl, nossoNumero: boleto.nossoNumero, providerKey: boleto.providerKey, errorMessage: boleto.errorMessage } : null,
        emailSent: logs.some(l => l.status === 'sent'),
        emailOpenedAt: logs.find(l => l.openedAt)?.openedAt ?? null,
        emailLogs: logs.map(l => ({ id: l.id, to: l.to, subject: l.subject, status: l.status, sentAt: l.sentAt, openedAt: l.openedAt })),
      };
    });

    return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    console.error('[pj/faturamento/lista GET]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const body = await req.json();
    const { ids, action, data } = body;

    if (!ids?.length) return NextResponse.json({ error: 'Nenhum item selecionado' }, { status: 400 });

    // Verify ownership
    const count = await prisma.accountsReceivable.count({ where: { id: { in: ids }, companyId } });
    if (count !== ids.length) return NextResponse.json({ error: 'Itens inválidos' }, { status: 403 });

    let updateData: any = {};

    switch (action) {
      case 'no_boleto': updateData = { generateBoleto: false }; break;
      case 'no_pix': updateData = { generatePix: false }; break;
      case 'no_nfe': updateData = { generateNfe: false }; break;
      case 'no_all': updateData = { generateBoleto: false, generatePix: false, generateNfe: false }; break;
      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    await prisma.accountsReceivable.updateMany({ where: { id: { in: ids }, companyId }, data: updateData });

    return NextResponse.json({ updated: ids.length });
  } catch (error: any) {
    console.error('[pj/faturamento/lista PATCH]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
