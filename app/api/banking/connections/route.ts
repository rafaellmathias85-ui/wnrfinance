export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bankingController } from '@/src/modules/banking/banking.controller';
import type { BankCode, BankConnectionMode, PersonType } from '@/src/modules/banking/bank-provider.interface';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const personType = normalizePersonType(
    req.nextUrl.searchParams.get('personType') || (session.user.defaultEnv === 'pj' ? 'PJ' : 'PF'),
  );
  const companyId = personType === 'PJ' ? session.user.activeCompanyId : null;

  if (personType === 'PJ' && !companyId) {
    return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });
  }

  const connections = await bankingController.listConnections({
    userId: session.user.id,
    companyId,
    personType,
  });

  return NextResponse.json({ connections });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const bankCode = normalizeBankCode(body.bankCode);
    const personType = normalizePersonType(body.personType);
    const connectionMode = normalizeConnectionMode(body.connectionMode);
    const companyId = personType === 'PJ' ? session.user.activeCompanyId : null;

    if (personType === 'PJ' && !companyId) {
      return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });
    }

    if (personType === 'PF' && connectionMode === 'API') {
      return NextResponse.json({
        error: 'API automática ainda não disponível para esta modalidade. Use OFX/CSV como alternativa.',
      }, { status: 400 });
    }

    const connection = await bankingController.createConnection({
      userId: session.user.id,
      companyId,
      name: body.name || body.connectionName || '',
      bankCode,
      personType,
      connectionMode,
      agency: body.agency || null,
      account: body.account || body.accountNumber || null,
      accountDigit: body.accountDigit || null,
      accountId: body.accountId || null,
      ownerTaxId: body.ownerTaxId || body.cnpj || null,
      clientId: body.clientId || null,
      clientSecret: body.clientSecret || null,
      certificate: body.certificate || null,
      privateKey: body.privateKey || null,
      certificatePassword: body.certificatePassword || null,
      request: req,
    });

    return NextResponse.json({ connection }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao criar conexão bancária' }, { status: 400 });
  }
}

function normalizeBankCode(value: string): BankCode {
  const normalized = String(value || '').toUpperCase();
  if (normalized !== 'INTER' && normalized !== 'ITAU') {
    throw new Error('Banco não suportado neste MVP.');
  }
  return normalized as BankCode;
}

function normalizePersonType(value: string): PersonType {
  const normalized = String(value || '').toUpperCase();
  if (normalized !== 'PF' && normalized !== 'PJ') {
    throw new Error('Tipo de conta inválido.');
  }
  return normalized as PersonType;
}

function normalizeConnectionMode(value: string): BankConnectionMode {
  const normalized = String(value || '').toUpperCase();
  if (!['API', 'OFX', 'CSV', 'OPEN_FINANCE_FUTURE'].includes(normalized)) {
    throw new Error('Método de conexão inválido.');
  }
  return normalized as BankConnectionMode;
}
