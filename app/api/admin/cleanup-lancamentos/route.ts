export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/admin/cleanup-lancamentos
// Body: { confirm: "CONFIRMO_EXCLUSAO", dryRun?: boolean, limparNfeBoleto?: boolean }
// Requer role master/admin
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const isAdmin = ['master', 'admin'].includes(session.user.role ?? '');
  if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await request.json();
  const dryRun: boolean = body.dryRun !== false; // default = true (seguro)
  const limparNfeBoleto: boolean = body.limparNfeBoleto === true;

  if (!dryRun && body.confirm !== 'CONFIRMO_EXCLUSAO') {
    return NextResponse.json(
      { error: 'Para executar a exclusão real, envie confirm: "CONFIRMO_EXCLUSAO"' },
      { status: 400 }
    );
  }

  async function cnt(table: string, where = '') {
    const sql = `SELECT COUNT(*)::int AS n FROM "${table}"${where ? ' WHERE ' + where : ''}`;
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(sql);
    return rows[0].n;
  }

  async function del(table: string, where = '') {
    if (dryRun) return 0;
    const sql = `DELETE FROM "${table}"${where ? ' WHERE ' + where : ''}`;
    return prisma.$executeRawUnsafe(sql);
  }

  // ─── Contagens ANTES ──────────────────────────────────────────────────────
  const antes = {
    pjReconciliationLog:  await cnt('PJReconciliationLog'),
    pjReconciliation:     await cnt('PJReconciliation'),
    reconciliationLog:    await cnt('ReconciliationLog'),
    reconciliation:       await cnt('Reconciliation'),
    bankTransactionPJ:    await cnt('bank_transactions', "person_type = 'PJ'"),
    importBatchPJ:        await cnt('import_batches', 'company_id IS NOT NULL'),
    accountPayableTag:    await cnt('AccountPayableTag'),
    accountReceivableTag: await cnt('AccountReceivableTag'),
    receivableNegotiation:await cnt('ReceivableNegotiation'),
    accountsPayable:      await cnt('AccountsPayable'),
    accountsReceivable:   await cnt('AccountsReceivable'),
    recurrence:           await cnt('Recurrence'),
    nfe:                  limparNfeBoleto ? await cnt('NFe') : null,
    boletoCharge:         limparNfeBoleto ? await cnt('BoletoCharge') : null,
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, antes });
  }

  // ─── Exclusão na ordem correta (respeitar FKs) ───────────────────────────
  const deleted: Record<string, number> = {};

  deleted.pjReconciliationLog   = await del('PJReconciliationLog');
  deleted.pjReconciliation      = await del('PJReconciliation');
  deleted.reconciliationLog     = await del('ReconciliationLog');
  deleted.reconciliation        = await del('Reconciliation');
  deleted.bankTransactionPJ     = await del('bank_transactions', "person_type = 'PJ'");
  deleted.importBatchPJ         = await del('import_batches', 'company_id IS NOT NULL');
  deleted.accountPayableTag     = await del('AccountPayableTag');
  deleted.accountReceivableTag  = await del('AccountReceivableTag');
  deleted.receivableNegotiation = await del('ReceivableNegotiation');
  deleted.accountsPayable       = await del('AccountsPayable');
  deleted.accountsReceivable    = await del('AccountsReceivable');
  deleted.recurrence            = await del('Recurrence');

  if (limparNfeBoleto) {
    deleted.nfe         = await del('NFe');
    deleted.boletoCharge= await del('BoletoCharge');
  }

  // ─── Contagens DEPOIS ────────────────────────────────────────────────────
  const depois = {
    pjReconciliation:  await cnt('PJReconciliation'),
    bankTransactionPJ: await cnt('bank_transactions', "person_type = 'PJ'"),
    accountsPayable:   await cnt('AccountsPayable'),
    accountsReceivable:await cnt('AccountsReceivable'),
    nfe:               limparNfeBoleto ? await cnt('NFe') : null,
    boletoCharge:      limparNfeBoleto ? await cnt('BoletoCharge') : null,
  };

  return NextResponse.json({ dryRun: false, antes, deleted, depois });
}
