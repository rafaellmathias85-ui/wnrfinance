export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateCnab240, type BankInfo, type BoletoItem } from '@/lib/cnab';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { boletoIds, bankConnectionId } = body;

  if (!Array.isArray(boletoIds) || boletoIds.length === 0) {
    return NextResponse.json({ error: 'boletoIds[] é obrigatório' }, { status: 400 });
  }

  // Load company data
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });

  // Load bank connection
  let bankConn: any = null;
  if (bankConnectionId) {
    bankConn = await prisma.bankConnection.findFirst({ where: { id: bankConnectionId, companyId } });
  }

  // Load boletos
  const boletos = await prisma.boletoCharge.findMany({
    where: { id: { in: boletoIds }, companyId, status: { not: 'cancelado' } },
  });

  if (boletos.length === 0) {
    return NextResponse.json({ error: 'Nenhum boleto válido encontrado' }, { status: 404 });
  }

  const bankInfo: BankInfo = {
    code: (bankConn as any)?.bankCode || '033',
    cnpj: company.cnpj || '00000000000000',
    agencia: (bankConn as any)?.agencia || '00001',
    conta: (bankConn as any)?.conta || '000000000',
    nome: company.name,
    convenio: (bankConn as any)?.convenio || '000000000000',
  };

  const items: BoletoItem[] = boletos.map((b) => ({
    id: b.id,
    nossoNumero: b.providerChargeId || b.id.slice(0, 20),
    amount: b.amount,
    dueDate: b.dueDate || new Date(),
    customerName: b.customerName || 'CLIENTE',
    customerDoc: b.customerDoc || '00000000000',
  }));

  try {
    const cnabContent = generateCnab240(bankInfo, items);
    const filename = `remessa_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.rem`;

    return new NextResponse(cnabContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao gerar CNAB' }, { status: 500 });
  }
}
