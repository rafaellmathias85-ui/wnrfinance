export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, maskSecret, safeDecrypt } from '@/lib/encrypt';
import { pluggy } from '@/lib/open-finance';

function readConfig(config: unknown): Record<string, any> {
  return (config && typeof config === 'object' ? config : {}) as Record<string, any>;
}

function readSecret(value: unknown): string {
  if (typeof value !== 'string') return '';
  return safeDecrypt(value) ?? value;
}

function publicConfig(config: Record<string, any>) {
  const clientId = String(config.clientId || '');
  const clientSecret = readSecret(config.clientSecret);
  return {
    clientId,
    clientSecretMasked: clientSecret ? (String(config.clientSecret_masked || '') || maskSecret(clientSecret)) : null,
    hasClientSecret: !!clientSecret,
  };
}

async function findPluggyConnection(companyId: string) {
  return prisma.companyConnection.findFirst({
    where: { companyId, providerKey: 'pluggy', isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

    const connection = await findPluggyConnection(companyId);
    const configured = await pluggy.isConfiguredForCompany(companyId);
    let healthy = false;
    let error: string | null = null;

    if (configured) {
      try {
        await pluggy.getApiKey(companyId);
        healthy = true;
      } catch (e: any) {
        error = e?.message?.slice(0, 300) || 'Erro ao autenticar com Pluggy';
      }
    }

    const config = readConfig(connection?.config);
    return NextResponse.json({
      configured,
      healthy,
      error,
      connection: connection ? {
        id: connection.id,
        status: connection.status,
        lastHealthAt: connection.lastHealthAt,
        lastError: connection.lastError,
        ...publicConfig(config),
      } : null,
    });
  } catch (error: any) {
    console.error('[integrations/pluggy:get]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId || '').trim();
    const clientSecret = String(body.clientSecret || '').trim();

    const existing = await findPluggyConnection(companyId);
    const previousConfig = readConfig(existing?.config);
    const previousSecret = readSecret(previousConfig.clientSecret);
    const nextSecret = clientSecret || previousSecret;

    if (!clientId || !nextSecret) {
      return NextResponse.json({ error: 'Client ID e Client Secret sao obrigatorios' }, { status: 400 });
    }

    const config = {
      clientId,
      clientSecret: clientSecret ? encrypt(clientSecret) : previousConfig.clientSecret,
      clientSecret_masked: maskSecret(nextSecret),
    };

    const data = {
      displayName: 'Pluggy - Open Finance Brasil',
      providerKey: 'pluggy',
      category: 'banco',
      config,
      status: 'pendente',
      lastError: null,
      isActive: true,
    };

    const connection = existing
      ? await prisma.companyConnection.update({ where: { id: existing.id }, data })
      : await prisma.companyConnection.create({ data: { companyId, ...data } });

    let healthy = false;
    let error: string | null = null;
    try {
      await pluggy.getApiKey(companyId);
      healthy = true;
    } catch (e: any) {
      error = e?.message?.slice(0, 300) || 'Erro ao autenticar com Pluggy';
    }

    const updated = await prisma.companyConnection.update({
      where: { id: connection.id },
      data: {
        status: healthy ? 'ok' : 'erro',
        lastHealthAt: new Date(),
        lastError: error,
      },
    });

    return NextResponse.json({
      configured: true,
      healthy,
      error,
      connection: {
        id: updated.id,
        status: updated.status,
        lastHealthAt: updated.lastHealthAt,
        lastError: updated.lastError,
        ...publicConfig(readConfig(updated.config)),
      },
    });
  } catch (error: any) {
    console.error('[integrations/pluggy:put]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
