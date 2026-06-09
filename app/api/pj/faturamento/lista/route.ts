export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type NFeRow = {
  id: string;
  receivableId: string | null;
  number: string | null;
  type: string;
  status: string;
  pdfUrl: string | null;
  xmlUrl: string | null;
  issuedAt: Date | null;
  errorMessage: string | null;
};

type BoletoRow = {
  id: string;
  receivableId: string | null;
  type: string;
  status: string;
  paidAt: Date | null;
  boletoUrl: string | null;
  pixQrCodeUrl: string | null;
};

type EmailRow = {
  id: string;
  contextId: string | null;
  to: string;
  subject: string;
  status: string;
  sentAt: Date;
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '20'));
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const sourceType = searchParams.get('sourceType') || '';

    const where: any = { companyId };
    if (status) where.status = status;
    if (sourceType) where.sourceType = sourceType;
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (from || to) {
      where.dueDate = {} as any;
      if (from) where.dueDate.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.dueDate.lte = toDate;
      }
    }

    const [total, rows] = await Promise.all([
      prisma.accountsReceivable.count({ where }),
      prisma.accountsReceivable.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          costCenter: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const ids = rows.map(r => r.id);

    // Prisma handles { in: [] } correctly — returns empty array, no ternary needed
    const [rawNfes, rawBoletos, rawEmails] = await Promise.all([
      prisma.nFe.findMany({
        where: { receivableId: { in: ids } },
        select: { id: true, receivableId: true, number: true, type: true, status: true, pdfUrl: true, xmlUrl: true, issuedAt: true, errorMessage: true },
      }),
      prisma.boletoCharge.findMany({
        where: { receivableId: { in: ids } },
        select: { id: true, receivableId: true, type: true, status: true, paidAt: true, boletoUrl: true, pixQrCodeUrl: true },
      }),
      prisma.emailLog.findMany({
        where: { contextType: 'receivable', contextId: { in: ids } },
        select: { id: true, contextId: true, to: true, subject: true, status: true, sentAt: true },
      }),
    ]);

    const nfes = rawNfes as NFeRow[];
    const boletos = rawBoletos as BoletoRow[];
    const emails = rawEmails as EmailRow[];

    // Build lookup maps
    const nfeMap = new Map<string, NFeRow>();
    for (const n of nfes) {
      if (n.receivableId && !nfeMap.has(n.receivableId)) nfeMap.set(n.receivableId, n);
    }

    const boletoMap = new Map<string, BoletoRow>();
    for (const b of boletos) {
      if (b.receivableId && !boletoMap.has(b.receivableId)) boletoMap.set(b.receivableId, b);
    }

    const emailMap = new Map<string, EmailRow[]>();
    for (const e of emails) {
      if (!e.contextId) continue;
      const key = e.contextId;
      const existing = emailMap.get(key);
      if (existing) existing.push(e);
      else emailMap.set(key, [e]);
    }

    const items = rows.map(row => {
      const nfe = nfeMap.get(row.id) ?? null;
      const boleto = boletoMap.get(row.id) ?? null;
      const logs = emailMap.get(row.id) ?? [];

      return {
        ...row,
        nfe: nfe ? { id: nfe.id, number: nfe.number, type: nfe.type, status: nfe.status, pdfUrl: nfe.pdfUrl, xmlUrl: nfe.xmlUrl, issuedAt: nfe.issuedAt, errorMessage: nfe.errorMessage } : null,
        boleto: boleto ? { id: boleto.id, type: boleto.type, status: boleto.status, paidAt: boleto.paidAt, boletoUrl: boleto.boletoUrl, pixQrCodeUrl: boleto.pixQrCodeUrl } : null,
        emailSent: logs.length > 0,
        emailLogs: logs.map(l => ({ id: l.id, to: l.to, subject: l.subject, status: l.status, sentAt: l.sentAt })),
      };
    });

    return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    console.error('[pj/faturamento/lista GET]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
