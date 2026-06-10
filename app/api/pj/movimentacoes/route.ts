export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId as string;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const tipoData = url.searchParams.get('tipoData') || 'pagamento'; // pagamento | vencimento | emissao
  const bankConnectionId = url.searchParams.get('contaId') || url.searchParams.get('bankConnectionId');
  const tipo = url.searchParams.get('tipo') || 'all'; // entrada | saida | all
  const busca = url.searchParams.get('busca') || '';
  const categoriaId = url.searchParams.get('categoriaId');
  const status = url.searchParams.get('status'); // pendente | pago | recebido | todos
  const especie = url.searchParams.get('especie'); // boleto | pix | transferencia | dinheiro
  const tipoValor = url.searchParams.get('tipoValor'); // positivo | negativo
  const clienteFornecedor = url.searchParams.get('clienteFornecedor');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = Math.min(200, parseInt(url.searchParams.get('pageSize') || '50'));

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const dateStart = startDate ? new Date(startDate) : defaultStart;
  const dateEnd = endDate ? new Date(endDate + 'T23:59:59') : defaultEnd;

  const baseWhere: any = { companyId };
  // bankConnectionId does not exist on AccountsPayable/Receivable — filtered via conciliation table if needed
  if (categoriaId) baseWhere.categoryId = categoriaId;

  // Build date filter based on tipoData
  const dateFilter =
    tipoData === 'vencimento'
      ? { dueDate: { gte: dateStart, lte: dateEnd } }
      : { paidAt: { gte: dateStart, lte: dateEnd } };

  const dateFilterReceivable =
    tipoData === 'vencimento'
      ? { dueDate: { gte: dateStart, lte: dateEnd } }
      : { receivedAt: { gte: dateStart, lte: dateEnd } };

  // Status filter
  const payableStatus =
    !status || status === 'todos' ? undefined : status === 'recebido' ? 'pago' : status;
  const receivableStatus =
    !status || status === 'todos' ? undefined : status === 'pago' ? 'recebido' : status;

  const payablesWhere: any = {
    ...baseWhere,
    ...(tipoData === 'vencimento' ? dateFilter : { paidAt: { gte: dateStart, lte: dateEnd } }),
    ...(payableStatus ? { status: payableStatus } : {}),
    ...(busca ? { description: { contains: busca, mode: 'insensitive' } } : {}),
    ...(clienteFornecedor ? { supplierName: { contains: clienteFornecedor, mode: 'insensitive' } } : {}),
    ...(especie ? { paymentMethod: { contains: especie, mode: 'insensitive' } } : {}),
  };

  const receivablesWhere: any = {
    ...baseWhere,
    ...(tipoData === 'vencimento' ? dateFilterReceivable : { receivedAt: { gte: dateStart, lte: dateEnd } }),
    ...(receivableStatus ? { status: receivableStatus } : {}),
    ...(busca ? { description: { contains: busca, mode: 'insensitive' } } : {}),
    ...(clienteFornecedor ? { customerName: { contains: clienteFornecedor, mode: 'insensitive' } } : {}),
  };

  // When filtering by pagamento date, only show paid records
  if (tipoData !== 'vencimento') {
    if (!payablesWhere.status) payablesWhere.status = 'pago';
    if (!receivablesWhere.status) receivablesWhere.status = 'recebido';
  }

  const [payables, receivables] = await Promise.all([
    tipo !== 'entrada'
      ? prisma.accountsPayable.findMany({
          where: payablesWhere,
          include: { category: true },
          orderBy: tipoData === 'vencimento' ? { dueDate: 'asc' } : { paidAt: 'asc' },
        })
      : Promise.resolve([]),
    tipo !== 'saida'
      ? prisma.accountsReceivable.findMany({
          where: receivablesWhere,
          include: { category: true },
          orderBy: tipoData === 'vencimento' ? { dueDate: 'asc' } : { receivedAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  type Movement = {
    id: string;
    date: Date;
    dueDate: Date;
    description: string;
    category: string | null;
    categoryId: string | null;
    tipo: 'entrada' | 'saida';
    amount: number;
    status: string;
    clienteFornecedor: string | null;
    notes: string | null;
    paymentMethod: string | null;
    launchType: string | null;
    isRecurring: boolean;
    recurrenceId: string | null;
    bankConnectionId: string | null;
  };

  const movements: Movement[] = [
    ...payables.map((p) => ({
      id: p.id,
      date: p.paidAt ?? p.dueDate,
      dueDate: p.dueDate,
      description: p.description,
      category: p.category?.name || null,
      categoryId: p.categoryId || null,
      tipo: 'saida' as const,
      amount: p.amountPaid || p.amount,
      status: p.status,
      clienteFornecedor: p.supplierName || null,
      notes: p.notes || null,
      paymentMethod: p.paymentMethod || null,
      launchType: p.launchType || null,
      isRecurring: p.isRecurring,
      recurrenceId: p.recurrenceId || null,
      bankConnectionId: (p as any).bankConnectionId || null,
    })),
    ...receivables.map((r) => ({
      id: r.id,
      date: r.receivedAt ?? r.dueDate,
      dueDate: r.dueDate,
      description: r.description,
      category: r.category?.name || null,
      categoryId: r.categoryId || null,
      tipo: 'entrada' as const,
      amount: r.amountReceived || r.amount,
      status: r.status,
      clienteFornecedor: r.customerName || null,
      notes: r.notes || null,
      paymentMethod: null,
      launchType: r.launchType || null,
      isRecurring: r.isRecurring,
      recurrenceId: r.recurrenceId || null,
      bankConnectionId: (r as any).bankConnectionId || null,
    })),
  ];

  movements.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Apply tipoValor filter
  const filtered = tipoValor
    ? movements.filter((m) =>
        tipoValor === 'positivo' ? m.tipo === 'entrada' : m.tipo === 'saida'
      )
    : movements;

  let balance = 0;
  const withBalance = filtered.map((m) => {
    if (m.tipo === 'entrada') balance += m.amount;
    else balance -= m.amount;
    return { ...m, saldoAcumulado: balance };
  });

  const totalEntradas = filtered.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.amount, 0);
  const totalSaidas = filtered.filter((m) => m.tipo === 'saida').reduce((s, m) => s + m.amount, 0);
  const resultado = totalEntradas - totalSaidas;

  // saldoHoje: all time balance up to today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const [todayPayables, todayReceivables] = await Promise.all([
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pago', paidAt: { lte: todayStart } },
      _sum: { amountPaid: true, amount: true },
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'recebido', receivedAt: { lte: todayStart } },
      _sum: { amountReceived: true, amount: true },
    }),
  ]);
  const totalPaidOut = todayPayables._sum.amountPaid || todayPayables._sum.amount || 0;
  const totalReceivedIn = todayReceivables._sum.amountReceived || todayReceivables._sum.amount || 0;
  const saldoHoje = totalReceivedIn - totalPaidOut;

  const descSorted = [...withBalance].reverse();
  const total = descSorted.length;
  const paginated = descSorted.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    items: paginated,
    totalEntradas,
    totalSaidas,
    resultado,
    saldoPeriodo: balance,
    saldoHoje,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
