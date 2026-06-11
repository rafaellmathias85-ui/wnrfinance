export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bankingController } from '@/src/modules/banking/banking.controller';
import { BankCredentialsVaultService } from '@/src/modules/banking/bank-credentials-vault.service';
import { prisma } from '@/lib/prisma';

const vault = new BankCredentialsVaultService();

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const connection = await prisma.bankConnection.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!connection) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });

  return NextResponse.json({ connection });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const companyId =
    body.personType === 'PF'
      ? null
      : session.user.defaultEnv === 'pj'
        ? session.user.activeCompanyId || null
        : undefined;

  try {
    if (action === 'test') {
      const result = await bankingController.testConnection({
        userId: session.user.id,
        companyId,
        connectionId: params.id,
        request: req,
      });
      return NextResponse.json(result);
    }

    if (action === 'sync') {
      const result = await bankingController.syncConnection({
        userId: session.user.id,
        companyId,
        connectionId: params.id,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        request: req,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro na conexão bancária' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const connection = await prisma.bankConnection.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!connection) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });

  const credentialUpdate: Record<string, string> = {};
  if (body.clientId)     credentialUpdate.clientIdEnc     = vault.encrypt(body.clientId);
  if (body.clientSecret) credentialUpdate.clientSecretEnc = vault.encrypt(body.clientSecret);
  if (body.certificate)  credentialUpdate.certificateEnc  = vault.encrypt(body.certificate);
  if (body.privateKey)   credentialUpdate.privateKeyEnc   = vault.encrypt(body.privateKey);

  const updated = await prisma.bankConnection.update({
    where: { id: params.id },
    data: {
      ...(body.bankName !== undefined && { bankName: body.bankName }),
      ...(body.agency !== undefined && { agency: body.agency || null }),
      ...(body.accountNumber !== undefined && { accountNumber: body.accountNumber || null }),
      ...(body.accountDigit !== undefined && { accountDigit: body.accountDigit || null }),
      ...(body.openingBalance !== undefined && { openingBalance: Number(body.openingBalance) || 0 }),
      ...(body.allowsPayments !== undefined && { allowsPayments: Boolean(body.allowsPayments) }),
      ...(body.allowsReceipts !== undefined && { allowsReceipts: Boolean(body.allowsReceipts) }),
      ...(body.allowsTransfers !== undefined && { allowsTransfers: Boolean(body.allowsTransfers) }),
      ...(body.extraConfig !== undefined && { extraConfig: body.extraConfig }),
      ...credentialUpdate,
    },
  });

  return NextResponse.json({ connection: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    await bankingController.removeConnection({
      userId: session.user.id,
      companyId: session.user.defaultEnv === 'pj' ? session.user.activeCompanyId || null : undefined,
      connectionId: params.id,
      request: req,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao remover conexão' }, { status: 500 });
  }
}
