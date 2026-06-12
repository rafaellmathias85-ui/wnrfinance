export const dynamic = 'force-dynamic';

// Conciliação V2 — lista de lotes ("Arquivos de conciliação", paridade BomControle)
// GET  /api/reconciliation/batches?status=&connectionId=&from=&to=&page=
// POST /api/reconciliation/batches  { action: 'refresh', batchId }  → recalcula contadores

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { importBatchService } from '@/src/modules/reconciliation/import-batch.service';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'pj'; // pj | pf
    const companyId = scope === 'pj' ? session.user.activeCompanyId : null;
    if (scope === 'pj' && !companyId) {
      return NextResponse.json({ error: 'Empresa ativa não selecionada' }, { status: 400 });
    }

    const result = await importBatchService.listBatches({
      userId: session.user.id,
      companyId,
      status: searchParams.get('status'),
      bankConnectionId: searchParams.get('connectionId'),
      from: searchParams.get('from') ? new Date(searchParams.get('from')!) : null,
      to: searchParams.get('to') ? new Date(searchParams.get('to')!) : null,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '12'),
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET reconciliation batches error:', error);
    return NextResponse.json({ error: 'Erro ao listar lotes de conciliação' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    if (body.action === 'refresh' && body.batchId) {
      await importBatchService.refreshCounters(body.batchId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('POST reconciliation batches error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar lote' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    if (!batchId) return NextResponse.json({ error: 'batchId obrigatório' }, { status: 400 });
    await importBatchService.deleteEmptyBatch(batchId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao excluir lote' }, { status: 422 });
  }
}
