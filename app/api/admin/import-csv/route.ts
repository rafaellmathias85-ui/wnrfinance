export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ── CSV column names (same as the Python script) ──────────────────────────────
const EMPLOYEE_CATS = new Set([
  'Salário / Funcionário', 'Reembolso / Funcionário', 'Horas Extras / Funcionário',
  'Vale Alimentação / Funcionário', 'Vale Transporte / Funcionário',
  'FGTS / Funcionário', 'Seguro de Vida / Funcionário',
  'Assistência Medica / Funcionário', 'Cursos e Treinamentos / Funcionário',
]);

const PAY_MAP: Record<string, string> = {
  'Boleto Bancário': 'boleto', 'Boleto Bancario': 'boleto',
  'Pix': 'pix', 'PIX': 'pix',
  'Transferência Bancária': 'transferencia', 'Transferencia Bancaria': 'transferencia',
  'Débito em Conta': 'debito', 'Debito em Conta': 'debito',
};

// ── Parse a semicolon-delimited CSV string ─────────────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Strip BOM from first line
  const headerLine = lines[0].replace(/^﻿/, '').replace(/^﻿/, '');

  // Auto-detect delimiter: prefer ';' if present, else ','
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = headerLine.split(delimiter).map(h => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ── Decode Buffer trying UTF-8 first, then Latin-1 ────────────────────────────
function decodeBuffer(buf: Buffer): string {
  try {
    const decoded = buf.toString('utf8');
    // Sanity-check: if no replacement chars, it's valid UTF-8
    if (!decoded.includes('�')) return decoded;
  } catch {}
  return buf.toString('latin1');
}

// ── Main import logic (mirrors import-seed route) ─────────────────────────────
async function importRows(rows: Record<string, string>[], companyId: string) {
  const results = { categories: 0, clients: 0, suppliers: 0, employees: 0, receivables: 0, payables: 0, skipped: 0 };

  // ── Deduplicate categories ──────────────────────────────────────────────────
  const catMap: Record<string, string> = {};
  const seenCats = new Map<string, string>();
  for (const r of rows) {
    const cat = (r['Categoria'] ?? '').trim();
    const tipo = (r['Tipo'] ?? '').trim();
    if (!cat || seenCats.has(cat)) continue;
    const catType = EMPLOYEE_CATS.has(cat) ? 'despesa' : tipo === 'Receita' ? 'receita' : 'despesa';
    seenCats.set(cat, catType);
  }
  for (const [name, type] of seenCats) {
    const upserted = await prisma.businessCategory.upsert({
      where: { companyId_name: { companyId, name } },
      update: {},
      create: { companyId, name, type, isActive: true },
    });
    catMap[name] = upserted.id;
    results.categories++;
  }

  // ── Clients (Receita rows) ─────────────────────────────────────────────────
  const clientMap: Record<string, string> = {};
  const seenClients = new Map<string, string>();
  for (const r of rows) {
    const tipo = (r['Tipo'] ?? '').trim();
    const name = (r['Cliente/Fornecedor'] ?? '').trim();
    const doc = (r['Documento Cliente/Fornecedor'] ?? '').trim();
    if (tipo === 'Receita' && name && name !== 'Diversos' && !seenClients.has(name)) {
      seenClients.set(name, doc);
    }
  }
  for (const [name, doc] of seenClients) {
    let existing = doc
      ? await prisma.client.findFirst({ where: { companyId, OR: [{ cnpj: doc }, { cpf: doc }, { document: doc }] } })
      : null;
    if (!existing) existing = await prisma.client.findFirst({ where: { companyId, name } });
    if (!existing) {
      const isCnpj = doc?.includes('/');
      existing = await prisma.client.create({
        data: {
          companyId, name, document: doc || null,
          cnpj: isCnpj ? doc : null, cpf: !isCnpj && doc ? doc : null,
          clientType: isCnpj ? 'PJ' : 'PF', isActive: true, rating: 3,
        },
      });
      results.clients++;
    }
    clientMap[name] = existing.id;
  }

  // ── Suppliers & Employees (Despesa rows) ───────────────────────────────────
  const SKIP_NAMES = new Set(['Diversos', 'DARF - DCTFWEB', 'DAS', 'FGTS', 'ITAU- TARIFAS', 'CDB - INTER']);
  const seenPeople = new Map<string, { doc: string; isEmployee: boolean }>();
  for (const r of rows) {
    const tipo = (r['Tipo'] ?? '').trim();
    const name = (r['Cliente/Fornecedor'] ?? '').trim();
    const doc = (r['Documento Cliente/Fornecedor'] ?? '').trim();
    const cat = (r['Categoria'] ?? '').trim();
    if (tipo === 'Despesa' && name && !SKIP_NAMES.has(name) && !seenPeople.has(name)) {
      seenPeople.set(name, { doc, isEmployee: EMPLOYEE_CATS.has(cat) });
    }
  }
  for (const [name, { doc, isEmployee }] of seenPeople) {
    const existing = await prisma.supplier.findFirst({ where: { companyId, name } });
    if (!existing) {
      await prisma.supplier.create({
        data: { companyId, name, document: doc || null, supplierType: isEmployee ? 'employee' : 'supplier', isActive: true },
      });
      if (isEmployee) results.employees++; else results.suppliers++;
    } else if (isEmployee && existing.supplierType !== 'employee') {
      await prisma.supplier.update({ where: { id: existing.id }, data: { supplierType: 'employee' } });
    }
  }

  // ── Movements ──────────────────────────────────────────────────────────────
  for (const r of rows) {
    const tipo = (r['Tipo'] ?? '').trim();
    const cat = (r['Categoria'] ?? '').trim();
    const name = (r['Cliente/Fornecedor'] ?? '').trim();
    const quitadoStr = (r['Quitado'] ?? '').trim();
    const vencimento = (r['Vencimento'] ?? '').trim();
    const valorStr = (r['Valor (R$)'] ?? '').trim();
    const nf = (r['Numero da Nota Fiscal'] ?? '').trim();
    const forma = (r['Forma de Pagamento - Quitação'] ?? r['Forma de Pagamento - Parcela'] ?? '').trim();
    const desc = (r['Observação/Descrição'] ?? r['Observacao/Descricao'] ?? '').trim();

    if (!vencimento || !valorStr) continue;

    // Parse date DD/MM/YYYY
    const parts = vencimento.split('/');
    if (parts.length !== 3) continue;
    const [d, m, y] = parts;
    const dueDate = new Date(`${y}-${m}-${d}T12:00:00.000Z`);
    if (isNaN(dueDate.getTime())) continue;

    const amount = parseFloat(valorStr.replace(',', '.'));
    if (isNaN(amount)) continue;

    const quitado = quitadoStr === 'Sim';
    const status = quitado ? (tipo === 'Receita' ? 'recebido' : 'pago') : 'pendente';
    const categoryId = catMap[cat] || null;
    const paymentMethod = PAY_MAP[forma] ?? null;

    if (tipo === 'Receita') {
      const existing = await prisma.accountsReceivable.findFirst({
        where: { companyId, dueDate, amount, customerName: name || null },
      });
      if (!existing) {
        await prisma.accountsReceivable.create({
          data: {
            companyId,
            description: desc || `Recebimento de ${name || 'cliente'}`,
            customerName: name || null, categoryId, dueDate, amount,
            amountReceived: quitado ? amount : null,
            receivedAt: quitado ? dueDate : null,
            status, launchType: 'venda', sourceType: 'manual',
            notes: nf ? `NF: ${nf}` : null, isRecurring: false,
          },
        });
        results.receivables++;
      } else { results.skipped++; }
    } else if (tipo === 'Despesa') {
      const existing = await prisma.accountsPayable.findFirst({
        where: { companyId, dueDate, amount, supplierName: name || null },
      });
      if (!existing) {
        await prisma.accountsPayable.create({
          data: {
            companyId,
            description: desc || `Pagamento para ${name || 'fornecedor'}`,
            supplierName: name || null, categoryId, dueDate, amount,
            amountPaid: quitado ? amount : null,
            paidAt: quitado ? dueDate : null,
            status,
            paymentMethod: (paymentMethod as any) ?? undefined,
            launchType: 'fornecedor', isRecurring: false,
          },
        });
        results.payables++;
      } else { results.skipped++; }
    }
  }

  return results;
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || !['admin', 'master'].includes(user.role)) {
      return NextResponse.json({ error: 'Apenas admins podem executar o import' }, { status: 403 });
    }

    const companyId = (session.user as any).activeCompanyId ?? user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'txt'].includes(ext ?? '')) {
      return NextResponse.json({ error: 'Apenas arquivos .csv são aceitos' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const text = decodeBuffer(buf);
    const rows = parseCsv(text);

    if (rows.length === 0) return NextResponse.json({ error: 'Arquivo CSV vazio ou sem dados' }, { status: 400 });

    const results = await importRows(rows, companyId);
    return NextResponse.json({ ok: true, fileName: file.name, totalRows: rows.length, results });
  } catch (error: any) {
    console.error('[import-csv POST]', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
