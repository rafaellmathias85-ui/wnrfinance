export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encrypt';
import { configurarEmitente, uploadCertificado } from '@/lib/focusnfe';

function crtFromRegime(regime: string): '1' | '2' | '3' {
  if (regime === 'simples_nacional' || regime === 'mei') return '1';
  return '3';
}

function decryptConfig(config: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith('_masked')) continue;
    result[key] = typeof value === 'string' && value.length > 30
      ? (safeDecrypt(value) ?? value)
      : value;
  }
  return result;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const uc = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId } },
  });
  if (!uc || !['OWNER', 'ADMIN'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  const conn = await prisma.companyConnection.findFirst({
    where: { companyId, category: 'nfe', providerKey: 'focusnfe', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!conn) {
    return NextResponse.json({ error: 'Conexão Focus NFe não encontrada. Configure em Integrações → NF-e.' }, { status: 400 });
  }

  const config = decryptConfig(conn.config as Record<string, any>);
  const { apiKey } = config;
  if (!apiKey) {
    return NextResponse.json({ error: 'Token Focus NFe não configurado na conexão.' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { cnpj: true, name: true, tradeName: true, phone: true, features: true },
  });
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

  const fiscal = (company.features as any)?.fiscal ?? {};
  const cnpjClean = company.cnpj.replace(/\D/g, '');

  if (action === 'configurar_emitente') {
    const end = fiscal.endereco ?? {};
    try {
      const result = await configurarEmitente(apiKey, {
        cnpj: cnpjClean,
        nome: company.name,
        nome_fantasia: company.tradeName || undefined,
        inscricao_estadual: fiscal.inscricaoEstadual || 'ISENTO',
        crt: crtFromRegime(fiscal.regimeTributario ?? ''),
        logradouro: end.logradouro || 'Não informado',
        numero: end.numero || 'S/N',
        bairro: end.bairro || 'Não informado',
        municipio: end.municipio || 'Não informado',
        uf: end.uf || 'SP',
        cep: (end.cep || '').replace(/\D/g, ''),
        telefone: company.phone?.replace(/\D/g, '') || undefined,
      });
      return NextResponse.json({ ok: true, result });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  if (action === 'upload_certificado') {
    const { pfxBase64, password } = body;
    if (!pfxBase64 || !password) {
      return NextResponse.json({ error: 'pfxBase64 e password são obrigatórios.' }, { status: 400 });
    }
    try {
      const result = await uploadCertificado(apiKey, cnpjClean, pfxBase64, password);
      return NextResponse.json({ ok: true, result });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: `Ação "${action}" não reconhecida.` }, { status: 400 });
}
