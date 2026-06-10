export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import * as path from 'path';
import * as fs from 'fs';

interface Movement {
  tipo: string;
  conta: string;
  cat: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  payMethod: string;
  nf: string;
  desc: string;
  quitado: boolean;
}

interface ImportData {
  categories: { name: string; type: string }[];
  clients: { name: string; document: string }[];
  suppliers: { name: string; document: string }[];
  employees: { name: string; document: string }[];
  movements: Movement[];
}

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

    // Load import data
    const dataPath = path.join(process.cwd(), 'scripts', 'import_data.json');
    if (!fs.existsSync(dataPath)) {
      return NextResponse.json({ error: 'import_data.json não encontrado em scripts/' }, { status: 404 });
    }
    const data: ImportData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    const results = {
      bankConnections: 0,
      categories: 0,
      clients: 0,
      suppliers: 0,
      receivables: 0,
      payables: 0,
      skipped: 0,
    };

    // ── Bank Connections ───────────────────────────────────────────────
    const bankDefs = [
      {
        provider: 'itau_pj', connectionId: 'itau-0263-0050212-2',
        bankName: 'Itaú Unibanco', bankCode: 'ITAU',
        agency: '0263', accountNumber: '0050212', accountDigit: '2',
      },
      {
        provider: 'inter_pj', connectionId: 'inter-0001-9-29901132-1',
        bankName: 'Banco Inter', bankCode: 'INTER',
        agency: '0001', accountNumber: '29901132', accountDigit: '1',
      },
    ];

    for (const b of bankDefs) {
      const existing = await prisma.bankConnection.findFirst({
        where: { companyId, provider: b.provider },
      });
      if (!existing) {
        await prisma.bankConnection.create({
          data: {
            userId: user.id,
            companyId,
            scope: 'PJ',
            personType: 'PJ',
            provider: b.provider,
            connectionId: b.connectionId,
            connectionMode: 'OFX',
            bankName: b.bankName,
            bankCode: b.bankCode,
            status: 'ACTIVE',
            accountType: 'checking',
            agency: b.agency,
            accountNumber: b.accountNumber,
            accountDigit: b.accountDigit,
            openingBalance: 0,
            currentBalance: 0,
            allowsPayments: true,
            allowsReceipts: true,
            allowsTransfers: true,
          },
        });
        results.bankConnections++;
      }
    }

    // ── Categories ─────────────────────────────────────────────────────
    const categoryMap: Record<string, string> = {};
    for (const cat of data.categories) {
      const upserted = await prisma.businessCategory.upsert({
        where: { companyId_name: { companyId, name: cat.name } },
        update: {},
        create: { companyId, name: cat.name, type: cat.type, isActive: true },
      });
      categoryMap[cat.name] = upserted.id;
      results.categories++;
    }

    // ── Clients ────────────────────────────────────────────────────────
    const clientMap: Record<string, string> = {};
    for (const cl of data.clients) {
      const isCnpj = cl.document?.includes('/');
      let existing = cl.document
        ? await prisma.client.findFirst({
            where: {
              companyId,
              OR: [{ cnpj: cl.document }, { cpf: cl.document }, { document: cl.document }],
            },
          })
        : null;
      if (!existing) {
        existing = await prisma.client.findFirst({ where: { companyId, name: cl.name } });
      }
      if (!existing) {
        existing = await prisma.client.create({
          data: {
            companyId,
            name: cl.name,
            document: cl.document || null,
            cnpj: isCnpj ? cl.document : null,
            cpf: !isCnpj && cl.document ? cl.document : null,
            clientType: isCnpj ? 'PJ' : 'PF',
            isActive: true,
            rating: 3,
          },
        });
        results.clients++;
      }
      clientMap[cl.name] = existing.id;
    }

    // ── Suppliers ─────────────────────────────────────────────────────
    for (const sup of data.suppliers) {
      const existing = await prisma.supplier.findFirst({ where: { companyId, name: sup.name } });
      if (!existing) {
        await prisma.supplier.create({
          data: {
            companyId,
            name: sup.name,
            document: sup.document || null,
            supplierType: 'supplier',
            isActive: true,
          },
        });
        results.suppliers++;
      }
    }

    // ── Employees ─────────────────────────────────────────────────────
    for (const emp of data.employees) {
      const existing = await prisma.supplier.findFirst({ where: { companyId, name: emp.name } });
      if (!existing) {
        await prisma.supplier.create({
          data: {
            companyId,
            name: emp.name,
            document: emp.document || null,
            supplierType: 'employee',
            isActive: true,
          },
        });
        results.suppliers++;
      } else if (existing.supplierType !== 'employee') {
        await prisma.supplier.update({ where: { id: existing.id }, data: { supplierType: 'employee' } });
      }
    }

    // ── Financial Movements ────────────────────────────────────────────
    for (const mv of data.movements) {
      const dueDate = new Date(mv.dueDate + 'T12:00:00.000Z');
      const categoryId = categoryMap[mv.cat] || null;

      if (mv.tipo === 'Receita') {
        const existing = await prisma.accountsReceivable.findFirst({
          where: { companyId, dueDate, amount: mv.amount, customerName: mv.name || null },
        });
        if (!existing) {
          await prisma.accountsReceivable.create({
            data: {
              companyId,
              description: mv.desc || `Recebimento de ${mv.name || 'cliente'}`,
              customerName: mv.name || null,
              categoryId,
              dueDate,
              amount: mv.amount,
              amountReceived: mv.quitado ? mv.amount : null,
              receivedAt: mv.quitado ? dueDate : null,
              status: mv.status,
              launchType: 'venda',
              sourceType: 'manual',
              notes: mv.nf ? `NF: ${mv.nf}` : null,
              isRecurring: false,
            },
          });
          results.receivables++;
        } else {
          results.skipped++;
        }
      } else if (mv.tipo === 'Despesa') {
        const existing = await prisma.accountsPayable.findFirst({
          where: { companyId, dueDate, amount: mv.amount, supplierName: mv.name || null },
        });
        if (!existing) {
          const paymentMethod =
            mv.payMethod === 'boleto' ? 'BOLETO'
            : mv.payMethod === 'pix' ? 'PIX'
            : mv.payMethod === 'transferencia' ? 'TRANSFERENCIA'
            : null;
          await prisma.accountsPayable.create({
            data: {
              companyId,
              description: mv.desc || `Pagamento para ${mv.name || 'fornecedor'}`,
              supplierName: mv.name || null,
              categoryId,
              dueDate,
              amount: mv.amount,
              amountPaid: mv.quitado ? mv.amount : null,
              paidAt: mv.quitado ? dueDate : null,
              status: mv.status,
              paymentMethod: paymentMethod ?? undefined,
              launchType: 'fornecedor',
              isRecurring: false,
            },
          });
          results.payables++;
        } else {
          results.skipped++;
        }
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    console.error('[import-seed POST]', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
