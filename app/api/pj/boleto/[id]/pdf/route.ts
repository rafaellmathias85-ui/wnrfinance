export const dynamic = 'force-dynamic';

/**
 * GET /api/pj/boleto/[id]/pdf
 *
 * Serve o PDF do boleto Itaú. Fluxo:
 *  1. Se boletoUrl já está armazenada → redireciona.
 *  2. Caso contrário, chama o endpoint de consulta do Itaú (mTLS nativo)
 *     para obter url_boleto, persiste no registro e redireciona.
 *  3. Se nada disponível → 404.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveItauBoletoUrl } from '@/lib/boleto';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const companyId = (session.user as any).activeCompanyId as string | undefined;
  if (!companyId) {
    return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });
  }

  const charge = await prisma.boletoCharge.findFirst({
    where: { id: params.id, companyId },
  });

  if (!charge) {
    return NextResponse.json({ error: 'Cobrança não encontrada' }, { status: 404 });
  }

  // Já temos a URL → redireciona
  if (charge.boletoUrl) {
    return NextResponse.redirect(charge.boletoUrl);
  }

  if (!charge.nossoNumero || charge.providerKey !== 'itau') {
    return NextResponse.json({ error: 'PDF não disponível para esta cobrança' }, { status: 404 });
  }

  try {
    const pdfUrl = await resolveItauBoletoUrl(companyId, charge.id, charge.nossoNumero);
    if (pdfUrl) {
      // Limpa errorMessage ao conseguir a URL
      await prisma.boletoCharge.update({ where: { id: charge.id }, data: { errorMessage: null } }).catch(() => {});
      return NextResponse.redirect(pdfUrl);
    }
    const msg = 'PDF não encontrado no Itaú — tente novamente em alguns minutos';
    await prisma.boletoCharge.update({ where: { id: charge.id }, data: { errorMessage: msg } }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 404 });
  } catch (err: any) {
    const msg = `Erro ao consultar Itaú: ${err?.message?.slice(0, 200)}`;
    console.error('[boleto/pdf]', msg);
    await prisma.boletoCharge.update({ where: { id: charge.id }, data: { errorMessage: msg } }).catch(() => {});
    return NextResponse.json({ error: 'Erro ao buscar PDF no Itaú' }, { status: 502 });
  }
}
