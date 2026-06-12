export const dynamic = 'force-dynamic';

// Cron diário de faturamento recorrente (Faturamento V2).
// 1. Projeta parcelas PREVISTAS dos contratos ativos (rolling 12 meses)
// 2. Fatura parcelas cuja data de faturamento (venc − leadDays) chegou
//    → NFS-e + boleto/pix + e-mail, com estado por artefato
// 3. Marca VENCIDA o que passou do vencimento
// Protegido por CRON_SECRET (fail-closed em produção) + lock distribuído.

import { NextRequest, NextResponse } from 'next/server';
import { runDailyBillingPipeline } from '@/lib/billing-pipeline';
import { runRecurringContractBilling } from '@/lib/billing-automation';
import { isFeatureEnabled } from '@/lib/feature-flags';

function authorize(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';
  if (!cronSecret) {
    // fail-closed em produção: cron sem segredo configurado é rejeitado
    return process.env.NODE_ENV !== 'production';
  }
  return authHeader === `Bearer ${cronSecret}`;
}

async function handler(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get('companyId') || undefined;
  const limit = Number(url.searchParams.get('limit') || 200);

  // Lock distribuído: evita faturamento duplicado com múltiplas instâncias
  const { acquireLock } = await import('@/src/lib/distributed-lock');
  const release = await acquireLock('pj-recurring-billing', 20 * 60 * 1000);
  if (!release) {
    return NextResponse.json({ ok: false, skipped: 'lock_held' });
  }

  try {
    // Pipeline V2 (parcelas projetadas) quando a flag estiver ativa;
    // caso contrário, mantém o comportamento legado (gera no dia do vencimento).
    if (isFeatureEnabled('faturamento_v2', companyId)) {
      const result = await runDailyBillingPipeline({
        companyId,
        limit: Number.isFinite(limit) ? limit : 200,
      });
      return NextResponse.json({ ok: true, engine: 'v2', ...result, timestamp: new Date().toISOString() });
    }

    const result = await runRecurringContractBilling({
      companyId,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    return NextResponse.json({ ok: true, engine: 'legacy', ...result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao processar faturamento recorrente' },
      { status: 500 },
    );
  } finally {
    await release();
  }
}

export async function POST(req: NextRequest) {
  return handler(req);
}

export async function GET(req: NextRequest) {
  return handler(req);
}
