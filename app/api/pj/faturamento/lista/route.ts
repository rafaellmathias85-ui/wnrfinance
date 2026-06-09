import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = (session.user as any).activeCompanyId;
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
      where.dueDate = {};
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
          category: { select: { id: true, name: true, color: true } },
          costCenter: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const ids = rows.map(r => r.id);

    const [nfes, boletos, emailLogs] = await Promise.all([
      ids.length > 0
        ? prisma.nFe.findMany({
            where: { receivableId: { in: ids } },
            select: {
              id: true,
              receivableId: true,
              number: true,
              type: true,
              status: true,
              pdfUrl: true,
              xmlUrl: true,
              issuedAt: true,
              errorMessage: true,
            },
          })
        : Promise.resolve([]),
      ids.length > 0
        ? prisma.boletoCharge.findMany({
            where: { receivableId: { in: ids } },
            select: {
              id: true,
              receivableId: true,
              type: true,
              status: true,
              paidAt: true,
              boletoUrl: true,
              pixQrCodeUrl: true,
            },
          })
        : Promise.resolve([]),
      ids.length > 0
        ? prisma.emailLog.findMany({
            where: { contextType: 'receivable', contextId: { in: ids } },
            select: {
              id: true,
              contextId: true,
              to: true,
              subject: true,
              status: true,
              sentAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // Build lookup maps - first entry per receivableId
    const nfeMap = new Map<string, (typeof nfes)[number]>();
    for (const n of nfes) {
      if (n.receivableId && !nfeMap.has(n.receivableId)) {
        nfeMap.set(n.receivableId, n);
      }
    }

    const boletoMap = new Map<string, (typeof boletos)[number]>();
    for (const b of boletos) {
      if (b.receivableId && !boletoMap.has(b.receivableId)) {
        boletoMap.set(b.receivableId, b);
      }
    }

    const emailMap = new Map<string, (typeof emailLogs)>();
    for (const e of emailLogs) {
      if (!e.contextId) continue;
      if (!emailMap.has(e.contextId)) emailMap.set(e.contextId, []);
      emailMap.get(e.contextId)!.push(e);
    }

    const items = rows.map(row => {
      const nfe = nfeMap.get(row.id) ?? null;
      const boleto = boletoMap.get(row.id) ?? null;
      const logs = emailMap.get(row.id) ?? [];

      return {
        ...row,
        nfe: nfe
          ? {
              id: nfe.id,
              number: nfe.number,
              status: nfe.status,
              pdfUrl: nfe.pdfUrl,
              xmlUrl: nfe.xmlUrl,
              issuedAt: nfe.issuedAt,
              errorMessage: nfe.errorMessage,
              type: nfe.type,
            }
          : null,
        boleto: boleto
          ? {
              id: boleto.id,
              type: boleto.type,
              status: boleto.status,
              paidAt: boleto.paidAt,
              boletoUrl: boleto.boletoUrl,
              pixQrCodeUrl: boleto.pixQrCodeUrl,
            }
          : null,
        emailSent: logs.length > 0,
        emailLogs: logs.map(l => ({
          id: l.id,
          to: l.to,
          subject: l.subject,
          status: l.status,
          sentAt: l.sentAt,
        })),
      };
    });

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('[pj/faturamento/lista GET]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
