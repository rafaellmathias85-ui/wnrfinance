/**
 * SCRIPT DE LIMPEZA DE LANÇAMENTOS
 *
 * Apaga todas as contas a pagar, contas a receber, conciliação e
 * extratos bancários PJ importados.
 *
 * MANTÉM: empresas, usuários, clientes, fornecedores, plano de contas,
 *         centros de custo, tags, conexões bancárias e configurações.
 *
 * EXECUÇÃO: node scripts/limpar-lancamentos.mjs
 *           ou: npx tsx scripts/limpar-lancamentos.mjs
 *
 * ⚠️  IRREVERSÍVEL — faça backup do banco antes de rodar.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Configuração ─────────────────────────────────────────────────────────────
const DRY_RUN = true;            // true = apenas mostra contagens, não apaga nada
const LIMPAR_NFE_BOLETO = true;  // apaga também NF-es e boletos/PIX (recomendado)
// ──────────────────────────────────────────────────────────────────────────────

async function count(table, where = '') {
  const sql = `SELECT COUNT(*)::int AS n FROM "${table}"${where ? ' WHERE ' + where : ''}`;
  const rows = await prisma.$queryRawUnsafe(sql);
  return rows[0].n;
}

async function del(table, where = '') {
  const sql = `DELETE FROM "${table}"${where ? ' WHERE ' + where : ''}`;
  const result = await prisma.$executeRawUnsafe(sql);
  return result;
}

async function mostrarContagens(label) {
  const pjReconc        = await count('PJReconciliation');
  const pjReconcLog     = await count('PJReconciliationLog');
  const bankTxPJ        = await count('bank_transactions', "person_type = 'PJ'");
  const importBatchPJ   = await count('import_batches', 'company_id IS NOT NULL');
  const payables        = await count('AccountsPayable');
  const receivables     = await count('AccountsReceivable');
  const accountPayTags  = await count('AccountPayableTag');
  const accountRecTags  = await count('AccountReceivableTag');
  const recNeg          = await count('ReceivableNegotiation');
  const recurrences     = await count('Recurrence');
  const nfes            = LIMPAR_NFE_BOLETO ? await count('NFe') : '-';
  const boletos         = LIMPAR_NFE_BOLETO ? await count('BoletoCharge') : '-';

  console.log(`\n${label}`);
  console.log('  PJReconciliation       :', pjReconc);
  console.log('  PJReconciliationLog    :', pjReconcLog);
  console.log('  BankTransaction (PJ)   :', bankTxPJ);
  console.log('  ImportBatch (PJ)       :', importBatchPJ);
  console.log('  AccountsPayable        :', payables);
  console.log('  AccountPayableTag      :', accountPayTags);
  console.log('  AccountsReceivable     :', receivables);
  console.log('  AccountReceivableTag   :', accountRecTags);
  console.log('  ReceivableNegotiation  :', recNeg);
  console.log('  Recurrence             :', recurrences);
  if (LIMPAR_NFE_BOLETO) {
    console.log('  NFe                    :', nfes);
    console.log('  BoletoCharge           :', boletos);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' LIMPEZA DE LANÇAMENTOS — WNR Finance');
  console.log('═══════════════════════════════════════════════════');
  if (DRY_RUN) {
    console.log(' ⚠️  DRY RUN ATIVO — nenhum dado será apagado');
  } else {
    console.log(' ⚠️  MODO REAL — dados serão APAGADOS permanentemente');
  }

  await mostrarContagens('ANTES DA LIMPEZA');

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN concluído. Altere DRY_RUN = false para executar.');
    return;
  }

  console.log('\nIniciando exclusão...');

  // 1. PJReconciliationLog (cascade filho de PJReconciliation)
  const r1 = await del('PJReconciliationLog');
  console.log(`  ✓ PJReconciliationLog    : ${r1} deletados`);

  // 2. PJReconciliation
  const r2 = await del('PJReconciliation');
  console.log(`  ✓ PJReconciliation       : ${r2} deletados`);

  // 3. Reconciliation PF + seus logs (cascadeiam de BankTransaction — deletar antes)
  const r3a = await del('ReconciliationLog');
  console.log(`  ✓ ReconciliationLog (PF) : ${r3a} deletados`);
  const r3b = await del('Reconciliation');
  console.log(`  ✓ Reconciliation (PF)    : ${r3b} deletados`);

  // 4. BankTransaction PJ
  const r4 = await del('bank_transactions', "person_type = 'PJ'");
  console.log(`  ✓ BankTransaction (PJ)   : ${r4} deletados`);

  // 5. ImportBatch PJ
  const r5 = await del('import_batches', 'company_id IS NOT NULL');
  console.log(`  ✓ ImportBatch (PJ)       : ${r5} deletados`);

  // 6. AccountPayableTag (cascade de AccountsPayable — deletar antes)
  const r6 = await del('AccountPayableTag');
  console.log(`  ✓ AccountPayableTag      : ${r6} deletados`);

  // 7. AccountReceivableTag + ReceivableNegotiation (antes de AccountsReceivable)
  const r7a = await del('AccountReceivableTag');
  console.log(`  ✓ AccountReceivableTag   : ${r7a} deletados`);
  const r7b = await del('ReceivableNegotiation');
  console.log(`  ✓ ReceivableNegotiation  : ${r7b} deletados`);

  // 8. AccountsPayable e AccountsReceivable
  const r8a = await del('AccountsPayable');
  console.log(`  ✓ AccountsPayable        : ${r8a} deletados`);
  const r8b = await del('AccountsReceivable');
  console.log(`  ✓ AccountsReceivable     : ${r8b} deletados`);

  // 9. Recurrence
  const r9 = await del('Recurrence');
  console.log(`  ✓ Recurrence             : ${r9} deletados`);

  // 10. NF-es e Boletos/PIX (opcional)
  if (LIMPAR_NFE_BOLETO) {
    const r10a = await del('NFe');
    console.log(`  ✓ NFe                    : ${r10a} deletados`);
    const r10b = await del('BoletoCharge');
    console.log(`  ✓ BoletoCharge           : ${r10b} deletados`);
  }

  await mostrarContagens('DEPOIS DA LIMPEZA');
  console.log('\n✅ Limpeza concluída com sucesso.');
}

main()
  .catch((e) => {
    console.error('\n❌ Erro durante a limpeza:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
