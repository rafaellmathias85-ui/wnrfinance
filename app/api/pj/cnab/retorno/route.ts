export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseCnab240Retorno } from '@/lib/cnab';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const url = new URL(req.url);
  const confirm = url.searchParams.get('confirm') === 'true';

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });

  const content = await file.text();
  let items;
  try {
    items = parseCnab240Retorno(content);
  } catch (err: any) {
    return NextResponse.json({ error: `Erro ao processar arquivo: ${err.message}` }, { status: 400 });
  }

  const paid = items.filter((i) => i.success);
  const errors = items.filter((i) => !i.success);

  if (!confirm) {
    return NextResponse.json({ preview: true, items, paid: paid.length, errors: errors.length, total: items.length });
  }

  // Apply: mark boletos as paid
  let processed = 0;
  let failed = 0;

  for (const item of paid) {
    try {
      const boleto = await prisma.boletoCharge.findFirst({
        where: { providerChargeId: item.nossoNumero, companyId },
      });

      if (!boleto) continue;

      await prisma.boletoCharge.update({
        where: { id: boleto.id },
        data: {
          status: 'pago',
          paidAt: item.paidDate || new Date(),
        },
      });

      // Also mark receivable as received
      if (boleto.receivableId) {
        await prisma.accountsReceivable.update({
          where: { id: boleto.receivableId },
          data: { status: 'recebido', receivedAt: item.paidDate || new Date() },
        });
      }

      processed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: items.length,
    paid: paid.length,
    processed,
    failed,
    errors: errors.length,
  });
}
