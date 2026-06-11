export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { bankingController } from '@/src/modules/banking/banking.controller';

/**
 * POST /api/banking/sync-auto
 *
 * Disparado por cron job (ou manualmente com CRON_SECRET).
 * Sincroniza todas as contas PJ via API que tenham autoExtrato=true em extraConfig.
 * O startDate é determinado automaticamente com base na última transação importada.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
  }

  // Busca todas as conexões API ativas
  const candidates = await prisma.bankConnection.findMany({
    where: {
      connectionMode: 'API',
      personType: 'PJ',
      status: { notIn: ['DISABLED'] },
    },
    select: {
      id: true,
      userId: true,
      companyId: true,
      bankName: true,
      extraConfig: true,
    },
  });

  // Filtra as que têm autoExtrato habilitado
  const toSync = candidates.filter(c => (c.extraConfig as any)?.autoExtrato === true);

  if (toSync.length === 0) {
    return NextResponse.json({ message: 'Nenhuma conta com extrato automático habilitado.', synced: 0 });
  }

  const results: Array<{
    connectionId: string;
    bankName: string;
    imported?: number;
    skipped?: number;
    syncRange?: { startDate: Date; endDate: Date };
    error?: string;
  }> = [];

  for (const conn of toSync) {
    try {
      const result = await bankingController.syncConnection({
        userId: conn.userId,
        companyId: conn.companyId,
        connectionId: conn.id,
        automatic: true,
        request: req,
      });
      results.push({
        connectionId: conn.id,
        bankName: conn.bankName,
        imported: result.imported,
        skipped: result.skipped,
        syncRange: (result as any).syncRange,
      });
    } catch (error: any) {
      results.push({
        connectionId: conn.id,
        bankName: conn.bankName,
        error: error?.message || 'Erro desconhecido',
      });
    }
  }

  const totalImported = results.reduce((s, r) => s + (r.imported ?? 0), 0);
  const errors = results.filter(r => r.error);

  return NextResponse.json({
    synced: toSync.length,
    totalImported,
    errors: errors.length,
    results,
  });
}
