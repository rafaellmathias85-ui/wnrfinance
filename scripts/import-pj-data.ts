/**
 * Import script: populates the active company with bank accounts,
 * categories, clients, suppliers, and financial movements from
 * the 2025 financial data export.
 *
 * Run: npx ts-node --project tsconfig.json scripts/import-pj-data.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ImportData {
  categories: { name: string; type: string }[];
  clients: { name: string; document: string }[];
  suppliers: { name: string; document: string }[];
  employees: { name: string; document: string }[];
  movements: {
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
  }[];
}

async function main() {
  console.log('=== WNR Finance PJ Data Import ===\n');

  // Load processed import data
  const dataPath = path.join(__dirname, 'import_data.json');
  const data: ImportData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Find the primary admin user with an active company
  const user = await prisma.user.findFirst({
    where: { role: 'admin', activeCompanyId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) throw new Error('No admin user with an active company found');

  // Get the active company
  const company = await prisma.company.findUnique({
    where: { id: user.activeCompanyId! },
  });
  if (!company) throw new Error('No company found for this user');

  console.log(`User: ${user.email}`);
  console.log(`Company: ${company.name} (${company.cnpj})`);
  console.log();

  // ── 1. Bank Connections ──────────────────────────────────────────────
  console.log('Creating bank connections...');

  const itau = await prisma.bankConnection.upsert({
    where: { provider_connectionId: { provider: 'itau_pj', connectionId: 'itau-0263-0050212-2' } },
    update: {},
    create: {
      userId: user.id,
      companyId: company.id,
      scope: 'PJ',
      personType: 'PJ',
      provider: 'itau_pj',
      connectionId: 'itau-0263-0050212-2',
      connectionMode: 'OFX',
      bankName: 'Itaú Unibanco',
      bankCode: 'ITAU',
      status: 'ACTIVE',
      accountType: 'checking',
      agency: '0263',
      accountNumber: '0050212',
      accountDigit: '2',
      openingBalance: 0,
      currentBalance: 0,
      allowsPayments: true,
      allowsReceipts: true,
      allowsTransfers: true,
    },
  });
  console.log(`  ✓ Itaú Ag. 0263 / CC 0050212-2 (id: ${itau.id})`);

  const inter = await prisma.bankConnection.upsert({
    where: { provider_connectionId: { provider: 'inter_pj', connectionId: 'inter-0001-9-29901132-1' } },
    update: {},
    create: {
      userId: user.id,
      companyId: company.id,
      scope: 'PJ',
      personType: 'PJ',
      provider: 'inter_pj',
      connectionId: 'inter-0001-9-29901132-1',
      connectionMode: 'OFX',
      bankName: 'Banco Inter',
      bankCode: 'INTER',
      status: 'ACTIVE',
      accountType: 'checking',
      agency: '0001',
      accountNumber: '29901132',
      accountDigit: '1',
      openingBalance: 0,
      currentBalance: 0,
      allowsPayments: true,
      allowsReceipts: true,
      allowsTransfers: true,
    },
  });
  console.log(`  ✓ Inter Ag. 0001-9 / CC 29901132-1 (id: ${inter.id})`);
  console.log();

  // ── 2. Business Categories ───────────────────────────────────────────
  console.log('Creating categories...');
  const categoryMap: Record<string, string> = {}; // name → id

  for (const cat of data.categories) {
    try {
      const existing = await prisma.businessCategory.upsert({
        where: { companyId_name: { companyId: company.id, name: cat.name } },
        update: {},
        create: {
          companyId: company.id,
          name: cat.name,
          type: cat.type,
          isActive: true,
        },
      });
      categoryMap[cat.name] = existing.id;
    } catch (e: any) {
      console.warn(`  ⚠ Category skip: ${cat.name} — ${e.message}`);
    }
  }
  console.log(`  ✓ ${Object.keys(categoryMap).length} categories`);
  console.log();

  // ── 3. Clients ───────────────────────────────────────────────────────
  console.log('Creating clients...');
  let clientCount = 0;
  const clientMap: Record<string, string> = {}; // name → id

  for (const cl of data.clients) {
    const cnpj = cl.document.includes('/') ? cl.document : undefined;
    const cpf = cl.document && !cl.document.includes('/') ? cl.document : undefined;

    // Try to find existing by document or name
    let existing = cl.document
      ? await prisma.client.findFirst({
          where: { companyId: company.id, OR: [{ cnpj: cl.document }, { cpf: cl.document }, { document: cl.document }] },
        })
      : null;

    if (!existing) {
      existing = await prisma.client.findFirst({
        where: { companyId: company.id, name: cl.name },
      });
    }

    if (!existing) {
      existing = await prisma.client.create({
        data: {
          companyId: company.id,
          name: cl.name,
          document: cl.document || null,
          cnpj: cnpj || null,
          cpf: cpf || null,
          clientType: cnpj ? 'PJ' : 'PF',
          isActive: true,
          rating: 3,
        },
      });
      clientCount++;
    }
    clientMap[cl.name] = existing.id;
  }
  console.log(`  ✓ ${clientCount} clients created (${data.clients.length} total)`);
  console.log();

  // ── 4. Suppliers ─────────────────────────────────────────────────────
  console.log('Creating suppliers...');
  let supplierCount = 0;

  for (const sup of data.suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { companyId: company.id, name: sup.name },
    });
    if (!existing) {
      await prisma.supplier.create({
        data: {
          companyId: company.id,
          name: sup.name,
          document: sup.document || null,
          isActive: true,
        },
      });
      supplierCount++;
    }
  }
  console.log(`  ✓ ${supplierCount} suppliers created`);

  // Employees as suppliers too
  for (const emp of data.employees) {
    const existing = await prisma.supplier.findFirst({
      where: { companyId: company.id, name: emp.name },
    });
    if (!existing) {
      await prisma.supplier.create({
        data: {
          companyId: company.id,
          name: emp.name,
          document: emp.document || null,
          isActive: true,
          notes: 'Funcionário',
        },
      });
      supplierCount++;
    }
  }
  console.log(`  ✓ ${supplierCount} total suppliers/employees created`);
  console.log();

  // ── 5. Financial Movements ───────────────────────────────────────────
  console.log('Creating financial movements...');
  let receivableCount = 0;
  let payableCount = 0;
  let skipped = 0;

  for (const mv of data.movements) {
    const dueDate = new Date(mv.dueDate + 'T12:00:00.000Z');
    const categoryId = categoryMap[mv.cat] || null;

    if (mv.tipo === 'Receita') {
      // AccountsReceivable
      const existing = await prisma.accountsReceivable.findFirst({
        where: {
          companyId: company.id,
          dueDate,
          amount: mv.amount,
          customerName: mv.name || null,
        },
      });

      if (!existing) {
        await prisma.accountsReceivable.create({
          data: {
            companyId: company.id,
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
        receivableCount++;
      } else {
        skipped++;
      }
    } else if (mv.tipo === 'Despesa') {
      // AccountsPayable
      const existing = await prisma.accountsPayable.findFirst({
        where: {
          companyId: company.id,
          dueDate,
          amount: mv.amount,
          supplierName: mv.name || null,
        },
      });

      if (!existing) {
        const paymentMethod = mv.payMethod === 'boleto' ? 'BOLETO'
          : mv.payMethod === 'pix' ? 'PIX'
          : mv.payMethod === 'transferencia' ? 'TRANSFERENCIA'
          : null;

        await prisma.accountsPayable.create({
          data: {
            companyId: company.id,
            description: mv.desc || `Pagamento para ${mv.name || 'fornecedor'}`,
            supplierName: mv.name || null,
            categoryId,
            dueDate,
            amount: mv.amount,
            amountPaid: mv.quitado ? mv.amount : null,
            paidAt: mv.quitado ? dueDate : null,
            status: mv.status,
            paymentMethod: paymentMethod || undefined,
            launchType: 'fornecedor',
            isRecurring: false,
          },
        });
        payableCount++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`  ✓ ${receivableCount} accounts receivable created`);
  console.log(`  ✓ ${payableCount} accounts payable created`);
  if (skipped > 0) console.log(`  ⚠ ${skipped} movements skipped (already exist)`);
  console.log();

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('=== Import Complete ===');
  console.log(`  Bank connections:   2 (Itaú + Inter)`);
  console.log(`  Categories:         ${Object.keys(categoryMap).length}`);
  console.log(`  Clients:            ${data.clients.length}`);
  console.log(`  Suppliers:          ${data.suppliers.length + data.employees.length}`);
  console.log(`  AccountsReceivable: ${receivableCount}`);
  console.log(`  AccountsPayable:    ${payableCount}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
