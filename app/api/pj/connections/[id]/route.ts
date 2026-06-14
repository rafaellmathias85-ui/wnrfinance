export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, maskSecret, safeDecrypt } from '@/lib/encrypt';

const SECRET_FIELDS = new Set(['apiKey', 'clientSecret', 'secretPassword', 'accessToken', 'webhookSecret', 'token', 'password']);

function encryptConfig(config: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_FIELDS.has(key) && typeof value === 'string' && value) {
      result[key] = encrypt(value);
      result[`${key}_masked`] = maskSecret(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// PUT: update connection
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await request.json();
  const data: any = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.config !== undefined) data.config = encryptConfig(body.config);
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.status !== undefined) data.status = body.status;
  if (body.lastError !== undefined) data.lastError = body.lastError;
  if (body.lastHealthAt !== undefined) data.lastHealthAt = new Date(body.lastHealthAt);

  const updated = await prisma.companyConnection.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE: remove connection
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  await prisma.companyConnection.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}

// POST: test/healthcheck connection
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const connection = await prisma.companyConnection.findUnique({ where: { id: params.id } });
  if (!connection) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });

  const rawConfig = connection.config as any || {};
  const decrypted: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (String(key).endsWith('_masked')) continue;
    decrypted[key] = typeof value === 'string' && value.length > 32
      ? (safeDecrypt(value) ?? value) : value;
  }

  let status = 'ok';
  let error: string | null = null;
  let message = 'Conexão testada com sucesso!';

  const hasCredentials = decrypted.apiKey || decrypted.clientId || decrypted.token || decrypted.accessToken || decrypted.clientSecret;
  if (!hasCredentials) {
    status = 'atencao';
    error = 'Credenciais não configuradas. Edite a conexão e adicione as credenciais do provedor.';
    message = error;
  } else {
    // Real healthchecks per provider
    try {
      if (connection.providerKey === 'asaas') {
        const baseUrl = decrypted.environment === 'producao'
          ? 'https://api.asaas.com/v3'
          : 'https://sandbox.asaas.com/api/v3';
        const res = await fetch(`${baseUrl}/finance/balance`, {
          headers: { access_token: decrypted.apiKey },
        });
        if (!res.ok) { status = 'erro'; error = `Asaas retornou ${res.status}`; message = error; }
        else message = 'Asaas conectado com sucesso! Saldo obtido.';
      } else if (connection.providerKey === 'focusnfe') {
        const baseUrl = decrypted.environment === 'producao'
          ? 'https://api.focusnfe.com.br'
          : 'https://homologacao.focusnfe.com.br';
        const focusToken = decrypted.token || decrypted.apiKey || '';
        const encoded = Buffer.from(`${focusToken}:`).toString('base64');
        // Focus NFe não tem endpoint de ping — /v2/nfse/ping retorna 404 se autenticado, 401 se inválido
        const res = await fetch(`${baseUrl}/v2/nfse/wnrfinance-healthcheck`, {
          headers: { Authorization: `Basic ${encoded}` },
        });
        if (res.status === 401 || res.status === 403) {
          status = 'erro'; error = `Token inválido (HTTP ${res.status}) — verifique o token e o ambiente (homologação/produção)`; message = error;
        } else if (res.status >= 500) {
          status = 'atencao'; error = `Focus NFe instável (HTTP ${res.status})`; message = error;
        } else {
          // 200, 404, 422 = API alcançável e token válido
          message = 'Focus NFe conectado! Token válido e API respondendo.';
        }
      } else if (connection.providerKey === 'pluggy') {
        const res = await fetch(`${process.env.PLUGGY_API_URL || 'https://api.pluggy.ai'}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: decrypted.clientId, clientSecret: decrypted.clientSecret }),
          cache: 'no-store',
        });
        if (!res.ok) { status = 'erro'; error = `Pluggy retornou ${res.status}`; message = error; }
        else message = 'Pluggy conectado com sucesso!';
      }
    } catch (e: any) {
      status = 'erro';
      error = e.message;
      message = `Erro de rede: ${e.message}`;
    }
  }

  const updated = await prisma.companyConnection.update({
    where: { id: params.id },
    data: { status, lastHealthAt: new Date(), lastError: error },
  });

  return NextResponse.json({
    connection: updated,
    testResult: { status, message, testedAt: new Date().toISOString() },
  });
}
