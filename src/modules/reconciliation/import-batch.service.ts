// Lotes de importação de extrato (paridade BomControle: "Arquivos de conciliação").
// Todo sync de API ou importação OFX/CSV cria um ImportBatch; os contadores
// Conciliados/Ignorados/Pendentes são derivados do status das transações do lote.

import { prisma } from '@/lib/prisma';

export interface CreateBatchParams {
  userId: string;
  companyId?: string | null;
  bankConnectionId?: string | null;
  source: string; // API_INTER, API_ITAU, OFX, CSV, MANUAL
  type: 'AUTOMATICO' | 'MANUAL';
  periodStart?: Date | null;
  periodEnd?: Date | null;
  fileName?: string | null;
}

export class ImportBatchService {
  async createBatch(params: CreateBatchParams) {
    return prisma.importBatch.create({
      data: {
        userId: params.userId,
        companyId: params.companyId || null,
        bankConnectionId: params.bankConnectionId || null,
        source: params.source,
        type: params.type,
        status: 'PENDENTE',
        periodStart: params.periodStart || null,
        periodEnd: params.periodEnd || null,
        fileName: params.fileName || null,
      },
    });
  }

  /**
   * Recalcula os contadores do lote a partir do status real das transações.
   * Idempotente — pode ser chamado após qualquer mudança de status.
   * Lotes sem transações (sync que não trouxe nada) ficam CONCILIADO com total 0.
   */
  async refreshCounters(batchId: string): Promise<void> {
    const groups = await prisma.bankTransaction.groupBy({
      by: ['status'],
      where: { importBatchId: batchId },
      _count: { _all: true },
    });

    const count = (status: string) =>
      groups.find((g) => g.status === status)?._count._all ?? 0;

    const reconciled = count('RECONCILED');
    const ignored = count('IGNORED');
    const pending = count('PENDING') + count('SUGGESTED');
    const total = reconciled + ignored + pending;

    const status = pending === 0 ? 'CONCILIADO' : reconciled + ignored > 0 ? 'PARCIAL' : 'PENDENTE';

    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        totalCount: total,
        reconciledCount: reconciled,
        ignoredCount: ignored,
        pendingCount: pending,
        status,
        finishedAt: status === 'CONCILIADO' ? new Date() : null,
      },
    });
  }

  /** Atualiza o período do lote a partir das datas reais das transações importadas. */
  async refreshPeriod(batchId: string): Promise<void> {
    const agg = await prisma.bankTransaction.aggregate({
      where: { importBatchId: batchId },
      _min: { date: true },
      _max: { date: true },
    });
    if (agg._min.date && agg._max.date) {
      await prisma.importBatch.update({
        where: { id: batchId },
        data: { periodStart: agg._min.date, periodEnd: agg._max.date },
      });
    }
  }

  /** Lista lotes com filtros (tela "Arquivos de conciliação"). */
  async listBatches(params: {
    userId: string;
    companyId?: string | null;
    status?: string | null;
    bankConnectionId?: string | null;
    from?: Date | null;
    to?: Date | null;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 12));
    const where: any = { userId: params.userId };
    if (params.companyId !== undefined) where.companyId = params.companyId;
    if (params.status) where.status = params.status;
    if (params.bankConnectionId) where.bankConnectionId = params.bankConnectionId;
    if (params.from || params.to) {
      where.createdAt = {
        ...(params.from ? { gte: params.from } : {}),
        ...(params.to ? { lte: params.to } : {}),
      };
    }

    const [batches, total] = await Promise.all([
      prisma.importBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.importBatch.count({ where }),
    ]);

    // Enriquecer com dados da conexão bancária (banco, agência, conta)
    const connectionIds = Array.from(
      new Set(batches.map((b) => b.bankConnectionId).filter(Boolean) as string[]),
    );
    const connections = connectionIds.length
      ? await prisma.bankConnection.findMany({
          where: { id: { in: connectionIds } },
          select: { id: true, bankName: true, bankCode: true, agency: true, accountNumber: true, accountDigit: true },
        })
      : [];
    const connMap = new Map(connections.map((c) => [c.id, c]));

    return {
      batches: batches.map((b) => ({
        ...b,
        connection: b.bankConnectionId ? connMap.get(b.bankConnectionId) || null : null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /** Exclui um lote VAZIO (sem transações) — proteção contra perda de dados. */
  async deleteEmptyBatch(batchId: string, userId: string): Promise<void> {
    const txCount = await prisma.bankTransaction.count({ where: { importBatchId: batchId } });
    if (txCount > 0) {
      throw new Error('Lote possui transações — não pode ser excluído.');
    }
    await prisma.importBatch.deleteMany({ where: { id: batchId, userId } });
  }
}

export const importBatchService = new ImportBatchService();
