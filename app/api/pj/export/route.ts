export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get('entity') ?? 'payable';
  const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
  const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

  const dateFilter = startDate || endDate
    ? { gte: startDate, lte: endDate }
    : undefined;

  let csv = '';
  let filename = '';

  if (entity === 'payable') {
    const rows = await prisma.accountsPayable.findMany({
      where: { companyId, ...(dateFilter ? { dueDate: dateFilter } : {}) },
      include: { category: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    });
    csv = toCsv(rows.map(r => ({
      id: r.id,
      descricao: r.description,
      fornecedor: r.supplierName ?? '',
      valor: r.amount,
      vencimento: r.dueDate.toISOString().slice(0, 10),
      status: r.status,
      categoria: r.category?.name ?? '',
      tipo_lancamento: r.launchType ?? '',
      criado_em: r.createdAt.toISOString().slice(0, 10),
    })));
    filename = 'contas-pagar.csv';
  } else if (entity === 'receivable') {
    const rows = await prisma.accountsReceivable.findMany({
      where: { companyId, ...(dateFilter ? { dueDate: dateFilter } : {}) },
      include: { category: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    });
    csv = toCsv(rows.map(r => ({
      id: r.id,
      descricao: r.description,
      cliente: r.customerName ?? '',
      valor: r.amount,
      vencimento: r.dueDate.toISOString().slice(0, 10),
      status: r.status,
      categoria: r.category?.name ?? '',
      tipo_lancamento: r.launchType ?? '',
      recebido_em: r.receivedAt?.toISOString().slice(0, 10) ?? '',
      criado_em: r.createdAt.toISOString().slice(0, 10),
    })));
    filename = 'contas-receber.csv';
  } else if (entity === 'client') {
    const rows = await prisma.client.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
    csv = toCsv(rows.map(r => ({
      id: r.id,
      nome: r.name,
      email: r.email ?? '',
      telefone: r.phone ?? '',
      cpf: r.cpf ?? '',
      cnpj: r.cnpj ?? '',
      tipo: r.clientType ?? '',
      ativo: r.isActive ? 'sim' : 'nao',
      criado_em: r.createdAt.toISOString().slice(0, 10),
    })));
    filename = 'clientes.csv';
  } else if (entity === 'nfe') {
    const rows = await prisma.nFe.findMany({
      where: { companyId, ...(dateFilter ? { issuedAt: dateFilter } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    csv = toCsv(rows.map(r => ({
      id: r.id,
      numero: r.number ?? '',
      serie: r.series ?? '',
      tipo: r.type,
      status: r.status,
      cliente: r.customerName ?? '',
      cpf_cnpj: r.customerDoc ?? '',
      emissao: r.issuedAt?.toISOString().slice(0, 10) ?? '',
      chave_acesso: r.accessKey ?? '',
      criado_em: r.createdAt.toISOString().slice(0, 10),
    })));
    filename = 'notas-fiscais.csv';
  } else if (entity === 'commission') {
    const rows = await prisma.commission.findMany({
      where: { companyId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    csv = toCsv(rows.map(r => ({
      id: r.id,
      agente: r.agentName,
      descricao: r.description ?? '',
      venda: r.saleAmount,
      taxa: r.rate,
      comissao: r.amount,
      periodo: r.period,
      status: r.status,
      pago_em: r.paidAt?.toISOString().slice(0, 10) ?? '',
    })));
    filename = 'comissoes.csv';
  } else {
    return NextResponse.json({ error: 'entity inválida' }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
