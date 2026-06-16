export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encrypt';

/**
 * GET /api/pj/nfse/debug
 * Retorna o que seria enviado ao Focus NFe sem chamar a API.
 * Útil para diagnosticar "CNPJ do emitente não autorizado".
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, cnpj: true, features: true },
  });

  const conn = await prisma.companyConnection.findFirst({
    where: { companyId, category: 'nfe', isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  let connConfig: any = null;
  if (conn) {
    const raw = conn.config as Record<string, any>;
    connConfig = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.endsWith('_masked')) continue;
      if (typeof v === 'string' && v.length > 30) {
        const dec = safeDecrypt(v);
        connConfig[k] = dec ? `${dec.slice(0, 6)}... (decifrado ok)` : '(falha ao decifrar)';
      } else {
        connConfig[k] = v;
      }
    }
  }

  const rule = await prisma.serviceFiscalRule.findFirst({
    where: { companyId, isDefault: true },
    select: {
      id: true,
      name: true,
      serviceCodeLc116: true,
      providerCityCode: true,
      providerMunicipalRegistration: true,
      issRate: true,
      issWithheld: true,
    },
  });

  const baseUrl = connConfig?.environment === 'homologacao'
    ? 'https://homologacao.focusnfe.com.br'
    : 'https://api.focusnfe.com.br';

  const companyCnpj = company?.cnpj?.replace(/\D/g, '') || '';
  const connCnpj = (connConfig?.cnpj || '').replace(/\D/g, '');

  return NextResponse.json({
    diagnostico: {
      empresa: {
        id: company?.id,
        nome: company?.name,
        cnpj_banco: companyCnpj,
        cnpj_conexao: connCnpj,
        cnpj_que_sera_enviado: companyCnpj || connCnpj || '(VAZIO - problema!)',
      },
      conexao_focusnfe: conn
        ? {
            id: conn.id,
            providerKey: conn.providerKey,
            isActive: conn.isActive,
            status: conn.status,
            environment: connConfig?.environment || '(não definido — usará PRODUCAO)',
            url_base: baseUrl,
            config_visivel: connConfig,
          }
        : '(nenhuma conexão NF-e ativa encontrada)',
      regra_fiscal_padrao: rule || '(nenhuma regra fiscal padrão cadastrada)',
      payload_prestador_que_seria_enviado: {
        cnpj: companyCnpj || connCnpj || '(VAZIO)',
        inscricao_municipal: rule?.providerMunicipalRegistration || '(VAZIO - obrigatório para NFS-e)',
        codigo_municipio: rule?.providerCityCode || '(VAZIO)',
      },
      problemas_identificados: [
        !companyCnpj && '❌ Company.cnpj está vazio no banco',
        !conn && '❌ Nenhuma conexão Focus NFe ativa',
        conn && connConfig?.environment !== 'homologacao' && '⚠️ Ambiente NÃO é homologacao — usando PRODUCAO',
        !rule && '❌ Nenhuma regra fiscal padrão (inscricao_municipal e código IBGE não definidos)',
        rule && !rule.providerMunicipalRegistration && '❌ Inscrição Municipal não definida na regra fiscal',
        rule && !rule.providerCityCode && '❌ Código IBGE do município não definido na regra fiscal',
      ].filter(Boolean),
    },
  });
}
