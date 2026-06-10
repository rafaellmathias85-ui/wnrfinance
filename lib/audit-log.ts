import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'EXPORT' | 'IMPORT'
  | 'VIEW' | 'APPROVE' | 'REJECT'
  | 'SEND' | 'CANCEL' | 'PAY'
  | 'BANK_CONNECTION_CREATE'
  | 'BANK_CONNECTION_TEST'
  | 'BANK_SYNC_MANUAL'
  | 'BANK_SYNC_AUTO'
  | 'BANK_CONNECTION_ERROR'
  | 'BANK_CONNECTION_REVOKE';

export type AuditEntity =
  | 'expense' | 'income' | 'credit_card' | 'investment' | 'savings'
  | 'payable' | 'receivable' | 'nfe' | 'boleto' | 'pix'
  | 'bank' | 'reconciliation' | 'tax_record' | 'carne_leao'
  | 'bank_connection'
  | 'user' | 'company' | 'permission' | 'subscription'
  | 'category' | 'cost_center' | 'tag'
  | 'product' | 'stock' | 'sales_order'
  | 'report' | 'statement' | 'ai_chat';

interface AuditOptions {
  userId: string;
  companyId?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  request?: Request;
}

export async function createAuditLog(opts: AuditOptions): Promise<void> {
  try {
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    if (opts.request) {
      headers(); // ensure request context is active
      ipAddress =
        opts.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        opts.request.headers.get('x-real-ip') ||
        null;
      userAgent = opts.request.headers.get('user-agent') || null;
    }

    await prisma.auditLog.create({
      data: {
        userId: opts.userId,
        companyId: opts.companyId || null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId || null,
        oldData: opts.oldData as any || null,
        newData: opts.newData as any || null,
        ipAddress,
        userAgent,
        metadata: opts.metadata as any || null,
      },
    });
  } catch (err) {
    // Never throw from audit log — it must not break main flows
    console.error('[AuditLog] Failed to write:', err);
  }
}

export async function getAuditLogs(opts: {
  userId?: string;
  companyId?: string;
  entity?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const { page = 1, limit = 50 } = opts;
  const where: any = {};

  if (opts.userId) where.userId = opts.userId;
  if (opts.companyId) where.companyId = opts.companyId;
  if (opts.entity) where.entity = opts.entity;
  if (opts.action) where.action = opts.action;
  if (opts.startDate || opts.endDate) {
    where.createdAt = {};
    if (opts.startDate) where.createdAt.gte = opts.startDate;
    if (opts.endDate) where.createdAt.lte = opts.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total, page, limit, pages: Math.ceil(total / limit) };
}
