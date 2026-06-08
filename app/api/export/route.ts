export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateCSV, generateXLSX, fmtBRL, fmtDate, ExportColumn } from '@/lib/export';
import { createAuditLog } from '@/lib/audit-log';

// GET /api/export?type=expenses|incomes|payables|receivables|cashflow|dre&format=csv|xlsx&startDate=&endDate=
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'expenses';
    const format = (searchParams.get('format') || 'csv') as 'csv' | 'xlsx';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const userId = session.user.id;
    const companyId = session.user.activeCompanyId;
    const isPJ = session.user.defaultEnv === 'pj' && !!companyId;

    const dateFilter = (startDate || endDate) ? {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    } : undefined;

    const period = startDate && endDate
      ? `${fmtDate(startDate)} a ${fmtDate(endDate)}`
      : undefined;

    let rows: any[] = [];
    let columns: ExportColumn[] = [];
    let title = '';
    let totals: Record<string, any> | undefined;

    // ── Expenses (PF) ──────────────────────────────────────────────────
    if (type === 'expenses') {
      const data = await prisma.expense.findMany({
        where: {
          ...(isPJ ? { companyId } : { userId, companyId: null }),
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        orderBy: { date: 'desc' },
        include: { tags: { include: { tag: true } } },
      });
      title = 'Despesas';
      columns = [
        { key: 'date', label: 'Data', format: fmtDate },
        { key: 'description', label: 'Descrição' },
        { key: 'category', label: 'Categoria' },
        { key: 'status', label: 'Status' },
        { key: 'paymentMethod', label: 'Forma de Pagamento' },
        { key: 'amount', label: 'Valor (R$)', format: fmtBRL },
      ];
      rows = data.map((e) => ({ ...e, tags: e.tags.map((t) => t.tag.name).join(', ') }));
      const total = data.reduce((s, e) => s + e.amount, 0);
      totals = { date: '', description: 'TOTAL', category: '', status: '', paymentMethod: '', amount: total };

    // ── Incomes (PF) ───────────────────────────────────────────────────
    } else if (type === 'incomes') {
      const data = await prisma.income.findMany({
        where: {
          ...(isPJ ? { companyId } : { userId, companyId: null }),
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        orderBy: { date: 'desc' },
      });
      title = 'Receitas';
      columns = [
        { key: 'date', label: 'Data', format: fmtDate },
        { key: 'description', label: 'Descrição' },
        { key: 'type', label: 'Tipo' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Valor (R$)', format: fmtBRL },
      ];
      rows = data;
      const total = data.reduce((s, e) => s + e.amount, 0);
      totals = { date: '', description: 'TOTAL', type: '', status: '', amount: total };

    // ── Payables (PJ) ──────────────────────────────────────────────────
    } else if (type === 'payables' && isPJ) {
      const data = await prisma.accountsPayable.findMany({
        where: {
          companyId: companyId!,
          ...(dateFilter ? { dueDate: dateFilter } : {}),
        },
        orderBy: { dueDate: 'asc' },
        include: { category: { select: { name: true } }, costCenter: { select: { name: true } } },
      });
      title = 'Contas a Pagar';
      columns = [
        { key: 'dueDate', label: 'Vencimento', format: fmtDate },
        { key: 'description', label: 'Descrição' },
        { key: 'supplierName', label: 'Fornecedor' },
        { key: 'categoryName', label: 'Categoria' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Valor (R$)', format: fmtBRL },
        { key: 'amountPaid', label: 'Pago (R$)', format: (v) => v ? fmtBRL(v) : '-' },
      ];
      rows = data.map((r) => ({ ...r, categoryName: r.category?.name || '', costCenterName: r.costCenter?.name || '' }));
      const total = data.reduce((s, e) => s + e.amount, 0);
      const paid = data.reduce((s, e) => s + (e.amountPaid || 0), 0);
      totals = { dueDate: '', description: 'TOTAL', supplierName: '', categoryName: '', status: '', amount: total, amountPaid: paid };

    // ── Receivables (PJ) ───────────────────────────────────────────────
    } else if (type === 'receivables' && isPJ) {
      const data = await prisma.accountsReceivable.findMany({
        where: {
          companyId: companyId!,
          ...(dateFilter ? { dueDate: dateFilter } : {}),
        },
        orderBy: { dueDate: 'asc' },
        include: { category: { select: { name: true } } },
      });
      title = 'Contas a Receber';
      columns = [
        { key: 'dueDate', label: 'Vencimento', format: fmtDate },
        { key: 'description', label: 'Descrição' },
        { key: 'customerName', label: 'Cliente' },
        { key: 'categoryName', label: 'Categoria' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Valor (R$)', format: fmtBRL },
        { key: 'amountReceived', label: 'Recebido (R$)', format: (v) => v ? fmtBRL(v) : '-' },
      ];
      rows = data.map((r) => ({ ...r, categoryName: r.category?.name || '' }));
      const total = data.reduce((s, e) => s + e.amount, 0);
      const received = data.reduce((s, e) => s + (e.amountReceived || 0), 0);
      totals = { dueDate: '', description: 'TOTAL', customerName: '', categoryName: '', status: '', amount: total, amountReceived: received };

    // ── Investments (PF/PJ) ────────────────────────────────────────────
    } else if (type === 'investments') {
      if (isPJ) {
        const data = await prisma.pJInvestment.findMany({
          where: { companyId: companyId! },
          orderBy: { applicationDate: 'desc' },
        });
        title = 'Investimentos PJ';
        columns = [
          { key: 'applicationDate', label: 'Aplicação', format: fmtDate },
          { key: 'institutionName', label: 'Instituição' },
          { key: 'productName', label: 'Produto' },
          { key: 'investmentType', label: 'Tipo' },
          { key: 'maturityDate', label: 'Vencimento', format: (v) => v ? fmtDate(v) : '-' },
          { key: 'amountInvested', label: 'Aplicado (R$)', format: fmtBRL },
          { key: 'currentValue', label: 'Valor Atual (R$)', format: fmtBRL },
          { key: 'status', label: 'Status' },
        ];
        rows = data;
      } else {
        const data = await prisma.investment.findMany({
          where: { userId },
          orderBy: { purchaseDate: 'desc' },
        });
        title = 'Investimentos';
        columns = [
          { key: 'purchaseDate', label: 'Compra', format: fmtDate },
          { key: 'name', label: 'Nome' },
          { key: 'type', label: 'Tipo' },
          { key: 'broker', label: 'Corretora' },
          { key: 'maturityDate', label: 'Vencimento', format: (v) => v ? fmtDate(v) : '-' },
          { key: 'amount', label: 'Aplicado (R$)', format: fmtBRL },
          { key: 'currentValue', label: 'Atual (R$)', format: fmtBRL },
        ];
        rows = data;
      }

    // ── NF-e (PJ) ─────────────────────────────────────────────────────
    } else if (type === 'nfe' && isPJ) {
      const data = await prisma.nFe.findMany({
        where: {
          companyId: companyId!,
          ...(dateFilter ? { issuedAt: dateFilter } : {}),
        },
        orderBy: { issuedAt: 'desc' },
      });
      title = 'Notas Fiscais';
      columns = [
        { key: 'issuedAt', label: 'Emissão', format: fmtDate },
        { key: 'number', label: 'Número' },
        { key: 'customerName', label: 'Cliente' },
        { key: 'customerDoc', label: 'CNPJ/CPF' },
        { key: 'status', label: 'Status' },
        { key: 'totalValue', label: 'Valor Total (R$)', format: (v) => v ? fmtBRL(v) : '-' },
        { key: 'accessKey', label: 'Chave de Acesso' },
      ];
      rows = data.map((n) => ({
        ...n,
        totalValue: (n.totals as any)?.totalNota || 0,
      }));
      const total = rows.reduce((s, e) => s + e.totalValue, 0);
      totals = { issuedAt: '', number: '', customerName: '', customerDoc: '', status: 'TOTAL', totalValue: total, accessKey: '' };

    // ── Bank Transactions (PF/PJ) ──────────────────────────────────────
    } else if (type === 'bank-transactions') {
      const data = await prisma.bankTransaction.findMany({
        where: {
          bankConnection: {
            ...(isPJ ? { companyId } : { userId, companyId: null }),
          },
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        orderBy: { date: 'desc' },
        include: { bankConnection: { select: { bankName: true, accountType: true } } },
        take: 5000,
      });
      title = 'Transações Bancárias';
      columns = [
        { key: 'date', label: 'Data', format: fmtDate },
        { key: 'bankName', label: 'Banco' },
        { key: 'description', label: 'Descrição' },
        { key: 'type', label: 'Tipo' },
        { key: 'category', label: 'Categoria' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Valor (R$)', format: fmtBRL },
        { key: 'balance', label: 'Saldo (R$)', format: (v) => v != null ? fmtBRL(v) : '-' },
      ];
      rows = data.map((t) => ({
        ...t,
        bankName: t.bankConnection?.bankName || '',
      }));

    } else {
      return NextResponse.json({ error: 'Tipo de exportação inválido' }, { status: 400 });
    }

    // Generate output
    let content: string;
    let mimeType: string;
    let ext: string;

    if (format === 'xlsx') {
      content = generateXLSX({ title, period, columns, rows, totals, format: 'xlsx' });
      mimeType = 'application/vnd.ms-excel';
      ext = 'xls';
    } else {
      content = generateCSV({ title, period, columns, rows, totals, format: 'csv' });
      mimeType = 'text/csv;charset=utf-8';
      ext = 'csv';
    }

    const filename = `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.${ext}`;

    await createAuditLog({
      userId,
      companyId,
      action: 'EXPORT',
      entity: 'report',
      metadata: { type, format, period },
      request,
    });

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Erro ao exportar' }, { status: 500 });
  }
}
